import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { buildProjectAutopilotPlan, ProjectAutopilotBriefSchema } from '@/lib/ai/project-autopilot'
import {
  loadProjectAutopilotSnapshot,
  mapProjectAutopilotRun,
  persistProjectAutopilotPlan,
  projectAutopilotIdempotencyKey,
} from '@/lib/ai/project-autopilot-server'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const RequestSchema = z.object({
  tenantId: z.string().uuid(),
  brief: ProjectAutopilotBriefSchema,
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
}).strict()

function migrationMissing(message: string) {
  return /project_autopilot_runs|project_autopilot_steps/i.test(message) && /does not exist|schema cache|could not find/i.test(message)
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ run: null, error: 'Unauthorized' }, { status: 401 })
    const tenantId = request.nextUrl.searchParams.get('tenantId')
    if (!tenantId) return NextResponse.json({ run: null, error: 'tenantId is required' }, { status: 400 })
    const access = await requireProjectAccess({ ...accessContext(auth), tenantId, projectId })
    if (!access.ok) return NextResponse.json({ run: null, error: access.error }, { status: access.status })
    let query = auth.supabase.from('project_autopilot_runs').select('*').eq('tenant_id', tenantId).eq('project_id', projectId)
    const runId = request.nextUrl.searchParams.get('runId')
    if (runId) query = query.eq('id', runId)
    const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) return NextResponse.json({ run: null, error: error.message }, { status: migrationMissing(error.message) ? 503 : 500 })
    return NextResponse.json({ run: data ? mapProjectAutopilotRun(data as Record<string, unknown>) : null })
  } catch (error) {
    return NextResponse.json({ run: null, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ run: null, error: 'Unauthorized' }, { status: 401 })
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ run: null, error: parsed.error.flatten() }, { status: 400 })
    const access = await requireProjectAccess({ ...accessContext(auth), tenantId: parsed.data.tenantId, projectId, editor: true })
    if (!access.ok) return NextResponse.json({ run: null, error: access.error }, { status: access.status })
    const brief = parsed.data.brief
    const idempotencyKey = parsed.data.idempotencyKey ?? projectAutopilotIdempotencyKey(projectId, brief)
    const { data: existingRow, error: existingError } = await auth.supabase
      .from('project_autopilot_runs')
      .select('*')
      .eq('tenant_id', parsed.data.tenantId)
      .eq('project_id', projectId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existingError) {
      return NextResponse.json({ run: null, error: existingError.message }, { status: migrationMissing(existingError.message) ? 503 : 500 })
    }
    if (existingRow) {
      return NextResponse.json({ run: mapProjectAutopilotRun(existingRow as Record<string, unknown>) })
    }
    const snapshot = await loadProjectAutopilotSnapshot({ supabase: auth.supabase, tenantId: parsed.data.tenantId, projectId })
    const plan = buildProjectAutopilotPlan(snapshot, brief)
    const nowIso = new Date().toISOString()
    const { data, error } = await auth.supabase.from('project_autopilot_runs').insert({
      tenant_id: parsed.data.tenantId,
      project_id: projectId,
      actor_user_id: auth.userId,
      status: plan.status,
      current_step: plan.currentStep,
      brief,
      plan,
      artifacts: {},
      idempotency_key: idempotencyKey,
      created_at: nowIso,
      updated_at: nowIso,
    }).select('*').single()
    if (error || !data) {
      const message = error?.message ?? 'Unable to create Autopilot run'
      if (error?.code === '23505') {
        const { data: concurrentRow } = await auth.supabase
          .from('project_autopilot_runs')
          .select('*')
          .eq('tenant_id', parsed.data.tenantId)
          .eq('project_id', projectId)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle()
        if (concurrentRow) return NextResponse.json({ run: mapProjectAutopilotRun(concurrentRow as Record<string, unknown>) })
      }
      return NextResponse.json({ run: null, error: message }, { status: migrationMissing(message) ? 503 : 400 })
    }
    const run = await persistProjectAutopilotPlan({
      supabase: auth.supabase,
      runId: String(data.id),
      tenantId: parsed.data.tenantId,
      projectId,
      plan,
      artifacts: {},
    })
    return NextResponse.json({ run }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ run: null, error: message }, { status: migrationMissing(message) ? 503 : 500 })
  }
}
