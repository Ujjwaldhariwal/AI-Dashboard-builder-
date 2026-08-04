import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { mapDataSource } from '@/lib/data-sources/data-source-mapper'
import { encryptJsonSecret, hasDataSourceEncryptionKey } from '@/lib/security/credential-vault'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const SslModeSchema = z.enum(['disable', 'prefer', 'require', 'verify-ca', 'verify-full'])
const SchemaListSchema = z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]*$/)).min(1).max(10)
const CommonDataSourceFields = {
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(2, 'Data source name is required').max(120),
  username: z.string().min(1, 'Username is required').max(120),
  password: z.string().min(1, 'Password is required').max(500),
}

const PostgresDataSourceCreateSchema = z.object({
  ...CommonDataSourceFields,
  type: z.literal('postgres'),
  host: z.string().min(1, 'Host is required').max(255),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, 'Database is required').max(120),
  sslMode: SslModeSchema.default('require'),
  schemas: SchemaListSchema.default(['public']),
}).strict()

const OracleDataSourceCreateSchema = z.object({
  ...CommonDataSourceFields,
  type: z.literal('oracle'),
  host: z.string().regex(/^[A-Za-z0-9.-]+$/, 'Oracle host must be an IP address or DNS name').max(255),
  port: z.coerce.number().int().min(1).max(65535).default(1521),
  database: z.string().regex(/^[A-Za-z0-9._$#-]+$/, 'Oracle SID or service name is invalid').max(128),
  connectType: z.enum(['service_name', 'sid']).default('service_name'),
  schemas: SchemaListSchema,
}).strict()

const DataSourceCreateSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || 'type' in value) return value
  return { ...value, type: 'postgres' }
}, z.discriminatedUnion('type', [PostgresDataSourceCreateSchema, OracleDataSourceCreateSchema]))

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
    const access = accessContext(auth)

    if (projectId) {
      const projectAccess = await requireProjectAccess({ ...access, projectId, tenantId: tenantId ?? undefined })
      if (!projectAccess.ok) {
        return NextResponse.json({ dataSources: [], error: projectAccess.error }, { status: projectAccess.status })
      }
    } else if (tenantId) {
      const tenantAccess = await requireTenantAccess({ ...access, tenantId })
      if (!tenantAccess.ok) {
        return NextResponse.json({ dataSources: [], error: tenantAccess.error }, { status: tenantAccess.status })
      }
    }

    let query = auth.supabase
      .from('data_sources')
      .select('id, tenant_id, project_id, name, type, status, connection_config, credential_key_id, last_tested_at, last_test_status, last_error, schema_last_introspected_at, schema_last_status, schema_last_error, schema_hash, schema_table_count, schema_column_count, schema_object_count, schema_base_table_count, schema_view_count, schema_included_object_count, schema_included_column_count, schema_excluded_object_count, schema_review_object_count, schema_scope_status, schema_refresh_after, schema_refresh_requested_at, schema_refresh_reason, created_at, updated_at')
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

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ dataSource: null, error: access.error }, { status: access.status })
    }

    const safeConfig = {
      host: parsed.data.host.trim(),
      port: parsed.data.port,
      database: parsed.data.database.trim(),
      username: parsed.data.username.trim(),
      schemas: parsed.data.schemas,
      ...(parsed.data.type === 'postgres'
        ? { sslMode: parsed.data.sslMode }
        : { connectType: parsed.data.connectType }),
    }
    const encrypted = encryptJsonSecret({
      ...safeConfig,
      password: parsed.data.password,
      type: parsed.data.type,
    })
    const nowIso = new Date().toISOString()

    const { data, error } = await auth.supabase
      .from('data_sources')
      .insert({
        tenant_id: parsed.data.tenantId,
        project_id: parsed.data.projectId,
        name: parsed.data.name.trim(),
        type: parsed.data.type,
        status: 'draft',
        connection_config: safeConfig,
        credential_ciphertext: encrypted.ciphertext,
        credential_key_id: encrypted.keyId,
        schema_last_status: 'pending_refresh',
        schema_refresh_requested_at: nowIso,
        schema_refresh_reason: 'new_source',
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, tenant_id, project_id, name, type, status, connection_config, credential_key_id, last_tested_at, last_test_status, last_error, schema_last_introspected_at, schema_last_status, schema_last_error, schema_hash, schema_table_count, schema_column_count, schema_object_count, schema_base_table_count, schema_view_count, schema_included_object_count, schema_included_column_count, schema_excluded_object_count, schema_review_object_count, schema_scope_status, schema_refresh_after, schema_refresh_requested_at, schema_refresh_reason, created_at, updated_at')
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
