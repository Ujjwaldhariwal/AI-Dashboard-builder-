import type { WidgetSizePreset } from '@/lib/builder/widget-size'

export const DEFAULT_CHART_MARGIN = { top: 16, right: 16, bottom: 16, left: 16 } as const
export const COMPACT_CHART_MARGIN = { top: 8, right: 8, bottom: 8, left: 8 } as const

function normalizeSizePreset(sizePreset?: WidgetSizePreset): WidgetSizePreset {
  return sizePreset ?? 'medium'
}

export function getChartMargin(sizePreset?: WidgetSizePreset) {
  return normalizeSizePreset(sizePreset) === 'small'
    ? COMPACT_CHART_MARGIN
    : DEFAULT_CHART_MARGIN
}

export function getLegendVisibility(sizePreset: WidgetSizePreset | undefined, showLegendFlag?: boolean) {
  if (normalizeSizePreset(sizePreset) === 'small') return false
  return showLegendFlag !== false
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
