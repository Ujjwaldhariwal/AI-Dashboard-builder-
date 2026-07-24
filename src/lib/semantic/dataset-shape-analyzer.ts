import { CHART_TEMPLATE_REGISTRY } from '@/lib/semantic/chart-template-registry'
import type {
  ChartCompatibilityResult,
  ChartTemplateDefinition,
  DatasetShape,
  DatasetShapeField,
  DatasetShapeKind,
  DatasetShapeMetric,
  FieldValueKind,
} from '@/types/chart-template'
import type { BusinessFieldRole, BusinessMetricAggregation } from '@/types/semantic-model'

type SemanticFieldRow = Record<string, unknown>
type SemanticMetricRow = Record<string, unknown>

const DATE_TYPE_HINTS = ['date', 'time', 'timestamp']
const NUMBER_TYPE_HINTS = ['int', 'decimal', 'numeric', 'number', 'float', 'double', 'real']
const BOOLEAN_TYPE_HINTS = ['bool']

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function valueKindFromSource(field: SemanticFieldRow): FieldValueKind {
  const sourceColumn = asRecord(field.source_column ?? field.sourceColumn)
  const rawType = String(sourceColumn.dataType ?? sourceColumn.data_type ?? '').toLowerCase()
  const role = String(field.role ?? '')
  const semanticKey = String(field.semantic_key ?? field.semanticKey ?? '').toLowerCase()

  if (role === 'date' || DATE_TYPE_HINTS.some(hint => rawType.includes(hint) || semanticKey.includes(hint))) return 'date'
  if (NUMBER_TYPE_HINTS.some(hint => rawType.includes(hint))) return 'number'
  if (BOOLEAN_TYPE_HINTS.some(hint => rawType.includes(hint))) return 'boolean'
  if (rawType) return 'string'
  return 'unknown'
}

function normalizeField(field: SemanticFieldRow): DatasetShapeField {
  return {
    id: String(field.id),
    label: String(field.name ?? field.label ?? field.semantic_key ?? field.id),
    role: String(field.role ?? 'attribute') as BusinessFieldRole,
    valueKind: valueKindFromSource(field),
    semanticKey: typeof field.semantic_key === 'string'
      ? field.semantic_key
      : typeof field.semanticKey === 'string'
        ? field.semanticKey
        : undefined,
    displayFormat: typeof field.display_format === 'string'
      ? field.display_format
      : typeof field.displayFormat === 'string'
        ? field.displayFormat
        : null,
  }
}

function normalizeMetric(metric: SemanticMetricRow): DatasetShapeMetric {
  return {
    id: String(metric.id),
    label: String(metric.name ?? metric.label ?? metric.semantic_key ?? metric.id),
    aggregation: String(metric.aggregation ?? 'sum') as BusinessMetricAggregation,
    semanticKey: typeof metric.semantic_key === 'string'
      ? metric.semantic_key
      : typeof metric.semanticKey === 'string'
        ? metric.semanticKey
        : undefined,
    displayFormat: typeof metric.display_format === 'string'
      ? metric.display_format
      : typeof metric.displayFormat === 'string'
        ? metric.displayFormat
        : null,
    unit: typeof metric.unit === 'string' ? metric.unit : null,
  }
}

function inferShapeKind({
  dimensions,
  dateFields,
  metricCount,
}: {
  dimensions: DatasetShapeField[]
  dateFields: DatasetShapeField[]
  metricCount: number
}): DatasetShapeKind {
  const dimensionCount = dimensions.length
  const hasDateAxis = dateFields.length > 0

  if (dimensionCount === 0 && metricCount === 0) return 'empty'
  if (dimensionCount === 0 && metricCount === 1) return 'single_metric'
  if (dimensionCount === 0 && metricCount > 1) return 'wide_table'
  if (hasDateAxis && dimensionCount === 1 && metricCount === 1) return 'time_series'
  if (hasDateAxis && dimensionCount === 1 && metricCount > 1) return 'time_series_many_metrics'
  if (dimensionCount === 1 && metricCount === 1) return 'name_value'
  if (dimensionCount === 1 && metricCount > 1) return 'one_dimension_many_metrics'
  if (dimensionCount === 2 && metricCount === 1) return 'two_dimensions_one_metric'
  if (dimensionCount >= 2 && metricCount > 1) return 'event_list'
  return 'wide_table'
}

export function analyzeDatasetShape({
  fields,
  metrics,
}: {
  fields: SemanticFieldRow[]
  metrics: SemanticMetricRow[]
}): DatasetShape {
  const normalizedFields = fields.map(normalizeField)
  const normalizedMetrics = metrics.map(normalizeMetric)
  const dimensions = normalizedFields.filter(field => (
    field.role === 'dimension'
    || field.role === 'identifier'
    || field.role === 'attribute'
    || field.role === 'date'
  ))
  const dateFields = dimensions.filter(field => field.role === 'date' || field.valueKind === 'date')
  const tooltipFields = normalizedFields.filter(field => field.role !== 'hidden')
  const metricCount = normalizedMetrics.length
  const dimensionCount = dimensions.length
  const warnings: string[] = []

  if (dimensionCount > 2) {
    warnings.push('Dataset has more than two dimensions; table or drilldown layouts are safer than dense charts.')
  }
  if (metricCount > 6) {
    warnings.push('Dataset has more than six metrics; chart templates will require metric trimming or a table view.')
  }

  return {
    kind: inferShapeKind({ dimensions, dateFields, metricCount }),
    fields: normalizedFields,
    metrics: normalizedMetrics,
    dimensions,
    dateFields,
    tooltipFields,
    metricCount,
    dimensionCount,
    hasDateAxis: dateFields.length > 0,
    hasMultipleMetrics: metricCount > 1,
    warnings,
  }
}

function templateBlockReason(template: ChartTemplateDefinition, shape: DatasetShape) {
  const { requirement } = template

  if (requirement.allowedShapeKinds && !requirement.allowedShapeKinds.includes(shape.kind)) {
    return `Requires ${requirement.allowedShapeKinds.join(', ')} shape.`
  }
  if (requirement.blockedShapeKinds?.includes(shape.kind)) {
    return `Does not support ${shape.kind} shape.`
  }
  if (shape.dimensionCount < requirement.minDimensions) {
    return `Needs at least ${requirement.minDimensions} dimension(s).`
  }
  if (shape.dimensionCount > requirement.maxDimensions) {
    return `Allows at most ${requirement.maxDimensions} dimension(s).`
  }
  if (shape.metricCount < requirement.minMetrics) {
    return `Needs at least ${requirement.minMetrics} metric(s).`
  }
  if (shape.metricCount > requirement.maxMetrics) {
    return `Allows at most ${requirement.maxMetrics} metric(s).`
  }
  if (requirement.requiresDateAxis && !shape.hasDateAxis) {
    return 'Requires a date/time axis.'
  }

  return null
}

function scoreTemplate(template: ChartTemplateDefinition, shape: DatasetShape) {
  let score = template.priority
  if (template.requirement.allowedShapeKinds?.includes(shape.kind)) score += 20
  if (shape.hasMultipleMetrics && template.supports.multipleMetrics) score += 8
  if (shape.hasDateAxis && template.family === 'trend') score += 12
  if (shape.kind === 'event_list' && template.id === 'table-grid') score += 20
  if (shape.kind === 'one_dimension_many_metrics' && template.supports.stacking) score += 8
  return score
}

export function getChartCompatibility(shape: DatasetShape): ChartCompatibilityResult[] {
  const evaluated = CHART_TEMPLATE_REGISTRY.map(template => {
    const blockReason = templateBlockReason(template, shape)
    if (blockReason) {
      return {
        template,
        status: 'blocked' as const,
        score: 0,
        reasons: [blockReason],
      }
    }

    const score = scoreTemplate(template, shape)
    return {
      template,
      status: 'allowed' as const,
      score,
      reasons: ['Compatible with dataset shape.'],
    }
  }).sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name))

  const firstAllowed = evaluated.find(result => result.status === 'allowed')
  if (!firstAllowed) return evaluated

  return evaluated.map(result => (
    result === firstAllowed
      ? { ...result, status: 'recommended' as const, reasons: ['Best fit for this dataset shape.'] }
      : result
  ))
}

export function getDatasetTemplateAvailability(shape: DatasetShape): ChartCompatibilityResult[] {
  const evaluated = CHART_TEMPLATE_REGISTRY.map(template => {
    const { requirement } = template
    const blockReason = shape.dimensionCount < requirement.minDimensions
      ? `Needs at least ${requirement.minDimensions} dimension(s).`
      : shape.metricCount < requirement.minMetrics
        ? `Needs at least ${requirement.minMetrics} metric(s).`
        : requirement.requiresDateAxis && !shape.hasDateAxis
          ? 'Requires a date/time axis.'
          : null
    if (blockReason) {
      return {
        template,
        status: 'blocked' as const,
        score: 0,
        reasons: [blockReason],
      }
    }

    return {
      template,
      status: 'allowed' as const,
      score: scoreTemplate(template, shape),
      reasons: ['The dataset contains enough fields and metrics to build this chart projection.'],
    }
  }).sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name))

  const firstAllowed = evaluated.find(result => result.status === 'allowed')
  return evaluated.map(result => (
    result === firstAllowed
      ? { ...result, status: 'recommended' as const, reasons: ['Best available projection from this dataset.'] }
      : result
  ))
}

export function analyzeDatasetChartOptions(input: {
  fields: SemanticFieldRow[]
  metrics: SemanticMetricRow[]
}) {
  const shape = analyzeDatasetShape(input)
  return {
    shape,
    compatibility: getDatasetTemplateAvailability(shape),
  }
}
