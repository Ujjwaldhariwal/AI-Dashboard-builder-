import { z } from 'zod'

import type { ChartTemplateId } from '@/types/chart-template'
import type { ChartType } from '@/types/widget'

export const DASHBOARD_BRIEF_VERSION = 1 as const

export const BRIEF_CHART_TYPES = [
  'auto',
  'bar',
  'line',
  'area',
  'pie',
  'donut',
  'horizontal-bar',
  'horizontal-stacked-bar',
  'grouped-bar',
  'drilldown-bar',
  'gauge',
  'ring-gauge',
  'status-card',
  'table',
] as const

export type BriefChartType = ChartType | 'auto'

export const DashboardRequirementMetricSchema = z.object({
  concept: z.string().trim().min(2).max(120),
  aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count', 'count_distinct']),
}).strict()

export const DashboardChartRequirementSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  instruction: z.string().trim().max(500).default(''),
  chartType: z.enum(BRIEF_CHART_TYPES),
  lockChartType: z.boolean().default(true),
  metric: DashboardRequirementMetricSchema.nullable().default(null),
  dimensions: z.array(z.string().trim().min(2).max(120)).max(6).default([]),
  timeGrain: z.enum(['day', 'week', 'month', 'quarter', 'year']).nullable().default(null),
  required: z.boolean().default(true),
}).strict()

export const DashboardBriefSchema = z.object({
  version: z.literal(DASHBOARD_BRIEF_VERSION).default(DASHBOARD_BRIEF_VERSION),
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  objective: z.string().trim().min(3).max(2_000),
  requirements: z.array(DashboardChartRequirementSchema).min(1).max(24),
  updatedAt: z.string().datetime(),
}).strict()

export type DashboardChartRequirement = z.infer<typeof DashboardChartRequirementSchema>
export type DashboardBrief = z.infer<typeof DashboardBriefSchema>

export function dashboardRequirementTemplateId(
  requirement: Pick<DashboardChartRequirement, 'chartType' | 'instruction' | 'timeGrain'>,
): ChartTemplateId {
  if (requirement.chartType === 'status-card') return 'kpi-card'
  if (requirement.chartType === 'table') return 'table-grid'
  if (requirement.chartType === 'donut') return 'pie'
  if (requirement.chartType === 'area') return 'line'
  if (requirement.chartType !== 'auto') return requirement.chartType
  if (requirement.timeGrain || /\b(trend|daily|weekly|monthly|quarterly|yearly|over time)\b/i.test(requirement.instruction)) return 'line'
  if (/\b(by|breakdown|compare|comparison|ranking)\b/i.test(requirement.instruction)) return 'bar'
  return 'kpi-card'
}

export function parseDashboardBrief(value: unknown): DashboardBrief | null {
  const parsed = DashboardBriefSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
