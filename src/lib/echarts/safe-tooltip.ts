import { formatChartLabel } from '@/lib/charts/chart-constants'
import { fmtValue } from '@/lib/echarts/style-translator'
import type { DashboardChartTextOverflow } from '@/types/dashboard-chart'
import type { WidgetStyle } from '@/types/widget'

export function escapeTooltipHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function formatTooltipHtmlLabel(
  value: unknown,
  overrides?: Record<string, string>,
  overflow?: DashboardChartTextOverflow,
  maxLength?: number,
) {
  return escapeTooltipHtml(
    formatChartLabel(value, overrides, overflow, maxLength),
  ).replaceAll('\n', '<br/>')
}

export function formatAuxiliaryTooltipRows({
  row,
  fields,
  style,
  excludedFields = [],
}: {
  row?: Record<string, unknown>
  fields?: string[]
  style: WidgetStyle
  excludedFields?: string[]
}) {
  if (!row || !fields?.length) return ''

  const excluded = new Set(excludedFields)
  const uniqueFields = [...new Set(fields)].filter(field => !excluded.has(field)).slice(0, 6)

  return uniqueFields.flatMap(field => {
    if (!Object.prototype.hasOwnProperty.call(row, field) || row[field] == null) return []

    const rawValue = row[field]
    const numericValue = typeof rawValue === 'number'
      ? rawValue
      : typeof rawValue === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(rawValue.trim())
        ? Number(rawValue)
        : null
    const value = numericValue !== null && Number.isFinite(numericValue)
      ? escapeTooltipHtml(fmtValue(numericValue, style.labelFormat, style.tooltipNumberFormat))
      : formatTooltipHtmlLabel(
          rawValue,
          undefined,
          style.tooltipLabelOverflow,
          style.tooltipLabelMaxLength,
        )

    return [`${formatTooltipHtmlLabel(
      field,
      style.tooltipLabelOverrides,
      style.tooltipLabelOverflow,
      style.tooltipLabelMaxLength,
    )}: <strong>${value}</strong>`]
  }).join('<br/>')
}
