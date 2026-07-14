import type { SupabaseClient } from '@supabase/supabase-js'

import { executePostgresReadOnlyQuery } from '@/lib/data-sources/postgres-runtime'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { compileDatasetQueryPlan } from '@/lib/semantic/dataset-query-compiler'
import { checkQueryBudget } from '@/lib/semantic/query-budget-policy'
import { queryResultCacheKey, setQueryResultCache } from '@/lib/semantic/query-result-cache'
import { recordSemanticQueryRun } from '@/lib/semantic/query-runtime-telemetry'
import type { DashboardChartEncoding } from '@/types/dashboard-chart'

const DEFAULT_WARM_LIMIT = 25

type WarmTarget = 'dataset' | 'chart'

interface WarmOneResult {
  target: WarmTarget
  id: string
  status: 'warmed' | 'skipped' | 'error'
  cacheBackend?: 'redis' | 'memory'
  ttlSeconds?: number
  rowCount?: number
  elapsedMs?: number
  reason?: string
  warnings?: string[]
}

export interface CacheWarmResult {
  warmed: number
  skipped: number
  errors: number
  items: WarmOneResult[]
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function selectionFromDataset(row: Record<string, unknown>) {
  const selection = asRecord(row.selection)
  return {
    fieldIds: toStringArray(selection.fieldIds),
    metricIds: toStringArray(selection.metricIds),
    relationshipIds: toStringArray(selection.relationshipIds),
  }
}

function metricSourceFieldIds(metrics: Record<string, unknown>[], fields: Record<string, unknown>[]) {
  const selectedFieldIds = new Set(fields.map(field => String(field.id)))
  return Array.from(new Set(metrics.map(metric => {
    const expression = asRecord(metric.expression)
    return typeof expression.fieldId === 'string' ? expression.fieldId : null
  }).filter(Boolean) as string[])).filter(fieldId => !selectedFieldIds.has(fieldId))
}

function asEncoding(value: unknown): DashboardChartEncoding {
  const record = asRecord(value)
  return {
    xAxisFieldId: typeof record.xAxisFieldId === 'string' ? record.xAxisFieldId : undefined,
    yMetricIds: toStringArray(record.yMetricIds),
    seriesFieldId: typeof record.seriesFieldId === 'string' ? record.seriesFieldId : undefined,
    stackMetricIds: toStringArray(record.stackMetricIds),
    tooltipFieldIds: toStringArray(record.tooltipFieldIds),
    labelById: asRecord(record.labelById) as Record<string, string>,
    colorById: asRecord(record.colorById) as Record<string, string>,
    sort: asRecord(record.sort) as DashboardChartEncoding['sort'],
    limit: typeof record.limit === 'number' ? record.limit : null,
    filters: Array.isArray(record.filters)
      ? record.filters as DashboardChartEncoding['filters']
      : [],
  }
}

async function loadDatasetInputs(supabase: SupabaseClient, dataset: Record<string, unknown>) {
  const selection = selectionFromDataset(dataset)
  const [fieldsResult, metricsResult, relationshipsResult] = await Promise.all([
    selection.fieldIds.length > 0
      ? supabase.from('business_fields').select('*').in('id', selection.fieldIds)
      : Promise.resolve({ data: [], error: null }),
    selection.metricIds.length > 0
      ? supabase.from('business_metrics').select('*').in('id', selection.metricIds)
      : Promise.resolve({ data: [], error: null }),
    selection.relationshipIds.length > 0
      ? supabase.from('business_relationships').select('*').in('id', selection.relationshipIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (fieldsResult.error) throw new Error(fieldsResult.error.message)
  if (metricsResult.error) throw new Error(metricsResult.error.message)
  if (relationshipsResult.error) throw new Error(relationshipsResult.error.message)

  const fields = (fieldsResult.data ?? []) as Record<string, unknown>[]
  const metrics = (metricsResult.data ?? []) as Record<string, unknown>[]
  const relationships = (relationshipsResult.data ?? []) as Record<string, unknown>[]
  const missingMetricSourceFieldIds = metricSourceFieldIds(metrics, fields)
  const { data: metricSourceFields, error: metricSourceFieldsError } = missingMetricSourceFieldIds.length > 0
    ? await supabase.from('business_fields').select('*').in('id', missingMetricSourceFieldIds)
    : { data: [], error: null }

  if (metricSourceFieldsError) throw new Error(metricSourceFieldsError.message)

  return {
    fields,
    metrics,
    relationships,
    metricSourceFields: (metricSourceFields ?? []) as Record<string, unknown>[],
  }
}

async function warmDataset({
  supabase,
  dataset,
  chartId = null,
  chartUpdatedAt = null,
  filters = [],
}: {
  supabase: SupabaseClient
  dataset: Record<string, unknown>
  chartId?: string | null
  chartUpdatedAt?: string | null
  filters?: DashboardChartEncoding['filters']
}): Promise<WarmOneResult> {
  const datasetId = String(dataset.id)
  const tenantId = String(dataset.tenant_id)
  const projectId = String(dataset.project_id)
  const cachePolicy = asRecord(dataset.cache_policy)
  const inputs = await loadDatasetInputs(supabase, dataset)
  const compileResult = compileDatasetQueryPlan({ ...inputs, filters })

  if (!compileResult.queryPlan.executableSql || !compileResult.dataSourceId) {
    return {
      target: chartId ? 'chart' : 'dataset',
      id: chartId ?? datasetId,
      status: 'skipped',
      reason: 'Dataset is not executable yet',
      warnings: compileResult.warnings,
    }
  }

  const { data: sourceRow, error: sourceError } = await supabase
    .from('data_sources')
    .select('id, credential_ciphertext, status, schema_hash')
    .eq('id', compileResult.dataSourceId)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .single()

  if (sourceError) throw new Error(sourceError.message)
  if (sourceRow.status !== 'active') {
    return {
      target: chartId ? 'chart' : 'dataset',
      id: chartId ?? datasetId,
      status: 'skipped',
      reason: 'Data source is not active',
      warnings: compileResult.warnings,
    }
  }

  const budget = await checkQueryBudget({
    supabase,
    tenantId,
    projectId,
    dataSourceId: compileResult.dataSourceId,
  })
  if (!budget.ok) {
    await recordSemanticQueryRun({
      supabase,
      tenantId,
      projectId,
      datasetId,
      chartId,
      dataSourceId: compileResult.dataSourceId,
      surface: 'cache_warm',
      status: 'error',
      sql: compileResult.queryPlan.executableSql,
      timeoutMs: compileResult.queryPlan.limits.timeoutMs,
      errorMessage: budget.reason ?? 'Query budget exceeded',
      warnings: [...compileResult.warnings, `budget_policy:${budget.policy?.id ?? 'unknown'}`],
    })
    return {
      target: chartId ? 'chart' : 'dataset',
      id: chartId ?? datasetId,
      status: 'skipped',
      reason: budget.reason ?? 'Query budget exceeded',
      warnings: compileResult.warnings,
    }
  }

  const result = await executePostgresReadOnlyQuery(
    String(sourceRow.credential_ciphertext),
    compileResult.queryPlan.executableSql,
    {
      parameters: compileResult.parameters,
      poolKey: `data-source:${String(sourceRow.id)}`,
      queryTimeoutMs: compileResult.queryPlan.limits.timeoutMs,
    },
  )

  const projectedBudget = await checkQueryBudget({
    supabase,
    tenantId,
    projectId,
    dataSourceId: compileResult.dataSourceId,
    projection: {
      queries: 1,
      rows: result.rowCount,
      elapsedMs: result.elapsedMs,
    },
  })
  if (!projectedBudget.ok) {
    await recordSemanticQueryRun({
      supabase,
      tenantId,
      projectId,
      datasetId,
      chartId,
      dataSourceId: compileResult.dataSourceId,
      surface: 'cache_warm',
      status: 'error',
      sql: compileResult.queryPlan.executableSql,
      rowCount: result.rowCount,
      elapsedMs: result.elapsedMs,
      timeoutMs: compileResult.queryPlan.limits.timeoutMs,
      errorMessage: projectedBudget.reason ?? 'Query budget exceeded',
      warnings: [...compileResult.warnings, `budget_policy:${projectedBudget.policy?.id ?? 'unknown'}`, 'budget_projection:post_execution'],
    })
    return {
      target: chartId ? 'chart' : 'dataset',
      id: chartId ?? datasetId,
      status: 'skipped',
      reason: projectedBudget.reason ?? 'Query budget exceeded',
      rowCount: result.rowCount,
      elapsedMs: result.elapsedMs,
      warnings: compileResult.warnings,
    }
  }

  const cacheKey = queryResultCacheKey({
    tenantId,
    projectId,
    datasetId,
    chartId,
    dataSourceId: compileResult.dataSourceId,
    sql: compileResult.queryPlan.executableSql,
    parameters: compileResult.parameters,
    datasetUpdatedAt: typeof dataset.updated_at === 'string' ? dataset.updated_at : null,
    chartUpdatedAt,
    schemaHash: typeof sourceRow.schema_hash === 'string' ? sourceRow.schema_hash : null,
  })
  const cacheWrite = await setQueryResultCache(cacheKey, result, cachePolicy.ttlSeconds)

  await recordSemanticQueryRun({
    supabase,
    tenantId,
    projectId,
    datasetId,
    chartId,
    dataSourceId: compileResult.dataSourceId,
    surface: 'cache_warm',
    status: 'success',
    sql: compileResult.queryPlan.executableSql,
    rowCount: result.rowCount,
    elapsedMs: result.elapsedMs,
    timeoutMs: compileResult.queryPlan.limits.timeoutMs,
    warnings: compileResult.warnings,
  })

  return {
    target: chartId ? 'chart' : 'dataset',
    id: chartId ?? datasetId,
    status: 'warmed',
    cacheBackend: cacheWrite.backend,
    ttlSeconds: cacheWrite.ttlSeconds,
    rowCount: result.rowCount,
    elapsedMs: result.elapsedMs,
    warnings: compileResult.warnings,
  }
}

async function warmDatasetById(supabase: SupabaseClient, datasetId: string) {
  const { data, error } = await supabase
    .from('semantic_datasets')
    .select('*')
    .eq('id', datasetId)
    .eq('status', 'published')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Published dataset not found')
  return warmDataset({ supabase, dataset: data as Record<string, unknown> })
}

async function warmChartById(supabase: SupabaseClient, chartId: string) {
  const { data: chartRow, error: chartError } = await supabase
    .from('dashboard_chart_configs')
    .select('*')
    .eq('id', chartId)
    .eq('status', 'published')
    .eq('validation_state', 'valid')
    .single()

  if (chartError || !chartRow) throw new Error(chartError?.message ?? 'Published chart not found')
  const chart = chartRow as Record<string, unknown>
  const { data: datasetRow, error: datasetError } = await supabase
    .from('semantic_datasets')
    .select('*')
    .eq('id', String(chart.dataset_id))
    .eq('tenant_id', String(chart.tenant_id))
    .eq('status', 'published')
    .single()

  if (datasetError || !datasetRow) throw new Error(datasetError?.message ?? 'Published dataset not found')

  const inputs = await loadDatasetInputs(supabase, datasetRow as Record<string, unknown>)
  const encoding = asEncoding(chart.encoding)
  const validation = validateDashboardChartConfig({
    templateId: String(chart.template_id),
    encoding,
    fields: inputs.fields,
    metrics: inputs.metrics,
  })
  if (validation.state !== 'valid') {
    return {
      target: 'chart' as const,
      id: chartId,
      status: 'skipped' as const,
      reason: 'Published chart config is no longer valid',
      warnings: validation.issues.map(issue => issue.message),
    }
  }

  return warmDataset({
    supabase,
    dataset: datasetRow as Record<string, unknown>,
    chartId,
    chartUpdatedAt: typeof chart.updated_at === 'string' ? chart.updated_at : null,
    filters: encoding.filters ?? [],
  })
}

function summarize(items: WarmOneResult[]): CacheWarmResult {
  return {
    warmed: items.filter(item => item.status === 'warmed').length,
    skipped: items.filter(item => item.status === 'skipped').length,
    errors: items.filter(item => item.status === 'error').length,
    items,
  }
}

export async function warmQueryResultCache({
  supabase,
  targetType,
  targetId,
  tenantId,
  projectId,
  limit = DEFAULT_WARM_LIMIT,
}: {
  supabase: SupabaseClient
  targetType: string | null
  targetId: string | null
  tenantId: string
  projectId: string | null
  limit?: number
}): Promise<CacheWarmResult> {
  const clampedLimit = Math.min(50, Math.max(1, Math.trunc(limit)))
  if (targetType === 'dataset' && targetId) return summarize([await warmDatasetById(supabase, targetId)])
  if (targetType === 'chart' && targetId) return summarize([await warmChartById(supabase, targetId)])

  if (targetType === 'project' || (!targetType && projectId)) {
    if (!projectId) throw new Error('Project cache warm jobs require projectId')

    const [datasetsResult, chartsResult] = await Promise.all([
      supabase
        .from('semantic_datasets')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
        .eq('status', 'published')
        .limit(clampedLimit),
      supabase
        .from('dashboard_chart_configs')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
        .eq('status', 'published')
        .eq('validation_state', 'valid')
        .limit(clampedLimit),
    ])

    if (datasetsResult.error) throw new Error(datasetsResult.error.message)
    if (chartsResult.error) throw new Error(chartsResult.error.message)

    const items: WarmOneResult[] = []
    for (const dataset of (datasetsResult.data ?? []) as Record<string, unknown>[]) {
      try {
        items.push(await warmDataset({ supabase, dataset }))
      } catch (error) {
        items.push({ target: 'dataset', id: String(dataset.id), status: 'error', reason: error instanceof Error ? error.message : String(error) })
      }
    }
    for (const chart of (chartsResult.data ?? []) as Record<string, unknown>[]) {
      try {
        items.push(await warmChartById(supabase, String(chart.id)))
      } catch (error) {
        items.push({ target: 'chart', id: String(chart.id), status: 'error', reason: error instanceof Error ? error.message : String(error) })
      }
    }
    return summarize(items)
  }

  throw new Error('cache_warm jobs require targetType dataset, chart, or project')
}
