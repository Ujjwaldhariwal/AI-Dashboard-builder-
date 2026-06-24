import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { encryptJsonSecret, hasDataSourceEncryptionKey } from '@/lib/security/credential-vault'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DataSource, DataSourceSslMode, DataSourceStatus } from '@/types/data-source'

const SslModeSchema = z.enum(['disable', 'prefer', 'require', 'verify-ca', 'verify-full'])

const DataSourceCreateSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(2, 'Data source name is required').max(120),
  host: z.string().min(1, 'Host is required').max(255),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, 'Database is required').max(120),
  username: z.string().min(1, 'Username is required').max(120),
  password: z.string().min(1, 'Password is required').max(500),
  sslMode: SslModeSchema.default('require'),
}).strict()

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
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

function isMissingDataSourceSchema(message: string) {
  return /relation .*data_sources.* does not exist|schema cache|could not find the table/i.test(message)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ dataSources: [], error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')

    let query = auth.supabase
      .from('data_sources')
      .select('id, tenant_id, project_id, name, type, status, connection_config, credential_key_id, last_tested_at, last_test_status, last_error, created_at, updated_at')
      .order('updated_at', { ascending: false })

    if (tenantId) query = query.eq('tenant_id', tenantId)
    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) {
      const status = isMissingDataSourceSchema(error.message) ? 503 : 500
      return NextResponse.json({ dataSources: [], error: error.message }, { status })
    }

    return NextResponse.json({
      dataSources: (data ?? []).map(row => mapDataSource(row as Record<string, unknown>)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dataSources: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ dataSource: null, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasDataSourceEncryptionKey()) {
      return NextResponse.json({
        dataSource: null,
        error: 'DATA_SOURCE_ENCRYPTION_KEY is required before saving database credentials',
      }, { status: 503 })
    }

    const body = await req.json().catch(() => null)
    const parsed = DataSourceCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ dataSource: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const safeConfig = {
      host: parsed.data.host.trim(),
      port: parsed.data.port,
      database: parsed.data.database.trim(),
      username: parsed.data.username.trim(),
      sslMode: parsed.data.sslMode,
    }
    const encrypted = encryptJsonSecret({
      ...safeConfig,
      password: parsed.data.password,
      type: 'postgres',
    })
    const nowIso = new Date().toISOString()

    const { data, error } = await auth.supabase
      .from('data_sources')
      .insert({
        tenant_id: parsed.data.tenantId,
        project_id: parsed.data.projectId,
        name: parsed.data.name.trim(),
        type: 'postgres',
        status: 'draft',
        connection_config: safeConfig,
        credential_ciphertext: encrypted.ciphertext,
        credential_key_id: encrypted.keyId,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, tenant_id, project_id, name, type, status, connection_config, credential_key_id, last_tested_at, last_test_status, last_error, created_at, updated_at')
      .single()

    if (error) {
      const status = isMissingDataSourceSchema(error.message) ? 503 : 400
      return NextResponse.json({ dataSource: null, error: error.message }, { status })
    }

    const dataSource = mapDataSource(data as Record<string, unknown>)

    await auth.supabase
      .from('audit_logs')
      .insert({
        tenant_id: dataSource.tenantId,
        project_id: dataSource.projectId,
        actor_user_id: auth.userId,
        action: 'data_source.created',
        target_type: 'data_source',
        target_id: dataSource.id,
        metadata: { type: dataSource.type, host: dataSource.connectionConfig.host },
        created_at: nowIso,
      })

    return NextResponse.json({ dataSource }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dataSource: null, error: message }, { status: 500 })
  }
}
