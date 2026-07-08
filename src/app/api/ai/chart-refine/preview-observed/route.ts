import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { resolveAiChartRefinementGate } from '@/lib/ai/chart-refinement-gate'
import {
  buildAiChartRefinementEventMetadata,
  logAiChartRefinementMetric,
} from '@/lib/ai/chart-refinement-observability'
import { requireAiProjectAccess } from '@/lib/security/ai-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { getAuthedSupabase } from '@/lib/supabase/server'

const PreviewObservedBodySchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  chartId: z.string().uuid(),
  previewAvailable: z.boolean(),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = PreviewObservedBodySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 })

    const access = await requireAiProjectAccess({ auth, scope: parsed.data })
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status })

    const gate = resolveAiChartRefinementGate({
      tenantId: access.tenantId,
      projectId: access.projectId,
      userId: auth.userId,
    })
    if (!gate.enabled) return NextResponse.json({ ok: false, error: gate.reason, errorCode: 'feature_gated' }, { status: 403 })

    const rateLimit = await checkRuntimeRateLimit({
      key: `ai-chart-preview-observed:${access.tenantId}:${access.projectId}:${auth.userId}`,
      maxRequests: 60,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { ok: false, error: 'Too many AI chart refinement events. Please retry shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    await logAiChartRefinementMetric({
      supabase: auth.supabase,
      tenantId: access.tenantId,
      projectId: access.projectId,
      actorUserId: auth.userId,
      chartId: parsed.data.chartId,
      eventType: parsed.data.previewAvailable ? 'preview_render_available' : 'preview_render_unavailable',
      metadata: buildAiChartRefinementEventMetadata({
        eventType: parsed.data.previewAvailable ? 'preview_render_available' : 'preview_render_unavailable',
        previewAvailable: parsed.data.previewAvailable,
        gateSource: gate.source,
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart preview observation failed'
    console.error('[AI Chart Preview Observed]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
