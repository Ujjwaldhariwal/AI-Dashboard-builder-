import { NextResponse } from 'next/server'
import { z } from 'zod'

import { executeProjectAutopilot, mapProjectAutopilotRun, persistProjectAutopilotPlan } from '@/lib/ai/project-autopilot-server'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const RequestSchema = z.object({
  tenantId: z.string().uuid(),
  runId: z.string().uuid(),
}).strict()

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params
  const auth = await getAuthedSupabase()
  if (!auth) return NextResponse.json({ run: null, error: 'Unauthorized' }, { status: 401 })
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ run: null, error: parsed.error.flatten() }, { status: 400 })
  const access = await requireProjectAccess({ ...accessContext(auth), tenantId: parsed.data.tenantId, projectId, editor: true })
  if (!access.ok) return NextResponse.json({ run: null, error: access.error }, { status: access.status })
  const { data, error } = await auth.supabase
    .from('project_autopilot_runs')
    .select('*')
    .eq('id', parsed.data.runId)
    .eq('tenant_id', parsed.data.tenantId)
    .eq('project_id', projectId)
    .single()
  if (error || !data) return NextResponse.json({ run: null, error: error?.message ?? 'Autopilot run not found' }, { status: 404 })
  const current = mapProjectAutopilotRun(data as Record<string, unknown>)
  if (current.status === 'cancelled' || current.status === 'succeeded') return NextResponse.json({ run: current })
  try {
    const run = await executeProjectAutopilot(auth.supabase, {
      runId: current.id,
      tenantId: current.tenantId,
      projectId: current.projectId,
      actorUserId: auth.userId,
      brief: current.brief,
      artifacts: current.artifacts,
    })
    return NextResponse.json({ run })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const { data: latestRow } = await auth.supabase
      .from('project_autopilot_runs')
      .select('*')
      .eq('id', current.id)
      .eq('tenant_id', current.tenantId)
      .eq('project_id', current.projectId)
      .maybeSingle()
    const latest = latestRow ? mapProjectAutopilotRun(latestRow as Record<string, unknown>) : current
    const failed = await persistProjectAutopilotPlan({
      supabase: auth.supabase,
      runId: latest.id,
      tenantId: latest.tenantId,
      projectId: latest.projectId,
      plan: latest.plan,
      artifacts: latest.artifacts,
      errorCode: 'autopilot_execution_failed',
      errorMessage: message,
    }).catch(() => null)
    return NextResponse.json({ run: failed, error: message }, { status: 409 })
  }
}
