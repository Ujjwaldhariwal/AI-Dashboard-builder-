import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'

import { introspectPostgresSchema, testPostgresConnection } from '@/lib/data-sources/postgres-runtime'
import { columnsFromIntrospectionRows, persistGuidedProfileForColumns } from '@/lib/dashboardos/guided-review-store'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { invalidateSemanticDependentsForDataSource } from '@/lib/semantic/semantic-hardening'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { PostgresTableMetadata } from '@/lib/data-sources/postgres-runtime'

const SCHEMA_REFRESH_TTL_MS = 24 * 60 * 60 * 1000

function schemaHashForTables(tables: PostgresTableMetadata[]) {
  const canonical = tables
    .map(table => ({
      schemaName: table.schemaName,
      tableName: table.tableName,
      tableType: table.tableType,
      columns: table.columns.map(column => ({
        columnName: column.columnName,
        ordinalPosition: column.ordinalPosition,
        dataType: column.dataType,
        udtName: column.udtName,
        isNullable: column.isNullable,
        columnDefault: column.columnDefault ?? null,
      })),
    }))
    .sort((left, right) => `${left.schemaName}.${left.tableName}`.localeCompare(`${right.schemaName}.${right.tableName}`))

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const nowIso = new Date().toISOString()
  const startedAt = Date.now()

  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ tables: [], columnCount: 0, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: source, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, tenant_id, project_id, credential_ciphertext')
      .eq('id', id)
      .single()

    if (sourceError) {
      return NextResponse.json({ tables: [], columnCount: 0, error: sourceError.message }, { status: 404 })
    }

    const row = source as Record<string, unknown>
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ tables: [], columnCount: 0, error: access.error }, { status: access.status })
    }

    const ciphertext = typeof row.credential_ciphertext === 'string' ? row.credential_ciphertext : ''
    if (!ciphertext) {
      return NextResponse.json({ tables: [], columnCount: 0, error: 'Missing encrypted credentials' }, { status: 409 })
    }

    try {
      const [test, tables] = await Promise.all([
        testPostgresConnection(ciphertext),
        introspectPostgresSchema(ciphertext),
      ])
      const columns = tables.flatMap(table => table.columns.map(column => ({
        tenant_id: row.tenant_id,
        project_id: row.project_id,
        data_source_id: id,
        schema_name: column.schemaName,
        table_name: column.tableName,
        column_name: column.columnName,
        ordinal_position: column.ordinalPosition,
        data_type: column.dataType,
        udt_name: column.udtName,
        is_nullable: column.isNullable,
        column_default: column.columnDefault ?? null,
      })))
      const schemaHash = schemaHashForTables(tables)
      const refreshAfter = new Date(Date.now() + SCHEMA_REFRESH_TTL_MS).toISOString()

      const { error: deleteError } = await auth.supabase
        .from('data_source_columns')
        .delete()
        .eq('data_source_id', id)

      if (deleteError) {
        return NextResponse.json({ tables: [], columnCount: 0, error: deleteError.message }, { status: 500 })
      }

      if (columns.length > 0) {
        const { error: insertError } = await auth.supabase
          .from('data_source_columns')
          .insert(columns)

        if (insertError) {
          return NextResponse.json({ tables: [], columnCount: 0, error: insertError.message }, { status: 500 })
        }
      }

      await auth.supabase
        .from('data_sources')
        .update({
          status: 'active',
          last_tested_at: nowIso,
          last_test_status: 'ok',
          last_error: null,
          schema_last_introspected_at: nowIso,
          schema_last_status: 'ok',
          schema_last_error: null,
          schema_hash: schemaHash,
          schema_table_count: tables.length,
          schema_column_count: columns.length,
          schema_refresh_after: refreshAfter,
          schema_refresh_requested_at: null,
          schema_refresh_reason: null,
          updated_at: nowIso,
        })
        .eq('id', id)

      await invalidateSemanticDependentsForDataSource({
        supabase: auth.supabase,
        tenantId: String(row.tenant_id),
        projectId: String(row.project_id),
        dataSourceId: id,
        actorUserId: auth.userId,
      })

      const guidedProfile = await persistGuidedProfileForColumns({
        supabase: auth.supabase,
        tenantId: String(row.tenant_id),
        projectId: String(row.project_id),
        dataSourceId: id,
        schemaHash,
        columns: columnsFromIntrospectionRows({
          dataSourceId: id,
          columns: tables.flatMap(table => table.columns),
        }),
      })

      await Promise.all([
        auth.supabase
          .from('data_source_schema_runs')
          .insert({
            tenant_id: row.tenant_id,
            project_id: row.project_id,
            data_source_id: id,
            status: 'ok',
            schema_hash: schemaHash,
            table_count: tables.length,
            column_count: columns.length,
            started_at: nowIso,
            finished_at: new Date().toISOString(),
            elapsed_ms: Math.max(0, Date.now() - startedAt),
            triggered_by: auth.userId,
            trigger_source: 'manual',
            metadata: { latencyMs: test.latencyMs },
          }),
        auth.supabase
          .from('audit_logs')
          .insert({
            tenant_id: row.tenant_id,
            project_id: row.project_id,
            actor_user_id: auth.userId,
            action: 'data_source.updated',
            target_type: 'data_source',
            target_id: id,
            metadata: {
              event: 'schema_introspection',
              ok: true,
              tableCount: tables.length,
              columnCount: columns.length,
              schemaHash,
              latencyMs: test.latencyMs,
            },
            created_at: nowIso,
          }),
      ])

      return NextResponse.json({
        tables,
        columnCount: columns.length,
        schemaHash,
        refreshAfter,
        guidedProfile,
      })
    } catch (introspectionError) {
      const message = introspectionError instanceof Error ? introspectionError.message : String(introspectionError)
      const finishedAt = new Date().toISOString()
      await Promise.all([
        auth.supabase
          .from('data_sources')
          .update({
            status: 'error',
            last_tested_at: nowIso,
            last_test_status: 'error',
            last_error: message,
            schema_last_status: 'error',
            schema_last_error: message,
            schema_refresh_requested_at: nowIso,
            schema_refresh_reason: 'last_introspection_failed',
            updated_at: finishedAt,
          })
          .eq('id', id),
        auth.supabase
          .from('data_source_schema_runs')
          .insert({
            tenant_id: row.tenant_id,
            project_id: row.project_id,
            data_source_id: id,
            status: 'error',
            started_at: nowIso,
            finished_at: finishedAt,
            elapsed_ms: Math.max(0, Date.now() - startedAt),
            error_message: message,
            triggered_by: auth.userId,
            trigger_source: 'manual',
          }),
        auth.supabase
          .from('audit_logs')
          .insert({
            tenant_id: row.tenant_id,
            project_id: row.project_id,
            actor_user_id: auth.userId,
            action: 'data_source.updated',
            target_type: 'data_source',
            target_id: id,
            metadata: { event: 'schema_introspection', ok: false, error: message },
            created_at: finishedAt,
          }),
      ])

      return NextResponse.json({ tables: [], columnCount: 0, error: message }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ tables: [], columnCount: 0, error: message }, { status: 500 })
  }
}
