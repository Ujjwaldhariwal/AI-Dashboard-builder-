import { NextResponse } from 'next/server'
import { z } from 'zod'

import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const RequestSchema = z.object({
  tenantId: z.string().uuid(),
}).strict()

type UpdatedRow = { id: string }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ reset: null, error: 'Unauthorized' }, { status: 401 })

    const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ reset: null, error: parsed.error.flatten() }, { status: 400 })
    }
    const tenantId = parsed.data.tenantId
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId,
      projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ reset: null, error: access.error }, { status: access.status })
    }

    const { count: dataSourceCount, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .neq('status', 'archived')
    if (sourceError) throw new Error(sourceError.message)
    if (!dataSourceCount) {
      return NextResponse.json({ reset: null, error: 'Attach a data source before starting a fresh Autopilot run.' }, { status: 409 })
    }

    const nowIso = new Date().toISOString()
    const archive = async (table: 'published_dashboards' | 'dashboard_chart_configs' | 'semantic_datasets' | 'business_models') => {
      const { data, error } = await auth.supabase
        .from(table)
        .update({ status: 'archived', updated_at: nowIso })
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
        .neq('status', 'archived')
        .select('id')
      if (error) throw new Error(error.message)
      return (data ?? []) as UpdatedRow[]
    }

    // Released versions remain immutable. Archiving their source workspace keeps audit history
    // intact while removing every generated artifact from the active authoring flow.
    const dashboards = await archive('published_dashboards')
    const charts = await archive('dashboard_chart_configs')
    const datasets = await archive('semantic_datasets')

    const { error: projectError } = await auth.supabase
      .from('dashboard_projects')
      .update({ active_business_model_id: null, updated_at: nowIso })
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
    if (projectError) throw new Error(projectError.message)

    const models = await archive('business_models')
    const { data: cancelledRows, error: runError } = await auth.supabase
      .from('project_autopilot_runs')
      .update({
        status: 'cancelled',
        artifacts: {},
        error_code: 'reset_for_fresh_run',
        error_message: 'Superseded by an authenticated fresh Autopilot run.',
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .in('status', ['queued', 'running', 'awaiting_review', 'failed'])
      .select('id')
    if (runError) throw new Error(runError.message)

    const reset = {
      dataSourcesPreserved: dataSourceCount,
      dashboardsArchived: dashboards.length,
      chartsArchived: charts.length,
      datasetsArchived: datasets.length,
      modelsArchived: models.length,
      runsCancelled: (cancelledRows ?? []).length,
    }
    await auth.supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      project_id: projectId,
      actor_user_id: auth.userId,
      action: 'project_autopilot.workspace_reset',
      target_type: 'dashboard_project',
      target_id: projectId,
      metadata: reset,
      created_at: nowIso,
    })

    return NextResponse.json({ reset })
  } catch (error) {
    return NextResponse.json({
      reset: null,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
