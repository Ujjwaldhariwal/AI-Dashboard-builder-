import type { SupabaseClient } from '@supabase/supabase-js'

export type QueryBudgetPeriod = 'daily' | 'monthly'

export interface QueryBudgetPolicy {
  id: string
  tenantId: string
  projectId: string | null
  dataSourceId: string | null
  name: string
  enabled: boolean
  period: QueryBudgetPeriod
  maxQueries: number
  maxRows: number | null
  maxElapsedMs: number | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface QueryBudgetDecision {
  ok: boolean
  policy: QueryBudgetPolicy | null
  usage: {
    queries: number
    rows: number
    elapsedMs: number
  }
  resetAt: string | null
  retryAfterSeconds: number
  reason: string | null
}

function periodStart(period: QueryBudgetPeriod, now = new Date()) {
  if (period === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

function periodReset(period: QueryBudgetPeriod, now = new Date()) {
  if (period === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

function scopeRank(policy: QueryBudgetPolicy) {
  if (policy.dataSourceId) return 3
  if (policy.projectId) return 2
  return 1
}

export function mapQueryBudgetPolicy(row: Record<string, unknown>): QueryBudgetPolicy {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    dataSourceId: typeof row.data_source_id === 'string' ? row.data_source_id : null,
    name: String(row.name ?? ''),
    enabled: row.enabled !== false,
    period: String(row.period ?? 'daily') as QueryBudgetPeriod,
    maxQueries: Number(row.max_queries ?? 0),
    maxRows: typeof row.max_rows === 'number' ? row.max_rows : null,
    maxElapsedMs: typeof row.max_elapsed_ms === 'number' ? row.max_elapsed_ms : null,
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function listQueryBudgetPolicies({
  supabase,
  tenantId,
  projectId,
  dataSourceId,
  enabled,
  limit = 50,
}: {
  supabase: SupabaseClient
  tenantId?: string | null
  projectId?: string | null
  dataSourceId?: string | null
  enabled?: boolean | null
  limit?: number
}) {
  const clampedLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  let query = supabase
    .from('query_budget_policies')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(clampedLimit)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (projectId) query = query.eq('project_id', projectId)
  if (dataSourceId) query = query.eq('data_source_id', dataSourceId)
  if (typeof enabled === 'boolean') query = query.eq('enabled', enabled)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(row => mapQueryBudgetPolicy(row))
}

export async function upsertQueryBudgetPolicy({
  supabase,
  tenantId,
  projectId = null,
  dataSourceId = null,
  name,
  enabled = true,
  period,
  maxQueries,
  maxRows = null,
  maxElapsedMs = null,
  createdBy,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId?: string | null
  dataSourceId?: string | null
  name: string
  enabled?: boolean
  period: QueryBudgetPeriod
  maxQueries: number
  maxRows?: number | null
  maxElapsedMs?: number | null
  createdBy: string
}) {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('query_budget_policies')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      data_source_id: dataSourceId,
      name,
      enabled,
      period,
      max_queries: maxQueries,
      max_rows: maxRows,
      max_elapsed_ms: maxElapsedMs,
      created_by: createdBy,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapQueryBudgetPolicy(data as Record<string, unknown>)
}

export async function checkQueryBudget({
  supabase,
  tenantId,
  projectId,
  dataSourceId,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  dataSourceId: string
}): Promise<QueryBudgetDecision> {
  const { data, error } = await supabase
    .from('query_budget_policies')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .or(`project_id.is.null,project_id.eq.${projectId}`)
    .or(`data_source_id.is.null,data_source_id.eq.${dataSourceId}`)

  if (error) throw new Error(error.message)
  const policies = ((data ?? []) as Record<string, unknown>[])
    .map(row => mapQueryBudgetPolicy(row))
    .filter(policy => (
      (!policy.projectId || policy.projectId === projectId)
      && (!policy.dataSourceId || policy.dataSourceId === dataSourceId)
    ))
    .sort((left, right) => scopeRank(right) - scopeRank(left) || left.maxQueries - right.maxQueries)

  if (policies.length === 0) {
    return {
      ok: true,
      policy: null,
      usage: { queries: 0, rows: 0, elapsedMs: 0 },
      resetAt: null,
      retryAfterSeconds: 0,
      reason: null,
    }
  }

  for (const policy of policies) {
    const start = periodStart(policy.period)
    let query = supabase
      .from('semantic_query_runs')
      .select('row_count, elapsed_ms')
      .eq('tenant_id', tenantId)
      .gte('created_at', start)

    if (policy.projectId) query = query.eq('project_id', policy.projectId)
    if (policy.dataSourceId) query = query.eq('data_source_id', policy.dataSourceId)

    const { data: usageRows, error: usageError } = await query
    if (usageError) throw new Error(usageError.message)

    const usage = ((usageRows ?? []) as Record<string, unknown>[]).reduce<{
      queries: number
      rows: number
      elapsedMs: number
    }>((acc, row) => ({
      queries: acc.queries + 1,
      rows: acc.rows + Number(row.row_count ?? 0),
      elapsedMs: acc.elapsedMs + Number(row.elapsed_ms ?? 0),
    }), { queries: 0, rows: 0, elapsedMs: 0 })
    const reset = periodReset(policy.period)
    const retryAfterSeconds = Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))

    if (usage.queries >= policy.maxQueries) {
      return {
        ok: false,
        policy,
        usage,
        resetAt: reset.toISOString(),
        retryAfterSeconds,
        reason: `Query budget exceeded for ${policy.name}`,
      }
    }
  }

  return {
    ok: true,
    policy: policies[0],
    usage: { queries: 0, rows: 0, elapsedMs: 0 },
    resetAt: periodReset(policies[0].period).toISOString(),
    retryAfterSeconds: 0,
    reason: null,
  }
}
