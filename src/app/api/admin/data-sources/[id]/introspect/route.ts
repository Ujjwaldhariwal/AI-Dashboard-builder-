import { NextResponse } from 'next/server'

import { introspectPostgresSchema, testPostgresConnection } from '@/lib/data-sources/postgres-runtime'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const nowIso = new Date().toISOString()

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

    if (columns.length > 0) {
      const { error: upsertError } = await auth.supabase
        .from('data_source_columns')
        .upsert(columns, {
          onConflict: 'data_source_id,schema_name,table_name,column_name',
        })

      if (upsertError) {
        return NextResponse.json({ tables: [], columnCount: 0, error: upsertError.message }, { status: 500 })
      }
    }

    await auth.supabase
      .from('data_sources')
      .update({
        status: 'active',
        last_tested_at: nowIso,
        last_test_status: 'ok',
        last_error: null,
        updated_at: nowIso,
      })
      .eq('id', id)

    await auth.supabase
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
          latencyMs: test.latencyMs,
        },
        created_at: nowIso,
      })

    return NextResponse.json({
      tables,
      columnCount: columns.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ tables: [], columnCount: 0, error: message }, { status: 500 })
  }
}
