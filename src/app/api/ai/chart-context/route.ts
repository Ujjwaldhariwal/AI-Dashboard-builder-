import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { buildGovernedAiChartContext, serializeGovernedAiChartContext } from '@/lib/ai/chart-ai-contract'
import { resolveAiChartRefinementGate } from '@/lib/ai/chart-refinement-gate'
import { requireAiProjectAccess } from '@/lib/security/ai-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { getAuthedSupabase } from '@/lib/supabase/server'

const ChartContextBodySchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  datasetId: z.string().uuid().optional(),
  chartId: z.string().uuid().optional(),
  purpose: z.enum(['chart_generation', 'chart_refinement', 'validation', 'preview']).default('chart_generation'),
  includePreview: z.boolean().default(false),
}).strict().refine(value => value.datasetId || value.chartId, {
  message: 'datasetId or chartId is required',
})

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ context: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = ChartContextBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ context: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireAiProjectAccess({ auth, scope: parsed.data })
    if (!access.ok) {
      return NextResponse.json({ context: null, error: access.error }, { status: access.status })
    }

    if (parsed.data.purpose === 'chart_refinement') {
      const gate = resolveAiChartRefinementGate({
        tenantId: access.tenantId,
        projectId: access.projectId,
        userId: auth.userId,
      })
      if (!gate.enabled) {
        return NextResponse.json({ context: null, errorCode: 'feature_gated', reasonCode: gate.reasonCode, error: gate.reason }, { status: 403 })
      }
    }

    const rateLimit = await checkRuntimeRateLimit({
      key: `ai-chart-context:${access.tenantId}:${access.projectId}:${auth.userId}`,
      maxRequests: 40,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { context: null, error: 'Too many AI chart context requests. Please retry shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    const context = await buildGovernedAiChartContext({
      supabase: auth.supabase,
      tenantId: access.tenantId,
      projectId: access.projectId,
      datasetId: parsed.data.datasetId,
      chartId: parsed.data.chartId,
      actorUserId: auth.userId,
      purpose: parsed.data.purpose,
      includePreview: parsed.data.includePreview,
    })

    return NextResponse.json({ context: serializeGovernedAiChartContext(context) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart context failed'
    console.error('[AI Chart Context]', message)
    return NextResponse.json({ context: null, error: message }, { status: 500 })
  }
}
