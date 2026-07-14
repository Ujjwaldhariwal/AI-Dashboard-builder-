import { NextResponse } from 'next/server'

import {
  runDataSourceSchemaIntrospection,
  SchemaIntrospectionIncompleteError,
} from '@/lib/data-sources/schema-introspection-runner'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ tables: [], tableCount: 0, columnCount: 0, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: source, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, tenant_id, project_id')
      .eq('id', id)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ tables: [], tableCount: 0, columnCount: 0, error: sourceError?.message ?? 'Data source not found' }, { status: 404 })
    }

    const row = source as Record<string, unknown>
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ tables: [], tableCount: 0, columnCount: 0, error: access.error }, { status: access.status })
    }

    const result = await runDataSourceSchemaIntrospection({
      supabase: auth.supabase,
      dataSourceId: id,
      triggeredBy: auth.userId,
      triggerSource: 'manual',
    })

    await auth.supabase.from('audit_logs').insert({
      tenant_id: result.tenantId,
      project_id: result.projectId,
      actor_user_id: auth.userId,
      action: 'data_source.updated',
      target_type: 'data_source',
      target_id: id,
      metadata: {
        event: 'schema_introspection',
        ok: true,
        complete: result.complete,
        schemaChanged: result.schemaChanged,
        noOp: result.noOp,
        tableCount: result.tableCount,
        columnCount: result.columnCount,
        schemaHash: result.schemaHash,
        previousSchemaHash: result.previousSchemaHash,
        latencyMs: result.latencyMs,
      },
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({
      tables: result.tables,
      tableCount: result.tableCount,
      columnCount: result.columnCount,
      schemaHash: result.schemaHash,
      previousSchemaHash: result.previousSchemaHash,
      schemaChanged: result.schemaChanged,
      noOp: result.noOp,
      complete: result.complete,
      refreshAfter: result.refreshAfter,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = error instanceof SchemaIntrospectionIncompleteError ? 422 : 500
    const code = error instanceof SchemaIntrospectionIncompleteError ? error.code : 'SCHEMA_INTROSPECTION_FAILED'
    return NextResponse.json({
      tables: [],
      tableCount: 0,
      columnCount: 0,
      complete: false,
      code,
      error: message,
    }, { status })
  }
}
