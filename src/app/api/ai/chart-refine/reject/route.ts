import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { resolveAiChartRefinementGateWithDb } from '@/lib/ai/chart-refinement-gate'
import {
  buildAiChartRefinementEventMetadata,
  logAiChartRefinementMetric,
} from '@/lib/ai/chart-refinement-observability'
import { finalizeChartRefinementProposalAtomic } from '@/lib/ai/chart-refinement-proposals'
import { requireAiProjectAccess } from '@/lib/security/ai-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { getAuthedSupabase } from '@/lib/supabase/server'

const RejectBodySchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  chartId: z.string().uuid(),
  proposalId: z.string().uuid(),
  reason: z.string().max(500).optional().default('Reviewer rejected AI patch preview'),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = RejectBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireAiProjectAccess({ auth, scope: parsed.data })
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status })

    const gate = await resolveAiChartRefinementGateWithDb({
      supabase: auth.supabase,
      tenantId: access.tenantId,
      projectId: access.projectId,
      userId: auth.userId,
    })
    if (!gate.enabled) {
      await logAiChartRefinementMetric({
        supabase: auth.supabase,
        tenantId: access.tenantId,
        projectId: access.projectId,
        actorUserId: auth.userId,
        chartId: parsed.data.chartId,
        eventType: 'gated_off_access',
        metadata: buildAiChartRefinementEventMetadata({
          eventType: 'gated_off_access',
          errorCode: gate.reasonCode,
          gateSource: gate.source,
        }),
      })
      return NextResponse.json({ ok: false, errorCode: 'feature_gated', reasonCode: gate.reasonCode, error: gate.reason }, { status: 403 })
    }

    const rateLimit = await checkRuntimeRateLimit({
      key: `ai-chart-refine-reject:${access.tenantId}:${access.projectId}:${auth.userId}`,
      maxRequests: 40,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { ok: false, error: 'Too many AI chart refinement requests. Please retry shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    const transaction = await finalizeChartRefinementProposalAtomic({
      supabase: auth.supabase,
      tenantId: access.tenantId,
      projectId: access.projectId,
      chartId: parsed.data.chartId,
      proposalId: parsed.data.proposalId,
      action: 'reject',
      rejectionReason: parsed.data.reason,
    })
    if (!transaction.ok) {
      return NextResponse.json({
        ok: false,
        errorCode: transaction.errorCode ?? 'invalid_chart_proposal',
        error: transaction.error ?? 'This proposal was already applied, rejected, or is not claimable.',
      }, { status: transaction.errorCode === 'chart_not_found' ? 404 : 409 })
    }

    await logAiChartRefinementMetric({
      supabase: auth.supabase,
      tenantId: access.tenantId,
      projectId: access.projectId,
      actorUserId: auth.userId,
      chartId: parsed.data.chartId,
      eventType: 'proposal_rejected',
      metadata: buildAiChartRefinementEventMetadata({
        eventType: 'proposal_rejected',
        gateSource: gate.source,
      }),
    })

    return NextResponse.json({ ok: true, proposalStatus: transaction.proposalStatus })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart refinement rejection failed'
    console.error('[AI Chart Refine Reject]', message)
    if (message === 'chart_refinement_rpc_unavailable') {
      return NextResponse.json({
        ok: false,
        errorCode: 'chart_refinement_migration_required',
        error: 'Chart refinement review is unavailable until the transactional RPC migration is deployed.',
      }, { status: 503 })
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
