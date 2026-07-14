import type { SupabaseClient } from '@supabase/supabase-js'

export const AI_CHART_REFINEMENT_ROLLOUT_TABLE = 'ai_chart_refinement_rollout_policies'
export const AI_CHART_REFINEMENT_ROLLOUT_SELECT = 'id, scope_type, tenant_id, project_id, user_id, enabled, reason, created_by, updated_by, created_at, updated_at'

export interface AiChartRefinementGateInput {
  tenantId: string
  projectId: string
  userId: string
}

export type AiChartRefinementPolicyBackend = 'env' | 'database'

export type AiChartRefinementGateSource =
  | 'global'
  | 'tenant_allowlist'
  | 'project_allowlist'
  | 'user_allowlist'
  | 'db_global_policy'
  | 'db_tenant_policy'
  | 'db_project_policy'
  | 'db_user_policy'
  | 'off'

export type AiChartRefinementGateReasonCode =
  | 'global_enabled'
  | 'user_allowlisted'
  | 'tenant_allowlisted'
  | 'project_allowlisted'
  | 'rollout_not_enabled'
  | 'db_global_enabled'
  | 'db_global_disabled'
  | 'db_tenant_enabled'
  | 'db_tenant_disabled'
  | 'db_project_enabled'
  | 'db_project_disabled'
  | 'db_user_enabled'
  | 'db_user_disabled'

export interface AiChartRefinementGateResult {
  enabled: boolean
  source: AiChartRefinementGateSource
  reasonCode: AiChartRefinementGateReasonCode
  reason: string
  policy: AiChartRefinementPolicyBackend
}

export interface AiChartRefinementGatePolicy {
  readonly policy: 'env'
  resolve(input: AiChartRefinementGateInput): AiChartRefinementGateResult
  inspect(): AiChartRefinementGateInspection
}

export interface AiChartRefinementGateInspection {
  policy: 'env'
  globalEnabled: boolean
  allowlistCounts: {
    tenantIds: number
    projectIds: number
    userIds: number
  }
}

export type AiChartRefinementRolloutScopeType = 'global' | 'tenant' | 'project' | 'user'

export interface AiChartRefinementRolloutPolicyState {
  id?: string
  scopeType: AiChartRefinementRolloutScopeType
  scopeId: string | null
  tenantId: string | null
  projectId: string | null
  userId: string | null
  enabled: boolean
  reason: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

interface AiChartRefinementRolloutPolicyRow {
  id?: string | null
  scope_type?: string | null
  tenant_id?: string | null
  project_id?: string | null
  user_id?: string | null
  enabled?: boolean | null
  reason?: string | null
  created_by?: string | null
  updated_by?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface AiChartRefinementPolicyStoreRead {
  available: boolean
  errorCode: 'policy_store_unavailable' | null
  policies: AiChartRefinementRolloutPolicyState[]
}

type EnvLike = Record<string, string | undefined>

const ROLLOUT_SCOPE_ORDER: AiChartRefinementRolloutScopeType[] = ['user', 'project', 'tenant', 'global']

function envFlag(env: EnvLike, name: string) {
  const value = env[name]?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function envSet(env: EnvLike, name: string) {
  return new Set(
    (env[name] ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  )
}

function isRolloutScopeType(value: string | null | undefined): value is AiChartRefinementRolloutScopeType {
  return value === 'global' || value === 'tenant' || value === 'project' || value === 'user'
}

export function normalizeAiChartRefinementPolicyReason(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, 240) : null
}

function scopeIdForPolicy(policy: Pick<AiChartRefinementRolloutPolicyState, 'scopeType' | 'tenantId' | 'projectId' | 'userId'>) {
  if (policy.scopeType === 'global') return null
  if (policy.scopeType === 'tenant') return policy.tenantId
  if (policy.scopeType === 'project') return policy.projectId
  return policy.userId
}

function normalizeRolloutPolicyRow(row: AiChartRefinementRolloutPolicyRow): AiChartRefinementRolloutPolicyState | null {
  if (!isRolloutScopeType(row.scope_type) || typeof row.enabled !== 'boolean') return null
  const policy = {
    id: row.id ?? undefined,
    scopeType: row.scope_type,
    scopeId: null,
    tenantId: row.tenant_id ?? null,
    projectId: row.project_id ?? null,
    userId: row.user_id ?? null,
    enabled: row.enabled,
    reason: normalizeAiChartRefinementPolicyReason(row.reason),
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
  return { ...policy, scopeId: scopeIdForPolicy(policy) }
}

function policyMatchesInput(policy: AiChartRefinementRolloutPolicyState, input: AiChartRefinementGateInput) {
  if (policy.scopeType === 'global') return true
  if (policy.scopeType === 'tenant') return policy.tenantId === input.tenantId
  if (policy.scopeType === 'project') return policy.tenantId === input.tenantId && policy.projectId === input.projectId
  return policy.tenantId === input.tenantId && policy.projectId === input.projectId && policy.userId === input.userId
}

function policySource(scopeType: AiChartRefinementRolloutScopeType): AiChartRefinementGateSource {
  if (scopeType === 'global') return 'db_global_policy'
  if (scopeType === 'tenant') return 'db_tenant_policy'
  if (scopeType === 'project') return 'db_project_policy'
  return 'db_user_policy'
}

function policyReasonCode(
  scopeType: AiChartRefinementRolloutScopeType,
  enabled: boolean,
): AiChartRefinementGateReasonCode {
  if (scopeType === 'global') return enabled ? 'db_global_enabled' : 'db_global_disabled'
  if (scopeType === 'tenant') return enabled ? 'db_tenant_enabled' : 'db_tenant_disabled'
  if (scopeType === 'project') return enabled ? 'db_project_enabled' : 'db_project_disabled'
  return enabled ? 'db_user_enabled' : 'db_user_disabled'
}

function policyReason(scopeType: AiChartRefinementRolloutScopeType, enabled: boolean) {
  const scopeLabel = scopeType === 'global'
    ? 'global'
    : scopeType === 'tenant'
      ? 'tenant'
      : scopeType === 'project'
        ? 'project'
        : 'user'
  return enabled
    ? `AI chart refinement is enabled by the ${scopeLabel} rollout policy.`
    : `AI chart refinement is disabled by the ${scopeLabel} rollout policy.`
}

function toDatabaseGateResult(policy: AiChartRefinementRolloutPolicyState): AiChartRefinementGateResult {
  return {
    enabled: policy.enabled,
    source: policySource(policy.scopeType),
    reasonCode: policyReasonCode(policy.scopeType, policy.enabled),
    reason: policyReason(policy.scopeType, policy.enabled),
    policy: 'database',
  }
}

function sortPoliciesNewestFirst(policies: AiChartRefinementRolloutPolicyState[]) {
  return [...policies].sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? '')))
}

export function createEnvAiChartRefinementGatePolicy(env: EnvLike = process.env): AiChartRefinementGatePolicy {
  const globalEnabled = envFlag(env, 'DASHBOARDOS_AI_CHART_REFINEMENT_ENABLED')
  const userIds = envSet(env, 'DASHBOARDOS_AI_CHART_REFINEMENT_USER_IDS')
  const tenantIds = envSet(env, 'DASHBOARDOS_AI_CHART_REFINEMENT_TENANT_IDS')
  const projectIds = envSet(env, 'DASHBOARDOS_AI_CHART_REFINEMENT_PROJECT_IDS')

  return {
    policy: 'env',
    inspect() {
      return {
        policy: 'env',
        globalEnabled,
        allowlistCounts: {
          tenantIds: tenantIds.size,
          projectIds: projectIds.size,
          userIds: userIds.size,
        },
      }
    },
    resolve({ tenantId, projectId, userId }: AiChartRefinementGateInput): AiChartRefinementGateResult {
      if (globalEnabled) {
        return {
          enabled: true,
          source: 'global',
          reasonCode: 'global_enabled',
          reason: 'AI chart refinement is enabled globally for this environment.',
          policy: 'env',
        }
      }

      if (userIds.has(userId)) {
        return {
          enabled: true,
          source: 'user_allowlist',
          reasonCode: 'user_allowlisted',
          reason: 'AI chart refinement is enabled for this internal user.',
          policy: 'env',
        }
      }

      if (tenantIds.has(tenantId)) {
        return {
          enabled: true,
          source: 'tenant_allowlist',
          reasonCode: 'tenant_allowlisted',
          reason: 'AI chart refinement is enabled for this tenant.',
          policy: 'env',
        }
      }

      if (projectIds.has(projectId)) {
        return {
          enabled: true,
          source: 'project_allowlist',
          reasonCode: 'project_allowlisted',
          reason: 'AI chart refinement is enabled for this project.',
          policy: 'env',
        }
      }

      return {
        enabled: false,
        source: 'off',
        reasonCode: 'rollout_not_enabled',
        reason: 'AI chart refinement is currently gated. Ask an admin to enable the tenant, project, or user allowlist.',
        policy: 'env',
      }
    },
  }
}

export function inspectAiChartRefinementGatePolicy(env: EnvLike = process.env) {
  return createEnvAiChartRefinementGatePolicy(env).inspect()
}

export function resolveAiChartRefinementGate(
  input: AiChartRefinementGateInput,
  policy: AiChartRefinementGatePolicy = createEnvAiChartRefinementGatePolicy(),
): AiChartRefinementGateResult {
  return policy.resolve(input)
}

export function resolveAiChartRefinementGateFromDbPolicies(
  input: AiChartRefinementGateInput,
  policies: AiChartRefinementRolloutPolicyState[],
  fallbackPolicy: AiChartRefinementGatePolicy = createEnvAiChartRefinementGatePolicy(),
): AiChartRefinementGateResult {
  const orderedPolicies = sortPoliciesNewestFirst(policies)
  for (const scopeType of ROLLOUT_SCOPE_ORDER) {
    const policy = orderedPolicies.find(candidate => candidate.scopeType === scopeType && policyMatchesInput(candidate, input))
    if (policy) return toDatabaseGateResult(policy)
  }
  return fallbackPolicy.resolve(input)
}

async function fetchRolloutPolicyRow({
  supabase,
  scopeType,
  tenantId,
  projectId,
  userId,
}: {
  supabase: SupabaseClient
  scopeType: AiChartRefinementRolloutScopeType
  tenantId: string
  projectId: string
  userId: string
}) {
  let query = supabase
    .from(AI_CHART_REFINEMENT_ROLLOUT_TABLE)
    .select(AI_CHART_REFINEMENT_ROLLOUT_SELECT)
    .eq('scope_type', scopeType)

  if (scopeType === 'global') {
    query = query.is('tenant_id', null).is('project_id', null).is('user_id', null)
  } else if (scopeType === 'tenant') {
    query = query.eq('tenant_id', tenantId).is('project_id', null).is('user_id', null)
  } else if (scopeType === 'project') {
    query = query.eq('tenant_id', tenantId).eq('project_id', projectId).is('user_id', null)
  } else {
    query = query.eq('tenant_id', tenantId).eq('project_id', projectId).eq('user_id', userId)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return normalizeRolloutPolicyRow((data ?? {}) as AiChartRefinementRolloutPolicyRow)
}

export async function listAiChartRefinementRolloutPolicies({
  supabase,
  tenantId,
  projectId,
  userId,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  userId: string
}): Promise<AiChartRefinementPolicyStoreRead> {
  try {
    const policies = (await Promise.all(
      ROLLOUT_SCOPE_ORDER.map(scopeType => fetchRolloutPolicyRow({
        supabase,
        scopeType,
        tenantId,
        projectId,
        userId,
      })),
    )).filter((policy): policy is AiChartRefinementRolloutPolicyState => Boolean(policy))

    return {
      available: true,
      errorCode: null,
      policies,
    }
  } catch {
    return {
      available: false,
      errorCode: 'policy_store_unavailable',
      policies: [],
    }
  }
}

export async function resolveAiChartRefinementGateWithDb({
  supabase,
  tenantId,
  projectId,
  userId,
  fallbackPolicy = createEnvAiChartRefinementGatePolicy(),
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  userId: string
  fallbackPolicy?: AiChartRefinementGatePolicy
}): Promise<AiChartRefinementGateResult> {
  const store = await listAiChartRefinementRolloutPolicies({
    supabase,
    tenantId,
    projectId,
    userId,
  })
  if (!store.available) return fallbackPolicy.resolve({ tenantId, projectId, userId })
  return resolveAiChartRefinementGateFromDbPolicies({ tenantId, projectId, userId }, store.policies, fallbackPolicy)
}

export function aiChartRefinementGateResponse(gate: AiChartRefinementGateResult) {
  return {
    enabled: gate.enabled,
    source: gate.source,
    reasonCode: gate.reasonCode,
    reason: gate.reason,
    policy: gate.policy,
  }
}

export function aiChartRefinementRolloutPolicyResponse(policy: AiChartRefinementRolloutPolicyState) {
  return {
    id: policy.id,
    scopeType: policy.scopeType,
    scopeId: policy.scopeId,
    tenantId: policy.tenantId,
    projectId: policy.projectId,
    userId: policy.userId,
    enabled: policy.enabled,
    reason: policy.reason,
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy,
  }
}

function rolloutPolicyAuditSnapshot(policy: AiChartRefinementRolloutPolicyState | null) {
  if (!policy) return null
  return {
    enabled: policy.enabled,
    notePresent: Boolean(policy.reason),
    updatedAt: policy.updatedAt,
  }
}

export function buildAiChartRefinementRolloutAuditMetadata({
  scopeType,
  scopeId,
  previousPolicy,
  nextPolicy,
}: {
  scopeType: AiChartRefinementRolloutScopeType
  scopeId: string | null
  previousPolicy: AiChartRefinementRolloutPolicyState | null
  nextPolicy: AiChartRefinementRolloutPolicyState | null
}) {
  return {
    scopeType,
    scopeId,
    previous: rolloutPolicyAuditSnapshot(previousPolicy),
    next: rolloutPolicyAuditSnapshot(nextPolicy),
  }
}
