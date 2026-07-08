export interface AiChartRefinementGateInput {
  tenantId: string
  projectId: string
  userId: string
}

export type AiChartRefinementGateSource =
  | 'global'
  | 'tenant_allowlist'
  | 'project_allowlist'
  | 'user_allowlist'
  | 'off'

export type AiChartRefinementGateReasonCode =
  | 'global_enabled'
  | 'user_allowlisted'
  | 'tenant_allowlisted'
  | 'project_allowlisted'
  | 'rollout_not_enabled'

export interface AiChartRefinementGateResult {
  enabled: boolean
  source: AiChartRefinementGateSource
  reasonCode: AiChartRefinementGateReasonCode
  reason: string
  policy: 'env'
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

type EnvLike = Record<string, string | undefined>

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

export function aiChartRefinementGateResponse(gate: AiChartRefinementGateResult) {
  return {
    enabled: gate.enabled,
    source: gate.source,
    reasonCode: gate.reasonCode,
    reason: gate.reason,
    policy: gate.policy,
  }
}
