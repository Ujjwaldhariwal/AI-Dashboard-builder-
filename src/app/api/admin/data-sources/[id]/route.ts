import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  deleteSemanticFieldsForDataSource,
  invalidateSemanticDependentsForDataSource,
} from '@/lib/semantic/semantic-hardening'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const DataSourceSchemaScopeSchema = z.object({
  schemas: z.array(
    z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]*$/),
  ).min(1).max(10),
}).strict()

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ dataSource: null, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = DataSourceSchemaScopeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({
        dataSource: null,
        error: parsed.error.flatten(),
      }, { status: 400 })
    }

    const { data: source, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, tenant_id, project_id, type, connection_config')
      .eq('id', id)
      .maybeSingle()

    if (sourceError || !source) {
      return NextResponse.json({
        dataSource: null,
        error: sourceError?.message ?? 'Data source not found',
      }, { status: 404 })
    }

    const tenantId = String(source.tenant_id)
    const projectId = String(source.project_id)
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId,
      projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ dataSource: null, error: access.error }, { status: access.status })
    }

    const previousConfig = source.connection_config
      && typeof source.connection_config === 'object'
      && !Array.isArray(source.connection_config)
      ? source.connection_config as Record<string, unknown>
      : {}
    const defaultSchema = source.type === 'oracle'
      ? String(previousConfig.username ?? '').trim().toUpperCase()
      : 'public'
    const previousSchemas = Array.isArray(previousConfig.schemas)
      ? previousConfig.schemas.map(String)
      : [defaultSchema].filter(Boolean)
    const schemas = Array.from(new Set(parsed.data.schemas.map(schema => schema.trim())))
    const nowIso = new Date().toISOString()

    const { error: updateError } = await auth.supabase
      .from('data_sources')
      .update({
        connection_config: { ...previousConfig, schemas },
        schema_last_status: 'pending_refresh',
        schema_scope_status: 'review_required',
        schema_refresh_requested_at: nowIso,
        schema_refresh_reason: 'schema_scope_changed',
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)

    if (updateError) {
      return NextResponse.json({ dataSource: null, error: updateError.message }, { status: 400 })
    }

    await auth.supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      project_id: projectId,
      actor_user_id: auth.userId,
      action: 'data_source.updated',
      target_type: 'data_source',
      target_id: id,
      metadata: {
        event: 'schema_scope_changed',
        previousSchemas,
        schemas,
      },
      created_at: nowIso,
    })

    return NextResponse.json({
      dataSource: {
        id,
        schemas,
        schemaLastStatus: 'pending_refresh',
        schemaScopeStatus: 'review_required',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dataSource: null, error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ dataSource: null, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: source, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, tenant_id, project_id')
      .eq('id', id)
      .maybeSingle()

    if (sourceError || !source) {
      return NextResponse.json({
        dataSource: null,
        error: sourceError?.message ?? 'Data source not found',
      }, { status: 404 })
    }

    const tenantId = String(source.tenant_id)
    const projectId = String(source.project_id)
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId,
      projectId,
      editor: true,
    })

    if (!access.ok) {
      return NextResponse.json({ dataSource: null, error: access.error }, { status: access.status })
    }

    await invalidateSemanticDependentsForDataSource({
      supabase: auth.supabase,
      tenantId,
      projectId,
      dataSourceId: id,
      actorUserId: auth.userId,
    })

    await deleteSemanticFieldsForDataSource({
      supabase: auth.supabase,
      tenantId,
      projectId,
      dataSourceId: id,
    })

    const { error: deleteError } = await auth.supabase
      .from('data_sources')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)

    if (deleteError) {
      return NextResponse.json({ dataSource: null, error: deleteError.message }, { status: 400 })
    }

    await auth.supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      project_id: projectId,
      actor_user_id: auth.userId,
      action: 'data_source.deleted',
      target_type: 'data_source',
      target_id: id,
      metadata: {},
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ dataSource: { id } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dataSource: null, error: message }, { status: 500 })
  }
}
