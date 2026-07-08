import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { aiChartRefinementGateResponse, resolveAiChartRefinementGate } from '@/lib/ai/chart-refinement-gate'
import { requireAiProjectAccess } from '@/lib/security/ai-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const GateBodySchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ enabled: false, source: 'off', reason: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = GateBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ enabled: false, source: 'off', reason: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireAiProjectAccess({ auth, scope: parsed.data })
    if (!access.ok) {
      return NextResponse.json({ enabled: false, source: 'off', reason: access.error }, { status: access.status })
    }

    const gate = resolveAiChartRefinementGate({
      tenantId: access.tenantId,
      projectId: access.projectId,
      userId: auth.userId,
    })

    return NextResponse.json(aiChartRefinementGateResponse(gate))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart refinement gate check failed'
    console.error('[AI Chart Refine Gate]', message)
    return NextResponse.json({ enabled: false, source: 'off', reason: message }, { status: 500 })
  }
}
