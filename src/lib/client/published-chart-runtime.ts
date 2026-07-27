import type { DashboardReleaseChartSnapshot } from '@/lib/publishing/dashboard-release-snapshots'
import type { DashboardChartConfig } from '@/types/dashboard-chart'
import { normalizeDashboardChartPresentation } from '@/lib/charts/dashboard-chart-presentation'

export interface PublishedChartFieldResolutionInput {
  fieldNames: string[]
  rows: Record<string, unknown>[]
  requestedXField?: string
  requestedYFields?: string[]
  requestedTooltipFields?: string[]
  requestedSortField?: string
}

export interface PublishedChartFieldResolution {
  xField: string
  yFields: string[]
  tooltipFields: string[]
  sortField: string
}

export function mapPublishedChartEditableSource(row: Record<string, unknown>): DashboardChartConfig {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    datasetId: String(row.dataset_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as DashboardChartConfig['status'],
    templateId: String(row.template_id) as DashboardChartConfig['templateId'],
    encoding: row.encoding && typeof row.encoding === 'object'
      ? row.encoding as DashboardChartConfig['encoding']
      : { yMetricIds: [], tooltipFieldIds: [], labelById: {}, colorById: {} },
    presentation: normalizeDashboardChartPresentation(row.presentation),
    interactions: row.interactions && typeof row.interactions === 'object'
      ? row.interactions as DashboardChartConfig['interactions']
      : {},
    layout: row.layout && typeof row.layout === 'object'
      ? row.layout as DashboardChartConfig['layout']
      : { order: 0, gridSpan: 1 },
    validationState: String(row.validation_state ?? 'unknown') as DashboardChartConfig['validationState'],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
  }
}

export function indexPublishedChartEditors({
  releaseSnapshots,
  sourceChartRows,
}: {
  releaseSnapshots: DashboardReleaseChartSnapshot[]
  sourceChartRows: Record<string, unknown>[]
}) {
  const sourceChartsById = new Map(sourceChartRows.map(row => {
    const chart = mapPublishedChartEditableSource(row)
    return [chart.id, chart]
  }))

  return Object.fromEntries(releaseSnapshots.flatMap(snapshot => {
    const sourceChart = sourceChartsById.get(snapshot.sourceChartConfigId)
    return sourceChart ? [[snapshot.id, sourceChart] as const] : []
  }))
}

export function publishedDashboardDisplayName(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.replace(/\s+\d{12,17}$/, '').trim() || normalized
}

function comparableFieldName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

function resolveAvailableField(fieldNames: string[], requested?: string) {
  const candidate = requested?.trim()
  if (!candidate) return ''
  if (fieldNames.includes(candidate)) return candidate

  const normalized = comparableFieldName(candidate)
  return fieldNames.find(field => comparableFieldName(field) === normalized) ?? ''
}

function isNumericValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string' || !value.trim()) return false
  return Number.isFinite(Number(value.replace(/,/g, '').trim()))
}

function isNumericField(rows: Record<string, unknown>[], fieldName: string) {
  const populatedValues = rows
    .map(row => row[fieldName])
    .filter(value => value !== null && value !== undefined && value !== '')
  return populatedValues.length > 0 && populatedValues.some(isNumericValue)
}

function uniqueFields(fields: string[]) {
  return Array.from(new Set(fields.filter(Boolean)))
}

export function resolvePublishedChartFields({
  fieldNames,
  rows,
  requestedXField,
  requestedYFields = [],
  requestedTooltipFields = [],
  requestedSortField,
}: PublishedChartFieldResolutionInput): PublishedChartFieldResolution {
  const availableFields = uniqueFields([
    ...fieldNames,
    ...Object.keys(rows[0] ?? {}),
  ])
  const requestedX = resolveAvailableField(availableFields, requestedXField)
  const firstDimension = availableFields.find(field => !isNumericField(rows, field))
  const xField = requestedX || firstDimension || availableFields[0] || ''

  const resolvedRequestedMetrics = uniqueFields(requestedYFields
    .map(field => resolveAvailableField(availableFields, field)))
  const inferredMetrics = availableFields.filter(field => (
    field !== xField && isNumericField(rows, field)
  ))
  const yFields = resolvedRequestedMetrics.length > 0
    ? resolvedRequestedMetrics
    : inferredMetrics

  return {
    xField,
    yFields,
    tooltipFields: uniqueFields(requestedTooltipFields
      .map(field => resolveAvailableField(availableFields, field))),
    sortField: resolveAvailableField(availableFields, requestedSortField),
  }
}
