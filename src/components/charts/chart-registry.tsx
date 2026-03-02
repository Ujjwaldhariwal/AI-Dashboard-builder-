'use client'

export const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

export type SupportedChartType =
  | 'bar' | 'line' | 'area' | 'pie'
  | 'donut' | 'horizontal-bar'
  | 'gauge' | 'status-card' | 'table'

export function getChartHeight(dataLen: number): number {
  if (dataLen > 50) return 440
  if (dataLen > 25) return 360
  if (dataLen > 10) return 300
  return 260
}

export function getTickInterval(dataLen: number): number {
  if (dataLen > 40) return Math.floor(dataLen / 8)
  if (dataLen > 20) return Math.floor(dataLen / 10)
  if (dataLen > 10) return 1
  return 0
}

export function getBottomMargin(dataLen: number): number {
  if (dataLen > 15) return 80
  if (dataLen > 8)  return 60
  return 36
}
