import type { WidgetSizePreset } from '@/lib/builder/widget-size'

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
