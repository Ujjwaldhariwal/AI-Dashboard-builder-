import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  introspectPostgresSchema,
  testPostgresConnection,
  type PostgresTableMetadata,
} from '@/lib/data-sources/postgres-runtime'
import { columnsFromIntrospectionRows, persistGuidedProfileForColumns } from '@/lib/dashboardos/guided-review-store'
import { invalidateSemanticDependentsForDataSource } from '@/lib/semantic/semantic-hardening'

const SCHEMA_REFRESH_TTL_MS = 24 * 60 * 60 * 1000

export interface SchemaIntrospectionRunResult {
  dataSourceId: string
  tenantId: string
  projectId: string
  tableCount: number
  columnCount: number
  schemaHash: string
  refreshAfter: string
  latencyMs: number
}

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

export async function runDataSourceSchemaIntrospection({
  supabase,
  dataSourceId,
  triggeredBy = null,
  triggerSource = 'scheduled',
}: {
  supabase: SupabaseClient
  dataSourceId: string
  triggeredBy?: string | null
  triggerSource?: 'manual' | 'scheduled' | 'api'
}): Promise<SchemaIntrospectionRunResult> {
  const nowIso = new Date().toISOString()
  const startedAt = Date.now()

  const { data: source, error: sourceError } = await supabase
    .from('data_sources')
    .select('id, tenant_id, project_id, credential_ciphertext')
    .eq('id', dataSourceId)
    .single()

  if (sourceError || !source) {
    throw new Error(sourceError?.message ?? 'Data source not found')
  }

  const row = source as Record<string, unknown>
  const tenantId = String(row.tenant_id)
  const projectId = String(row.project_id)
  const ciphertext = typeof row.credential_ciphertext === 'string' ? row.credential_ciphertext : ''
  if (!ciphertext) throw new Error('Missing encrypted credentials')

  try {
    const [test, tables] = await Promise.all([
      testPostgresConnection(ciphertext),
      introspectPostgresSchema(ciphertext),
    ])
    const columns = tables.flatMap(table => table.columns.map(column => ({
      tenant_id: tenantId,
      project_id: projectId,
      data_source_id: dataSourceId,
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

    const { error: deleteError } = await supabase
      .from('data_source_columns')
      .delete()
      .eq('data_source_id', dataSourceId)

    if (deleteError) throw new Error(deleteError.message)

    if (columns.length > 0) {
      const { error: insertError } = await supabase
        .from('data_source_columns')
        .insert(columns)

      if (insertError) throw new Error(insertError.message)
    }

    await supabase
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
      .eq('id', dataSourceId)

    await invalidateSemanticDependentsForDataSource({
      supabase,
      tenantId,
      projectId,
      dataSourceId,
      actorUserId: triggeredBy,
    })

    await persistGuidedProfileForColumns({
      supabase,
      tenantId,
      projectId,
      dataSourceId,
      schemaHash,
      columns: columnsFromIntrospectionRows({
        dataSourceId,
        columns: tables.flatMap(table => table.columns),
      }),
    })

    const finishedAt = new Date().toISOString()
    await supabase
      .from('data_source_schema_runs')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        data_source_id: dataSourceId,
        status: 'ok',
        schema_hash: schemaHash,
        table_count: tables.length,
        column_count: columns.length,
        started_at: nowIso,
        finished_at: finishedAt,
        elapsed_ms: Math.max(0, Date.now() - startedAt),
        triggered_by: triggeredBy,
        trigger_source: triggerSource,
        metadata: { latencyMs: test.latencyMs },
      })

    return {
      dataSourceId,
      tenantId,
      projectId,
      tableCount: tables.length,
      columnCount: columns.length,
      schemaHash,
      refreshAfter,
      latencyMs: test.latencyMs,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const finishedAt = new Date().toISOString()

    await Promise.all([
      supabase
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
        .eq('id', dataSourceId),
      supabase
        .from('data_source_schema_runs')
        .insert({
          tenant_id: tenantId,
          project_id: projectId,
          data_source_id: dataSourceId,
          status: 'error',
          started_at: nowIso,
          finished_at: finishedAt,
          elapsed_ms: Math.max(0, Date.now() - startedAt),
          error_message: message,
          triggered_by: triggeredBy,
          trigger_source: triggerSource,
        }),
    ])

    throw error
  }
}
