export interface AiChartRefinementGateInput {
  tenantId: string
  projectId: string
  userId: string
}

export interface AiChartRefinementGateResult {
  enabled: boolean
  source: 'global' | 'tenant_allowlist' | 'project_allowlist' | 'user_allowlist' | 'off'
  reason: string
}

function envFlag(name: string) {
  const value = process.env[name]?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function envSet(name: string) {
  return new Set(
    (process.env[name] ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  )
}

export function resolveAiChartRefinementGate({
  tenantId,
  projectId,
  userId,
}: AiChartRefinementGateInput): AiChartRefinementGateResult {
  if (envFlag('DASHBOARDOS_AI_CHART_REFINEMENT_ENABLED')) {
    return {
      enabled: true,
      source: 'global',
      reason: 'AI chart refinement is enabled globally for this environment.',
    }
  }

  if (envSet('DASHBOARDOS_AI_CHART_REFINEMENT_USER_IDS').has(userId)) {
    return {
      enabled: true,
      source: 'user_allowlist',
      reason: 'AI chart refinement is enabled for this internal user.',
    }
  }

  if (envSet('DASHBOARDOS_AI_CHART_REFINEMENT_TENANT_IDS').has(tenantId)) {
    return {
      enabled: true,
      source: 'tenant_allowlist',
      reason: 'AI chart refinement is enabled for this tenant.',
    }
  }

  if (envSet('DASHBOARDOS_AI_CHART_REFINEMENT_PROJECT_IDS').has(projectId)) {
    return {
      enabled: true,
      source: 'project_allowlist',
      reason: 'AI chart refinement is enabled for this project.',
    }
  }

  return {
    enabled: false,
    source: 'off',
    reason: 'AI chart refinement is currently gated. Ask an admin to enable the tenant, project, or user allowlist.',
  }
}

export function aiChartRefinementGateResponse(gate: AiChartRefinementGateResult) {
  return {
    enabled: gate.enabled,
    source: gate.source,
    reason: gate.reason,
  }
}
