import { NextResponse } from 'next/server'

import { mapDataSource } from '@/lib/data-sources/data-source-mapper'
import { testDataSourceConnection } from '@/lib/data-sources/data-source-runtime'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DataSourceType } from '@/types/data-source'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const nowIso = new Date().toISOString()

  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ dataSource: null, test: null, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: source, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, tenant_id, project_id, name, type, status, connection_config, credential_ciphertext, credential_key_id, last_tested_at, last_test_status, last_error, schema_last_introspected_at, schema_last_status, schema_last_error, schema_hash, schema_table_count, schema_column_count, schema_object_count, schema_base_table_count, schema_view_count, schema_included_object_count, schema_included_column_count, schema_excluded_object_count, schema_review_object_count, schema_scope_status, schema_refresh_after, schema_refresh_requested_at, schema_refresh_reason, created_at, updated_at')
      .eq('id', id)
      .single()

    if (sourceError) {
      return NextResponse.json({ dataSource: null, test: null, error: sourceError.message }, { status: 404 })
    }

    const row = source as Record<string, unknown>
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ dataSource: null, test: null, error: access.error }, { status: access.status })
    }

    const ciphertext = typeof row.credential_ciphertext === 'string' ? row.credential_ciphertext : ''
    if (!ciphertext) {
      return NextResponse.json({ dataSource: null, test: null, error: 'Missing encrypted credentials' }, { status: 409 })
    }

    try {
      const type: DataSourceType = row.type === 'oracle' ? 'oracle' : 'postgres'
      const test = await testDataSourceConnection(type, ciphertext)
      const { data: updated, error: updateError } = await auth.supabase
        .from('data_sources')
        .update({
          status: 'active',
          last_tested_at: nowIso,
          last_test_status: 'ok',
          last_error: null,
          updated_at: nowIso,
        })
        .eq('id', id)
        .select('id, tenant_id, project_id, name, type, status, connection_config, credential_key_id, last_tested_at, last_test_status, last_error, schema_last_introspected_at, schema_last_status, schema_last_error, schema_hash, schema_table_count, schema_column_count, schema_object_count, schema_base_table_count, schema_view_count, schema_included_object_count, schema_included_column_count, schema_excluded_object_count, schema_review_object_count, schema_scope_status, schema_refresh_after, schema_refresh_requested_at, schema_refresh_reason, created_at, updated_at')
        .single()

      if (updateError) {
        return NextResponse.json({ dataSource: null, test, error: updateError.message }, { status: 500 })
      }

      await auth.supabase
        .from('audit_logs')
        .insert({
          tenant_id: row.tenant_id,
          project_id: row.project_id,
          actor_user_id: auth.userId,
          action: 'data_source.updated',
          target_type: 'data_source',
          target_id: id,
          metadata: { event: 'connection_test', ok: true, latencyMs: test.latencyMs },
          created_at: nowIso,
        })

      return NextResponse.json({
        dataSource: mapDataSource(updated as Record<string, unknown>),
        test,
      })
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : String(testError)
      const { data: updated } = await auth.supabase
        .from('data_sources')
        .update({
          status: 'error',
          last_tested_at: nowIso,
          last_test_status: 'error',
          last_error: message,
          updated_at: nowIso,
        })
        .eq('id', id)
        .select('id, tenant_id, project_id, name, type, status, connection_config, credential_key_id, last_tested_at, last_test_status, last_error, schema_last_introspected_at, schema_last_status, schema_last_error, schema_hash, schema_table_count, schema_column_count, schema_object_count, schema_base_table_count, schema_view_count, schema_included_object_count, schema_included_column_count, schema_excluded_object_count, schema_review_object_count, schema_scope_status, schema_refresh_after, schema_refresh_requested_at, schema_refresh_reason, created_at, updated_at')
        .maybeSingle()

      await auth.supabase
        .from('audit_logs')
        .insert({
          tenant_id: row.tenant_id,
          project_id: row.project_id,
          actor_user_id: auth.userId,
          action: 'data_source.updated',
          target_type: 'data_source',
          target_id: id,
          metadata: { event: 'connection_test', ok: false, error: message },
          created_at: nowIso,
        })

      return NextResponse.json({
        dataSource: updated ? mapDataSource(updated as Record<string, unknown>) : null,
        test: { ok: false },
        error: message,
      }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dataSource: null, test: null, error: message }, { status: 500 })
  }
}
