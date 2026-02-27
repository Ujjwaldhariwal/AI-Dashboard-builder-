'use client'
// All chart types in one registry — import from here everywhere

export const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

export type SupportedChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'horizontal-bar'
  | 'gauge'
  | 'status-card'
  | 'table'

/** Returns dynamic height class based on data length */
export function getChartHeight(dataLen: number): number {
  if (dataLen > 50) return 420
  if (dataLen > 20) return 320
  return 240
}
