import type { WidgetSizePreset } from '@/lib/builder/widget-size'
import type {
  DashboardChartDateFormat,
  DashboardChartDensity,
  DashboardChartLocale,
  DashboardChartTextOverflow,
  DashboardChartTimeZone,
} from '@/types/dashboard-chart'

export const DEFAULT_CHART_MARGIN = { top: 16, right: 16, bottom: 16, left: 16 } as const
export const COMPACT_CHART_MARGIN = { top: 8, right: 8, bottom: 8, left: 8 } as const

function normalizeSizePreset(sizePreset?: WidgetSizePreset): WidgetSizePreset {
  return sizePreset ?? 'medium'
}

export function getChartMargin(
  sizePreset?: WidgetSizePreset,
  override?: Partial<{ top: number; right: number; bottom: number; left: number }>,
) {
  const base = normalizeSizePreset(sizePreset) === 'small'
    ? COMPACT_CHART_MARGIN
    : DEFAULT_CHART_MARGIN
  return { ...base, ...(override ?? {}) }
}

export function getLegendVisibility(sizePreset: WidgetSizePreset | undefined, showLegendFlag?: boolean) {
  if (showLegendFlag !== undefined) return showLegendFlag
  if (normalizeSizePreset(sizePreset) === 'small') return false
  return showLegendFlag !== false
}

export function chartFontWeight(value?: 'normal' | 'medium' | 'bold') {
  if (value === 'bold') return 700
  if (value === 'medium') return 500
  return 400
}

export function formatCategoryAxisLabel(
  value: unknown,
  format: DashboardChartDateFormat = 'auto',
  locale?: DashboardChartLocale,
  timeZone?: DashboardChartTimeZone,
) {
  const label = String(value ?? '')
  if (format === 'auto') return label
  if (format === 'date-only' && !locale && !timeZone) {
    return label.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/)?.[1] ?? label
  }

  const preservedDate = label.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/)
  const date = (timeZone ?? 'preserve') === 'preserve' && preservedDate
    ? new Date(Date.UTC(
      Number(preservedDate[1]),
      Number(preservedDate[2]) - 1,
      Number(preservedDate[3]),
    ))
    : new Date(label)
  if (Number.isNaN(date.getTime())) return label

  const options: Intl.DateTimeFormatOptions = format === 'date-only'
    ? { year: 'numeric', month: '2-digit', day: '2-digit' }
    : format === 'month-short'
      ? { month: 'short' }
      : format === 'month-year'
        ? { month: 'short', year: 'numeric' }
        : { year: 'numeric' }
  return new Intl.DateTimeFormat(locale ?? 'en-US', {
    ...options,
    timeZone: 'UTC',
  }).format(date)
}

export function formatChartText(
  value: unknown,
  overflow: DashboardChartTextOverflow = 'none',
  maxLength = 20,
) {
  const label = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (overflow === 'none' || label.length <= maxLength) return label
  if (overflow === 'truncate') return `${label.slice(0, Math.max(1, maxLength - 1))}…`

  const words = label.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxLength) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word.length > maxLength
      ? `${word.slice(0, Math.max(1, maxLength - 1))}…`
      : word
    if (lines.length === 2) break
  }
  if (current && lines.length < 2) lines.push(current)
  if (lines.length === 2 && words.join(' ').length > lines.join(' ').length) {
    lines[1] = `${lines[1].slice(0, Math.max(1, maxLength - 1))}…`
  }
  return lines.join('\n')
}

export function formatChartLabel(
  value: unknown,
  overrides?: Record<string, string>,
  overflow?: DashboardChartTextOverflow,
  maxLength?: number,
) {
  const label = String(value ?? '')
  return formatChartText(overrides?.[label] ?? label, overflow, maxLength ?? 20)
}

export function getChartDensityLayout(density: DashboardChartDensity = 'comfortable') {
  if (density === 'compact') {
    return {
      axisLabelMargin: 6,
      legendItemGap: 8,
      barCategoryGap: '50%',
      symbolSize: 4,
      contentPadding: 'p-3',
    } as const
  }
  if (density === 'spacious') {
    return {
      axisLabelMargin: 14,
      legendItemGap: 18,
      barCategoryGap: '25%',
      symbolSize: 7,
      contentPadding: 'p-6',
    } as const
  }
  return {
    axisLabelMargin: 10,
    legendItemGap: 12,
    barCategoryGap: '35%',
    symbolSize: 5,
    contentPadding: 'p-4',
  } as const
}

export function getLegendLayout(
  position: 'top' | 'right' | 'bottom' | 'left' | undefined,
  margin: { top: number; right: number; bottom: number; left: number },
) {
  if (position === 'right') return { orient: 'vertical' as const, right: margin.right, top: 'middle' as const }
  if (position === 'left') return { orient: 'vertical' as const, left: margin.left, top: 'middle' as const }
  if (position === 'bottom') return { orient: 'horizontal' as const, bottom: margin.bottom - 8, left: 'center' as const }
  return { orient: 'horizontal' as const, top: margin.top - 4, right: margin.right }
}

export function getCategoryTickInterval(sizePreset: WidgetSizePreset | undefined, dataLen: number) {
  const size = normalizeSizePreset(sizePreset)
  if (dataLen <= 0) return 0

  if (size === 'small') {
    if (dataLen <= 4) return 0
    if (dataLen <= 8) return 1
    if (dataLen <= 16) return 2
    return Math.max(2, Math.floor(dataLen / 5))
  }

  if (size === 'medium') {
    if (dataLen <= 10) return 0
    if (dataLen <= 20) return 1
    return Math.max(1, Math.floor(dataLen / 10))
  }

  if (dataLen <= 18) return 0
  if (dataLen <= 36) return 1
  return Math.max(1, Math.floor(dataLen / 18))
}

export function showValueLabels(sizePreset: WidgetSizePreset | undefined, dataLen: number) {
  const size = normalizeSizePreset(sizePreset)
  return (size === 'large' || size === 'full') && dataLen < 20
}
