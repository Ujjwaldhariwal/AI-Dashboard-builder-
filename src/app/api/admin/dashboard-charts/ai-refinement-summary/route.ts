import { NextRequest, NextResponse } from 'next/server'

import { aiChartRefinementGateResponse, resolveAiChartRefinementGate } from '@/lib/ai/chart-refinement-gate'
import { summarizeAiChartRefinementMetrics } from '@/lib/ai/chart-refinement-observability'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

function clampWindowDays(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 7
  return Math.min(30, Math.max(1, Math.trunc(parsed)))
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ summary: null, error: 'Unauthorized' }, { status: 401 })

    const projectId = req.nextUrl.searchParams.get('projectId')
    const tenantId = req.nextUrl.searchParams.get('tenantId')
    if (!projectId || !tenantId) {
      return NextResponse.json({ summary: null, error: 'tenantId and projectId are required' }, { status: 400 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId,
      projectId,
      editor: true,
    })
    if (!access.ok) return NextResponse.json({ summary: null, error: access.error }, { status: access.status })

    const windowDays = clampWindowDays(req.nextUrl.searchParams.get('windowDays'))
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await auth.supabase
      .from('audit_logs')
      .select('action, metadata, created_at')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .like('action', 'ai.chart_refine.metric.%')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) return NextResponse.json({ summary: null, error: error.message }, { status: 500 })

    const gate = resolveAiChartRefinementGate({
      tenantId,
      projectId,
      userId: auth.userId,
    })

    return NextResponse.json({
      summary: {
        counts: summarizeAiChartRefinementMetrics((data ?? []) as Array<{
          action?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string | null
        }>),
        gate: aiChartRefinementGateResponse(gate),
        windowDays,
        since,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart refinement summary failed'
    console.error('[Admin AI Chart Refine Summary]', message)
    return NextResponse.json({ summary: null, error: message }, { status: 500 })
  }
}
