import type { SupabaseClient } from '@supabase/supabase-js'

import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import type { DashboardChartConfig, DashboardChartEncoding, DashboardChartValidationResult } from '@/types/dashboard-chart'

export type ChartHealthState = 'healthy' | 'stale' | 'blocked'

export interface DashboardChartAuditItem {
  chart: {
    id: string
    name: string
    status: string
    templateId: string
    validationState: string
    updatedAt?: string
    publishedAt?: string | null
  }
  dataset: {
    id: string
    status: string
  }
  healthState: ChartHealthState
  validation: DashboardChartValidationResult
}

export interface DashboardChartAudit {
  checkedAt: string
  summary: {
    total: number
    healthy: number
    stale: number
    blocked: number
  }
  items: DashboardChartAuditItem[]
}

export interface AuditDashboardChartsInput {
  supabase: SupabaseClient
  projectId?: string | null
  tenantId?: string | null
  status?: string | null
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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
  }
}

function selectionFromDataset(row: Record<string, unknown>) {
  const selection = asRecord(row.selection)
  return {
    fieldIds: toStringArray(selection.fieldIds),
    metricIds: toStringArray(selection.metricIds),
  }
}

function mapChart(row: Record<string, unknown>): DashboardChartConfig {
  const presentation = asRecord(row.presentation)
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    datasetId: String(row.dataset_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as DashboardChartConfig['status'],
    templateId: String(row.template_id) as DashboardChartConfig['templateId'],
    encoding: asEncoding(row.encoding),
    presentation: {
      size: String(presentation.size ?? 'standard') as DashboardChartConfig['presentation']['size'],
      showLegend: presentation.showLegend !== false,
      showLabels: presentation.showLabels === true,
      valueFormat: typeof presentation.valueFormat === 'string' ? presentation.valueFormat : null,
    },
    interactions: asRecord(row.interactions) as DashboardChartConfig['interactions'],
    layout: asRecord(row.layout) as DashboardChartConfig['layout'],
    validationState: String(row.validation_state ?? 'unknown') as DashboardChartConfig['validationState'],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
  }
}

function healthStateFor({
  chart,
  dataset,
  validationState,
}: {
  chart: DashboardChartConfig
  dataset: Record<string, unknown> | undefined
  validationState: DashboardChartConfig['validationState']
}): ChartHealthState {
  if (!dataset || dataset.status !== 'published') return 'blocked'
  if (chart.status === 'published' && chart.validationState === 'valid' && validationState === 'valid') {
    return 'healthy'
  }
  return 'stale'
}

export async function auditDashboardCharts({
  supabase,
  projectId,
  tenantId,
  status = 'published',
}: AuditDashboardChartsInput): Promise<DashboardChartAudit> {
  let chartQuery = supabase
    .from('dashboard_chart_configs')
    .select('*')
    .order('updated_at', { ascending: false })

  if (projectId) chartQuery = chartQuery.eq('project_id', projectId)
  if (tenantId) chartQuery = chartQuery.eq('tenant_id', tenantId)
  if (status !== 'all') chartQuery = chartQuery.eq('status', status ?? 'published')

  const { data: chartRows, error: chartError } = await chartQuery
  if (chartError) throw new Error(chartError.message)

  const charts = (chartRows ?? []).map(row => mapChart(row as Record<string, unknown>))
  const datasetIds = Array.from(new Set(charts.map(chart => chart.datasetId)))
  const { data: datasetRows, error: datasetError } = datasetIds.length > 0
    ? await supabase.from('semantic_datasets').select('id, status, selection').in('id', datasetIds)
    : { data: [], error: null }

  if (datasetError) throw new Error(datasetError.message)

  const datasets = new Map(
    ((datasetRows ?? []) as Record<string, unknown>[]).map(dataset => [String(dataset.id), dataset]),
  )
  const fieldIds = new Set<string>()
  const metricIds = new Set<string>()

  for (const dataset of datasets.values()) {
    const selection = selectionFromDataset(dataset)
    selection.fieldIds.forEach(fieldId => fieldIds.add(fieldId))
    selection.metricIds.forEach(metricId => metricIds.add(metricId))
  }

  const [fieldsResult, metricsResult] = await Promise.all([
    fieldIds.size > 0
      ? supabase.from('business_fields').select('*').in('id', Array.from(fieldIds))
      : Promise.resolve({ data: [], error: null }),
    metricIds.size > 0
      ? supabase.from('business_metrics').select('*').in('id', Array.from(metricIds))
      : Promise.resolve({ data: [], error: null }),
  ])

  if (fieldsResult.error) throw new Error(fieldsResult.error.message)
  if (metricsResult.error) throw new Error(metricsResult.error.message)

  const fieldsById = new Map(
    ((fieldsResult.data ?? []) as Record<string, unknown>[]).map(field => [String(field.id), field]),
  )
  const metricsById = new Map(
    ((metricsResult.data ?? []) as Record<string, unknown>[]).map(metric => [String(metric.id), metric]),
  )

  const items = charts.map(chart => {
    const dataset = datasets.get(chart.datasetId)
    const selection = dataset ? selectionFromDataset(dataset) : { fieldIds: [], metricIds: [] }
    const fields = selection.fieldIds.map(fieldId => fieldsById.get(fieldId)).filter(Boolean) as Record<string, unknown>[]
    const metrics = selection.metricIds.map(metricId => metricsById.get(metricId)).filter(Boolean) as Record<string, unknown>[]
    const validation: DashboardChartValidationResult = dataset
      ? validateDashboardChartConfig({ templateId: chart.templateId, encoding: chart.encoding, fields, metrics })
      : { state: 'invalid', issues: [{ severity: 'error', code: 'missing_dataset', message: 'Dataset not found.' }] }
    const healthState = healthStateFor({ chart, dataset, validationState: validation.state })

    return {
      chart: {
        id: chart.id,
        name: chart.name,
        status: chart.status,
        templateId: chart.templateId,
        validationState: chart.validationState,
        updatedAt: chart.updatedAt,
        publishedAt: chart.publishedAt,
      },
      dataset: dataset
        ? { id: chart.datasetId, status: String(dataset.status ?? 'unknown') }
        : { id: chart.datasetId, status: 'missing' },
      healthState,
      validation,
    }
  })

  return {
    checkedAt: new Date().toISOString(),
    summary: {
      total: items.length,
      healthy: items.filter(item => item.healthState === 'healthy').length,
      stale: items.filter(item => item.healthState === 'stale').length,
      blocked: items.filter(item => item.healthState === 'blocked').length,
    },
    items,
  }
}
