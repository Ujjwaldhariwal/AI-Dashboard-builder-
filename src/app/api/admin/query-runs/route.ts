import { NextRequest, NextResponse } from 'next/server'

import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

function clampLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(200, Math.max(1, Math.trunc(parsed)))
}

function mapQueryRun(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    datasetId: typeof row.dataset_id === 'string' ? row.dataset_id : null,
    chartId: typeof row.chart_id === 'string' ? row.chart_id : null,
    dataSourceId: typeof row.data_source_id === 'string' ? row.data_source_id : null,
    actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : null,
    surface: String(row.surface ?? ''),
    status: String(row.status ?? ''),
    queryHash: typeof row.query_hash === 'string' ? row.query_hash : null,
    rowCount: typeof row.row_count === 'number' ? row.row_count : null,
    elapsedMs: typeof row.elapsed_ms === 'number' ? row.elapsed_ms : null,
    timeoutMs: typeof row.timeout_ms === 'number' ? row.timeout_ms : null,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ runs: [], error: 'Unauthorized' }, { status: 401 })

    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const datasetId = req.nextUrl.searchParams.get('datasetId')
    const chartId = req.nextUrl.searchParams.get('chartId')
    const status = req.nextUrl.searchParams.get('status')
    const surface = req.nextUrl.searchParams.get('surface')
    const limit = clampLimit(req.nextUrl.searchParams.get('limit'))
    const access = accessContext(auth)

    if (projectId) {
      const projectAccess = await requireProjectAccess({ ...access, projectId, tenantId: tenantId ?? undefined })
      if (!projectAccess.ok) {
        return NextResponse.json({ runs: [], error: projectAccess.error }, { status: projectAccess.status })
      }
    } else if (tenantId) {
      const tenantAccess = await requireTenantAccess({ ...access, tenantId })
      if (!tenantAccess.ok) {
        return NextResponse.json({ runs: [], error: tenantAccess.error }, { status: tenantAccess.status })
      }
    }

    let query = auth.supabase
      .from('semantic_query_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (tenantId) query = query.eq('tenant_id', tenantId)
    if (projectId) query = query.eq('project_id', projectId)
    if (datasetId) query = query.eq('dataset_id', datasetId)
    if (chartId) query = query.eq('chart_id', chartId)
    if (status === 'success' || status === 'error') query = query.eq('status', status)
    if (surface) query = query.eq('surface', surface)

    const { data, error } = await query
    if (error) return NextResponse.json({ runs: [], error: error.message }, { status: 500 })

    return NextResponse.json({
      runs: (data ?? []).map(row => mapQueryRun(row as Record<string, unknown>)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ runs: [], error: message }, { status: 500 })
  }
}
