import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  AI_CHART_REFINEMENT_ROLLOUT_SELECT,
  AI_CHART_REFINEMENT_ROLLOUT_TABLE,
  aiChartRefinementGateResponse,
  aiChartRefinementRolloutPolicyResponse,
  buildAiChartRefinementRolloutAuditMetadata,
  createEnvAiChartRefinementGatePolicy,
  inspectAiChartRefinementGatePolicy,
  listAiChartRefinementRolloutPolicies,
  normalizeAiChartRefinementPolicyReason,
  resolveAiChartRefinementGateFromDbPolicies,
  type AiChartRefinementRolloutPolicyState,
  type AiChartRefinementRolloutScopeType,
} from '@/lib/ai/chart-refinement-gate'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const ScopeSchema = z.enum(['global', 'tenant', 'project', 'user'])

const RolloutMutationSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  scopeType: ScopeSchema,
  targetUserId: z.string().uuid().optional(),
  enabled: z.boolean().nullable(),
  reason: z.string().max(240).nullable().optional(),
}).strict()

function policyScopeId({
  scopeType,
  tenantId,
  projectId,
  userId,
}: {
  scopeType: AiChartRefinementRolloutScopeType
  tenantId: string
  projectId: string
  userId: string
}) {
  if (scopeType === 'global') return null
  if (scopeType === 'tenant') return tenantId
  if (scopeType === 'project') return projectId
  return userId
}

function policyColumns({
  scopeType,
  tenantId,
  projectId,
  userId,
}: {
  scopeType: AiChartRefinementRolloutScopeType
  tenantId: string
  projectId: string
  userId: string
}) {
  return {
    tenant_id: scopeType === 'global' ? null : tenantId,
    project_id: scopeType === 'project' || scopeType === 'user' ? projectId : null,
    user_id: scopeType === 'user' ? userId : null,
  }
}

function policyFromRow({
  row,
  scopeType,
  tenantId,
  projectId,
  userId,
}: {
  row: Record<string, unknown>
  scopeType: AiChartRefinementRolloutScopeType
  tenantId: string
  projectId: string
  userId: string
}): AiChartRefinementRolloutPolicyState {
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    scopeType,
    scopeId: policyScopeId({ scopeType, tenantId, projectId, userId }),
    tenantId: scopeType === 'global' ? null : tenantId,
    projectId: scopeType === 'project' || scopeType === 'user' ? projectId : null,
    userId: scopeType === 'user' ? userId : null,
    enabled: row.enabled === true,
    reason: normalizeAiChartRefinementPolicyReason(typeof row.reason === 'string' ? row.reason : null),
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    updatedBy: typeof row.updated_by === 'string' ? row.updated_by : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

function findPolicyForScope(
  policies: AiChartRefinementRolloutPolicyState[],
  scopeType: AiChartRefinementRolloutScopeType,
  scopeId: string | null,
) {
  return policies.find(policy => policy.scopeType === scopeType && policy.scopeId === scopeId) ?? null
}

async function buildRolloutState({
  supabase,
  tenantId,
  projectId,
  userId,
}: {
  supabase: NonNullable<Awaited<ReturnType<typeof getAuthedSupabase>>>['supabase']
  tenantId: string
  projectId: string
  userId: string
}) {
  const store = await listAiChartRefinementRolloutPolicies({
    supabase,
    tenantId,
    projectId,
    userId,
  })
  const fallbackPolicy = createEnvAiChartRefinementGatePolicy()
  const gate = store.available
    ? resolveAiChartRefinementGateFromDbPolicies({ tenantId, projectId, userId }, store.policies, fallbackPolicy)
    : fallbackPolicy.resolve({ tenantId, projectId, userId })

  return {
    gate: aiChartRefinementGateResponse(gate),
    policies: store.policies.map(aiChartRefinementRolloutPolicyResponse),
    storage: {
      available: store.available,
      errorCode: store.errorCode,
    },
    env: inspectAiChartRefinementGatePolicy(),
  }
}

async function requireRolloutViewAccess({
  auth,
  tenantId,
  projectId,
}: {
  auth: NonNullable<Awaited<ReturnType<typeof getAuthedSupabase>>>
  tenantId: string
  projectId: string
}) {
  const access = await requireProjectAccess({
    ...accessContext(auth),
    tenantId,
    projectId,
    editor: true,
  })
  if (!access.ok) return NextResponse.json({ rollout: null, error: access.error }, { status: access.status })
  return null
}

async function requireRolloutMutationAccess({
  auth,
  tenantId,
  projectId,
  scopeType,
}: {
  auth: NonNullable<Awaited<ReturnType<typeof getAuthedSupabase>>>
  tenantId: string
  projectId: string
  scopeType: AiChartRefinementRolloutScopeType
}) {
  const viewDenied = await requireRolloutViewAccess({ auth, tenantId, projectId })
  if (viewDenied) return viewDenied

  if (scopeType === 'global') {
    if (auth.role !== 'admin') {
      return NextResponse.json({ rollout: null, error: 'Platform admin access is required for global rollout policy changes' }, { status: 403 })
    }
    return null
  }

  if (scopeType === 'tenant') {
    const tenantAccess = await requireTenantAccess({
      ...accessContext(auth),
      tenantId,
      editor: true,
    })
    if (!tenantAccess.ok) return NextResponse.json({ rollout: null, error: tenantAccess.error }, { status: tenantAccess.status })
    return null
  }

  return null
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ rollout: null, error: 'Unauthorized' }, { status: 401 })

    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const targetUserId = req.nextUrl.searchParams.get('targetUserId')
    if (!tenantId || !projectId) {
      return NextResponse.json({ rollout: null, error: 'tenantId and projectId are required' }, { status: 400 })
    }
    if (targetUserId && !z.string().uuid().safeParse(targetUserId).success) {
      return NextResponse.json({ rollout: null, error: 'targetUserId must be a UUID' }, { status: 400 })
    }
    if (targetUserId && targetUserId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ rollout: null, error: 'Platform admin access is required for another user scope' }, { status: 403 })
    }

    const viewDenied = await requireRolloutViewAccess({ auth, tenantId, projectId })
    if (viewDenied) return viewDenied

    return NextResponse.json({
      rollout: await buildRolloutState({
        supabase: auth.supabase,
        tenantId,
        projectId,
        userId: targetUserId ?? auth.userId,
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart refinement rollout lookup failed'
    console.error('[Admin AI Chart Refine Rollout]', message)
    return NextResponse.json({ rollout: null, error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ rollout: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = RolloutMutationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ rollout: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { tenantId, projectId, scopeType, enabled } = parsed.data
    const userId = parsed.data.targetUserId ?? auth.userId
    if (userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ rollout: null, error: 'Platform admin access is required for another user scope' }, { status: 403 })
    }

    const denied = await requireRolloutMutationAccess({ auth, tenantId, projectId, scopeType })
    if (denied) return denied

    const store = await listAiChartRefinementRolloutPolicies({
      supabase: auth.supabase,
      tenantId,
      projectId,
      userId,
    })
    if (!store.available) {
      return NextResponse.json({ rollout: null, error: 'AI chart refinement rollout policy store is unavailable' }, { status: 503 })
    }

    const scopeId = policyScopeId({ scopeType, tenantId, projectId, userId })
    const previousPolicy = findPolicyForScope(store.policies, scopeType, scopeId)
    let nextPolicy: AiChartRefinementRolloutPolicyState | null = null
    const now = new Date().toISOString()

    if (enabled === null) {
      if (previousPolicy?.id) {
        const { error } = await auth.supabase
          .from(AI_CHART_REFINEMENT_ROLLOUT_TABLE)
          .delete()
          .eq('id', previousPolicy.id)
        if (error) return NextResponse.json({ rollout: null, error: error.message }, { status: 500 })
      } else {
        return NextResponse.json({
          rollout: await buildRolloutState({ supabase: auth.supabase, tenantId, projectId, userId }),
        })
      }
    } else if (previousPolicy?.id) {
      const { data, error } = await auth.supabase
        .from(AI_CHART_REFINEMENT_ROLLOUT_TABLE)
        .update({
          enabled,
          reason: normalizeAiChartRefinementPolicyReason(parsed.data.reason),
          updated_by: auth.userId,
          updated_at: now,
        })
        .eq('id', previousPolicy.id)
        .select(AI_CHART_REFINEMENT_ROLLOUT_SELECT)
        .single()
      if (error) return NextResponse.json({ rollout: null, error: error.message }, { status: 500 })
      nextPolicy = policyFromRow({
        row: (data ?? {}) as Record<string, unknown>,
        scopeType,
        tenantId,
        projectId,
        userId,
      })
    } else {
      const { data, error } = await auth.supabase
        .from(AI_CHART_REFINEMENT_ROLLOUT_TABLE)
        .insert({
          scope_type: scopeType,
          ...policyColumns({ scopeType, tenantId, projectId, userId }),
          enabled,
          reason: normalizeAiChartRefinementPolicyReason(parsed.data.reason),
          created_by: auth.userId,
          updated_by: auth.userId,
          created_at: now,
          updated_at: now,
        })
        .select(AI_CHART_REFINEMENT_ROLLOUT_SELECT)
        .single()
      if (error) return NextResponse.json({ rollout: null, error: error.message }, { status: 500 })
      nextPolicy = policyFromRow({
        row: (data ?? {}) as Record<string, unknown>,
        scopeType,
        tenantId,
        projectId,
        userId,
      })
    }

    await auth.supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      project_id: projectId,
      actor_user_id: auth.userId,
      action: 'ai.chart_refine.rollout_policy.updated',
      target_type: AI_CHART_REFINEMENT_ROLLOUT_TABLE,
      target_id: nextPolicy?.id ?? previousPolicy?.id ?? null,
      metadata: buildAiChartRefinementRolloutAuditMetadata({
        scopeType,
        scopeId,
        previousPolicy,
        nextPolicy,
      }),
      created_at: now,
    })

    return NextResponse.json({
      rollout: await buildRolloutState({ supabase: auth.supabase, tenantId, projectId, userId }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart refinement rollout update failed'
    console.error('[Admin AI Chart Refine Rollout Update]', message)
    return NextResponse.json({ rollout: null, error: message }, { status: 500 })
  }
}
