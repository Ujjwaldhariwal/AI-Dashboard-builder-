// Module: ChartSelector
// src/lib/ai/chart-selector.ts
import { ChartType } from '@/types/widget'
import { DataField, FieldType } from './data-analyzer'

export interface ChartScore {
  type: ChartType
  score: number
  reason: string
}

/**
 * Pure heuristic scoring — used as offline fallback + internal ranking.
 * Returns all 9 types ranked best → worst for given fields.
 */
export function scoreChartTypes(fields: DataField[]): ChartScore[] {
  const numbers    = fields.filter(f => f.type === 'number').length
  const dates      = fields.filter(f => f.type === 'date').length
  const categories = fields.filter(f => f.type === 'string').length
  const booleans   = fields.filter(f => f.type === 'boolean').length
  const total      = fields.length

  const scores: ChartScore[] = [
    {
      type: 'bar',
      score: categories > 0 && numbers > 0 ? 90 : 40,
      reason: 'Best for comparing values across categories',
    },
    {
      type: 'line',
      score: dates > 0 && numbers > 0 ? 88 : numbers > 1 ? 60 : 30,
      reason: 'Best for continuous trends over time or sequences',
    },
    {
      type: 'area',
      score: dates > 0 && numbers > 0 ? 85 : 35,
      reason: 'Best for cumulative trends over time',
    },
    {
      type: 'pie',
      score: categories > 0 && numbers > 0 && total <= 6 ? 75 : 30,
      reason: 'Best for proportional distributions with few categories',
    },
    {
      type: 'donut',
      score: categories > 0 && numbers > 0 && total <= 8 ? 70 : 28,
      reason: 'Pie variant with centre metric display',
    },
    {
      type: 'horizontal-bar',
      score: categories > 0 && numbers > 0 ? 72 : 30,
      reason: 'Better than bar when category labels are long',
    },
    {
      type: 'gauge',
      score: numbers === 1 ? 65 : 20,
      reason: 'Best for single KPI against a target range',
    },
    {
      type: 'status-card',
      score: numbers >= 1 ? 60 : 25,
      reason: 'Best for headline KPI metrics',
    },
    {
      type: 'table',
      score: total > 4 ? 80 : 50,
      reason: 'Best for raw data exploration with many fields',
    },
  ]

  return scores.sort((a, b) => b.score - a.score)
}

/**
 * Returns the single best chart type for given fields.
 */
export function selectBestChartType(fields: DataField[]): ChartType {
  return scoreChartTypes(fields)[0]?.type ?? 'bar'
}
