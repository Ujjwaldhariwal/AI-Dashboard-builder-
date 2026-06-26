import { NextResponse } from 'next/server'

import { testPostgresConnection } from '@/lib/data-sources/postgres-runtime'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DataSource, DataSourceSslMode, DataSourceStatus } from '@/types/data-source'

function mapDataSource(row: Record<string, unknown>): DataSource {
  const config = row.connection_config && typeof row.connection_config === 'object' && !Array.isArray(row.connection_config)
    ? row.connection_config as Record<string, unknown>
    : {}

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    name: String(row.name ?? ''),
    type: 'postgres',
    status: String(row.status ?? 'draft') as DataSourceStatus,
    connectionConfig: {
      host: String(config.host ?? ''),
      port: Number(config.port ?? 5432),
      database: String(config.database ?? ''),
      username: String(config.username ?? ''),
      sslMode: String(config.sslMode ?? 'require') as DataSourceSslMode,
    },
    credentialKeyId: typeof row.credential_key_id === 'string' ? row.credential_key_id : null,
    lastTestedAt: typeof row.last_tested_at === 'string' ? row.last_tested_at : null,
    lastTestStatus: typeof row.last_test_status === 'string' ? row.last_test_status : null,
    lastError: typeof row.last_error === 'string' ? row.last_error : null,
    schemaLastIntrospectedAt: typeof row.schema_last_introspected_at === 'string' ? row.schema_last_introspected_at : null,
    schemaLastStatus: typeof row.schema_last_status === 'string' ? row.schema_last_status as DataSource['schemaLastStatus'] : null,
    schemaLastError: typeof row.schema_last_error === 'string' ? row.schema_last_error : null,
    schemaHash: typeof row.schema_hash === 'string' ? row.schema_hash : null,
    schemaTableCount: Number(row.schema_table_count ?? 0),
    schemaColumnCount: Number(row.schema_column_count ?? 0),
    schemaRefreshAfter: typeof row.schema_refresh_after === 'string' ? row.schema_refresh_after : null,
    schemaRefreshRequestedAt: typeof row.schema_refresh_requested_at === 'string' ? row.schema_refresh_requested_at : null,
    schemaRefreshReason: typeof row.schema_refresh_reason === 'string' ? row.schema_refresh_reason : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

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
      .select('id, tenant_id, project_id, name, type, status, connection_config, credential_ciphertext, credential_key_id, last_tested_at, last_test_status, last_error, schema_last_introspected_at, schema_last_status, schema_last_error, schema_hash, schema_table_count, schema_column_count, schema_refresh_after, schema_refresh_requested_at, schema_refresh_reason, created_at, updated_at')
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
      const test = await testPostgresConnection(ciphertext)
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
        .select('id, tenant_id, project_id, name, type, status, connection_config, credential_key_id, last_tested_at, last_test_status, last_error, schema_last_introspected_at, schema_last_status, schema_last_error, schema_hash, schema_table_count, schema_column_count, schema_refresh_after, schema_refresh_requested_at, schema_refresh_reason, created_at, updated_at')
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
        .select('id, tenant_id, project_id, name, type, status, connection_config, credential_key_id, last_tested_at, last_test_status, last_error, schema_last_introspected_at, schema_last_status, schema_last_error, schema_hash, schema_table_count, schema_column_count, schema_refresh_after, schema_refresh_requested_at, schema_refresh_reason, created_at, updated_at')
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
