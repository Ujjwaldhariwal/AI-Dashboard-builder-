import { NextResponse } from 'next/server'

import {
  deleteSemanticFieldsForDataSource,
  invalidateSemanticDependentsForDataSource,
} from '@/lib/semantic/semantic-hardening'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

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
