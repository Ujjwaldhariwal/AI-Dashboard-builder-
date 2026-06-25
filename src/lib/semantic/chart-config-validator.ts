import { getChartTemplate } from '@/lib/semantic/chart-template-registry'
import { analyzeDatasetChartOptions } from '@/lib/semantic/dataset-shape-analyzer'
import type { ChartTemplateId } from '@/types/chart-template'
import type { DashboardChartEncoding, DashboardChartValidationIssue } from '@/types/dashboard-chart'

type SemanticFieldRow = Record<string, unknown>
type SemanticMetricRow = Record<string, unknown>

function addIssue(
  issues: DashboardChartValidationIssue[],
  severity: DashboardChartValidationIssue['severity'],
  code: string,
  message: string,
) {
  issues.push({ severity, code, message })
}

export function validateDashboardChartConfig({
  templateId,
  encoding,
  fields,
  metrics,
}: {
  templateId: string
  encoding: DashboardChartEncoding
  fields: SemanticFieldRow[]
  metrics: SemanticMetricRow[]
}) {
  const issues: DashboardChartValidationIssue[] = []
  const template = getChartTemplate(templateId as ChartTemplateId)
  const fieldIds = new Set(fields.map(field => String(field.id)))
  const metricIds = new Set(metrics.map(metric => String(metric.id)))
  const { shape, compatibility } = analyzeDatasetChartOptions({ fields, metrics })

  if (!template) {
    addIssue(issues, 'error', 'unknown_template', `Unknown chart template "${templateId}".`)
  } else {
    const match = compatibility.find(option => option.template.id === template.id)
    if (!match || match.status === 'blocked') {
      addIssue(
        issues,
        'error',
        'template_incompatible',
        match?.reasons[0] ?? `Template "${template.name}" is not compatible with this dataset.`,
      )
    }
  }

  if (encoding.xAxisFieldId && !fieldIds.has(encoding.xAxisFieldId)) {
    addIssue(issues, 'error', 'invalid_x_axis', 'X axis field is not part of this dataset.')
  }

  if (encoding.seriesFieldId && !fieldIds.has(encoding.seriesFieldId)) {
    addIssue(issues, 'error', 'invalid_series_field', 'Series field is not part of this dataset.')
  }

  if (encoding.yMetricIds.length === 0) {
    addIssue(issues, 'error', 'missing_metrics', 'At least one Y metric is required.')
  }

  for (const metricId of encoding.yMetricIds) {
    if (!metricIds.has(metricId)) {
      addIssue(issues, 'error', 'invalid_metric', `Metric "${metricId}" is not part of this dataset.`)
    }
  }

  for (const metricId of encoding.stackMetricIds ?? []) {
    if (!metricIds.has(metricId)) {
      addIssue(issues, 'error', 'invalid_stack_metric', `Stack metric "${metricId}" is not part of this dataset.`)
    }
  }

  for (const fieldId of encoding.tooltipFieldIds) {
    if (!fieldIds.has(fieldId) && !metricIds.has(fieldId)) {
      addIssue(issues, 'warning', 'invalid_tooltip_field', `Tooltip field "${fieldId}" is not part of this dataset.`)
    }
  }

  if (encoding.limit !== null && encoding.limit !== undefined && (encoding.limit < 1 || encoding.limit > 500)) {
    addIssue(issues, 'error', 'invalid_limit', 'Chart row limit must be between 1 and 500.')
  }

  if (shape.dimensionCount > 2 && template?.id !== 'table-grid') {
    addIssue(issues, 'warning', 'dense_dimensions', 'Dataset has many dimensions; table-grid is usually safer.')
  }

  const hasErrors = issues.some(issue => issue.severity === 'error')
  const hasWarnings = issues.some(issue => issue.severity === 'warning') || shape.warnings.length > 0

  return {
    state: hasErrors ? 'invalid' as const : hasWarnings ? 'warning' as const : 'valid' as const,
    issues: [
      ...shape.warnings.map(message => ({
        severity: 'warning' as const,
        code: 'dataset_shape_warning',
        message,
      })),
      ...issues,
    ],
  }
}
