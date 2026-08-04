import { getChartTemplate } from '@/lib/semantic/chart-template-registry'
import {
  DashboardChartPresentationPatchSchema,
  DashboardChartPresentationSchema,
} from '@/lib/charts/dashboard-chart-presentation'
import type { DashboardChartPresentationPatch } from '@/lib/charts/dashboard-chart-presentation'
import { analyzeDatasetChartOptions } from '@/lib/semantic/dataset-shape-analyzer'
import type { ChartTemplateId } from '@/types/chart-template'
import type {
  DashboardChartEncoding,
  DashboardChartPresentation,
  DashboardChartValidationIssue,
} from '@/types/dashboard-chart'

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

function semanticFieldDataType(field: SemanticFieldRow | undefined) {
  if (!field) return ''
  const sourceColumn = field.source_column && typeof field.source_column === 'object'
    ? field.source_column as Record<string, unknown>
    : {}
  return String(
    sourceColumn.dataType
    ?? sourceColumn.data_type
    ?? field.dataType
    ?? field.data_type
    ?? field.role
    ?? '',
  ).toLowerCase()
}

function isDateField(field: SemanticFieldRow | undefined) {
  return /date|time|timestamp/.test(semanticFieldDataType(field))
}

function isNumericField(field: SemanticFieldRow | undefined) {
  return /int|number|numeric|decimal|float|double|real|measure/.test(semanticFieldDataType(field))
}

function hasAxisCapability(
  axes: readonly ('x' | 'y')[],
  axis: 'x' | 'y',
) {
  return axes.includes(axis)
}

/**
 * Validates only explicitly requested presentation paths. Full chart configs
 * contain defaults such as showLegend/showGrid that should not be interpreted
 * as a user request for an unsupported feature.
 */
export function validateDashboardChartPresentationPatch({
  templateId,
  presentation,
  encoding,
  fields,
  metrics,
}: {
  templateId: string
  presentation: DashboardChartPresentationPatch
  encoding: DashboardChartEncoding
  fields: SemanticFieldRow[]
  metrics: SemanticMetricRow[]
}) {
  const issues: DashboardChartValidationIssue[] = []
  const parsed = DashboardChartPresentationPatchSchema.safeParse(presentation)
  if (!parsed.success) {
    addIssue(
      issues,
      'error',
      'invalid_presentation',
      parsed.error.issues[0]?.message ?? 'Chart presentation settings are invalid.',
    )
    return issues
  }

  const patch = parsed.data
  const template = getChartTemplate(templateId as ChartTemplateId)
  if (!template) {
    addIssue(issues, 'error', 'unknown_template', `Unknown chart template "${templateId}".`)
    return issues
  }

  const capabilities = template.supports.presentation
  const fieldById = new Map(fields.map(field => [String(field.id), field]))
  const fieldIds = new Set(fieldById.keys())
  const metricIds = new Set(metrics.map(metric => String(metric.id)))
  const selectedMetricIds = new Set([
    ...encoding.yMetricIds,
    ...(encoding.stackMetricIds ?? []),
  ])
  const tooltipTargetIds = new Set([
    ...selectedMetricIds,
    ...encoding.tooltipFieldIds,
  ])

  if (patch.showGrid !== undefined && !capabilities.grid) {
    addIssue(issues, 'error', 'unsupported_grid', `${template.name} does not support grid visibility.`)
  }
  if (
    (patch.showLegend !== undefined || patch.legendPosition !== undefined)
    && !capabilities.legend.visibility
  ) {
    addIssue(issues, 'error', 'unsupported_legend', `${template.name} does not support a legend.`)
  }
  if (patch.density !== undefined && !capabilities.density) {
    addIssue(issues, 'error', 'unsupported_density', `${template.name} does not support density changes.`)
  }

  for (const axis of ['x', 'y'] as const) {
    const axisPatch = patch[`${axis}Axis`]
    if (!axisPatch) continue
    if (!capabilities.axes[axis]) {
      addIssue(issues, 'error', 'unsupported_axis', `${template.name} does not support a ${axis.toUpperCase()} axis.`)
      continue
    }
    if (
      axisPatch.labelFontWeight !== undefined
      && !hasAxisCapability(capabilities.axes.fontWeight, axis)
    ) {
      addIssue(issues, 'error', 'unsupported_axis_font_weight', `${template.name} does not support ${axis.toUpperCase()}-axis font weight.`)
    }
    if (
      axisPatch.labelRotation !== undefined
      && !hasAxisCapability(capabilities.axes.rotation, axis)
    ) {
      addIssue(issues, 'error', 'unsupported_axis_rotation', `${template.name} does not support ${axis.toUpperCase()}-axis rotation.`)
    }
    if (
      axisPatch.labelOverflow !== undefined
      && !hasAxisCapability(capabilities.axes.overflow, axis)
    ) {
      addIssue(issues, 'error', 'unsupported_axis_overflow', `${template.name} does not support ${axis.toUpperCase()}-axis overflow controls.`)
    }
    if (
      axisPatch.labelFormat !== undefined
      && !hasAxisCapability(capabilities.axes.dateFormat, axis)
    ) {
      addIssue(issues, 'error', 'unsupported_axis_date_format', `${template.name} does not support ${axis.toUpperCase()}-axis date formatting.`)
    }
    if (
      axisPatch.numberFormat !== undefined
      && !hasAxisCapability(capabilities.axes.numberFormat, axis)
    ) {
      addIssue(issues, 'error', 'unsupported_axis_number_format', `${template.name} does not support ${axis.toUpperCase()}-axis number formatting.`)
    }
  }

  if (patch.xAxis?.labelFormat && patch.xAxis.labelFormat !== 'auto') {
    const xField = fieldById.get(encoding.xAxisFieldId ?? '')
    if (!isDateField(xField)) {
      addIssue(issues, 'error', 'date_format_requires_date_field', 'X-axis date formatting requires a governed date field.')
    }
  }
  if (patch.xAxis?.numberFormat) {
    const numericSource = template.id === 'horizontal-bar' || template.id === 'horizontal-stacked-bar'
      ? metrics.find(metric => selectedMetricIds.has(String(metric.id)))
      : fieldById.get(encoding.xAxisFieldId ?? '')
    if (!numericSource || (!metricIds.has(String(numericSource.id)) && !isNumericField(numericSource))) {
      addIssue(issues, 'error', 'number_format_requires_numeric_axis', 'X-axis number formatting requires a governed numeric axis.')
    }
  }
  if (patch.yAxis?.numberFormat && selectedMetricIds.size === 0) {
    addIssue(issues, 'error', 'number_format_requires_metric', 'Y-axis number formatting requires a governed metric.')
  }

  if (patch.legend) {
    if (
      (patch.legend.labelFontSize !== undefined || patch.legend.labelFontWeight !== undefined)
      && !capabilities.legend.visibility
    ) {
      addIssue(issues, 'error', 'unsupported_legend', `${template.name} does not support a legend.`)
    }
    if (patch.legend.labelOverflow !== undefined && !capabilities.legend.overflow) {
      addIssue(issues, 'error', 'unsupported_legend_overflow', `${template.name} does not support legend overflow controls.`)
    }
    if (patch.legend.labelOverrides && !capabilities.legend.labelOverrides) {
      addIssue(issues, 'error', 'unsupported_legend_overrides', `${template.name} does not support governed legend overrides.`)
    }
    for (const override of patch.legend.labelOverrides ?? []) {
      if (!selectedMetricIds.has(override.targetId) || !metricIds.has(override.targetId)) {
        addIssue(issues, 'error', 'invalid_legend_override_target', 'Legend overrides must target a selected governed metric.')
      }
    }
  }

  if (patch.tooltip) {
    if (patch.tooltip.enabled !== undefined && !capabilities.tooltip.visibility) {
      addIssue(issues, 'error', 'unsupported_tooltip', `${template.name} does not support tooltips.`)
    }
    if (patch.tooltip.labelOverflow !== undefined && !capabilities.tooltip.overflow) {
      addIssue(issues, 'error', 'unsupported_tooltip_overflow', `${template.name} does not support tooltip overflow controls.`)
    }
    if (patch.tooltip.numberFormat !== undefined && !capabilities.tooltip.numberFormat) {
      addIssue(issues, 'error', 'unsupported_tooltip_number_format', `${template.name} does not support tooltip number formatting.`)
    }
    if (patch.tooltip.labelOverrides && !capabilities.tooltip.labelOverrides) {
      addIssue(issues, 'error', 'unsupported_tooltip_overrides', `${template.name} does not support governed tooltip overrides.`)
    }
    for (const override of patch.tooltip.labelOverrides ?? []) {
      const governed = fieldIds.has(override.targetId) || metricIds.has(override.targetId)
      if (!governed || !tooltipTargetIds.has(override.targetId)) {
        addIssue(issues, 'error', 'invalid_tooltip_override_target', 'Tooltip overrides must target a selected governed field or metric.')
      }
    }
  }

  if (patch.showLabels !== undefined && !capabilities.valueLabels.visibility) {
    addIssue(issues, 'error', 'unsupported_value_labels', `${template.name} does not support value-label visibility.`)
  }
  if (patch.labels?.numberFormat !== undefined && !capabilities.valueLabels.numberFormat) {
    addIssue(issues, 'error', 'unsupported_value_label_number_format', `${template.name} does not support value-label number formatting.`)
  }
  if (patch.labels?.collision !== undefined && !capabilities.valueLabels.collision) {
    addIssue(issues, 'error', 'unsupported_value_label_collision', `${template.name} does not support value-label collision controls.`)
  }

  return issues
}

export function validateDashboardChartConfig({
  templateId,
  encoding,
  presentation,
  fields,
  metrics,
}: {
  templateId: string
  encoding: DashboardChartEncoding
  presentation?: DashboardChartPresentation
  fields: SemanticFieldRow[]
  metrics: SemanticMetricRow[]
}) {
  const issues: DashboardChartValidationIssue[] = []
  const template = getChartTemplate(templateId as ChartTemplateId)
  const fieldIds = new Set(fields.map(field => String(field.id)))
  const metricIds = new Set(metrics.map(metric => String(metric.id)))
  const projectedFieldIds = new Set([
    encoding.xAxisFieldId,
    encoding.seriesFieldId,
  ].filter((id): id is string => Boolean(id)))
  const projectedMetricIds = new Set([
    ...encoding.yMetricIds,
    ...(encoding.stackMetricIds ?? []),
  ])
  const projectedFields = fields.filter(field => projectedFieldIds.has(String(field.id)))
  const projectedMetrics = metrics.filter(metric => projectedMetricIds.has(String(metric.id)))
  const { shape, compatibility } = analyzeDatasetChartOptions({
    fields: projectedFields,
    metrics: projectedMetrics,
  })

  if (presentation) {
    const presentationResult = DashboardChartPresentationSchema.safeParse(presentation)
    if (!presentationResult.success) {
      addIssue(
        issues,
        'error',
        'invalid_presentation',
        presentationResult.error.issues[0]?.message ?? 'Chart presentation settings are invalid.',
      )
    } else {
      const normalized = presentationResult.data
      issues.push(...validateDashboardChartPresentationPatch({
        templateId,
        encoding,
        fields,
        metrics,
        presentation: {
          density: normalized.density,
          xAxis: normalized.xAxis,
          yAxis: normalized.yAxis,
          legend: normalized.legend,
          labels: normalized.labels
            ? {
              numberFormat: normalized.labels.numberFormat,
              collision: normalized.labels.collision,
            }
            : undefined,
          tooltip: normalized.tooltip
            ? {
              labelOverflow: normalized.tooltip.labelOverflow,
              labelMaxLength: normalized.tooltip.labelMaxLength,
              labelOverrides: normalized.tooltip.labelOverrides,
              numberFormat: normalized.tooltip.numberFormat,
            }
            : undefined,
        },
      }))
    }
  }

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

  if ((encoding.filters?.length ?? 0) > 4) {
    addIssue(issues, 'error', 'too_many_filters', 'Chart filters are limited to four predicates.')
  }

  for (const filter of encoding.filters ?? []) {
    if (!fieldIds.has(filter.fieldId)) {
      addIssue(issues, 'error', 'invalid_filter_field', 'Filter field is not part of this dataset.')
    }
    if (filter.operator === 'in') {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        addIssue(issues, 'error', 'invalid_filter_value', 'In filters require one or more values.')
      }
      if (Array.isArray(filter.value) && filter.value.length > 12) {
        addIssue(issues, 'error', 'invalid_filter_value', 'In filters are limited to 12 values.')
      }
    } else if (Array.isArray(filter.value)) {
      addIssue(issues, 'error', 'invalid_filter_value', 'This filter operator requires a single value.')
    }
    if ((filter.operator === 'gte' || filter.operator === 'lte') && typeof filter.value === 'boolean') {
      addIssue(issues, 'error', 'invalid_filter_value', 'Range filters require a text, date, or numeric value.')
    }
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
