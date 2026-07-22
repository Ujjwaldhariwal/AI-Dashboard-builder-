import { z } from 'zod'

import type { ChartTemplateId } from '@/types/chart-template'
import type { DashboardChartEncoding } from '@/types/dashboard-chart'

export const CHART_SUITE_COPILOT_VERSION = 'dashboardos.chart-suite.proposal.v1' as const

const TemplateSchema = z.enum([
  'bar', 'horizontal-bar', 'grouped-bar', 'horizontal-stacked-bar', 'line', 'trend-composed',
  'pie', 'gauge', 'ring-gauge', 'kpi-card', 'kpi-grid', 'drilldown-bar', 'table-grid',
])

const EncodingSchema = z.object({
  xAxisFieldId: z.string().uuid().optional(),
  yMetricIds: z.array(z.string().uuid()).min(1).max(6),
  seriesFieldId: z.string().uuid().optional(),
  stackMetricIds: z.array(z.string().uuid()).max(6).default([]),
  tooltipFieldIds: z.array(z.string().uuid()).max(12).default([]),
  labelById: z.record(z.string(), z.string()).default({}),
  colorById: z.record(z.string(), z.string()).default({}),
  sort: z.object({ byId: z.string().uuid(), direction: z.enum(['asc', 'desc']) }).nullable().default(null),
  limit: z.number().int().min(1).max(500).nullable().default(25),
  filters: z.array(z.object({
    fieldId: z.string().uuid(),
    operator: z.enum(['eq', 'not_eq', 'in', 'contains', 'gte', 'lte']),
    value: z.union([z.string().max(120), z.number(), z.boolean(), z.array(z.union([z.string().max(120), z.number(), z.boolean()])).min(1).max(12)]),
  }).strict()).max(4).default([]),
}).strict()

export const ChartSuiteDraftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''),
  templateId: TemplateSchema,
  encoding: EncodingSchema,
  presentation: z.object({
    size: z.enum(['compact', 'standard', 'wide', 'full']),
    showLegend: z.boolean(),
    showLabels: z.boolean(),
    valueFormat: z.string().max(80).nullable(),
  }).strict(),
  layout: z.object({ order: z.number().int().min(0), gridSpan: z.number().int().min(1).max(4) }).strict(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(2).max(500),
}).strict()

export const ChartSuiteCopilotProposalSchema = z.object({
  version: z.literal(CHART_SUITE_COPILOT_VERSION).default(CHART_SUITE_COPILOT_VERSION),
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(2).max(500),
  charts: z.array(ChartSuiteDraftSchema).min(1).max(12),
  warnings: z.array(z.string().trim().min(2).max(300)).max(20).default([]),
}).strict()

export type ChartSuiteCopilotProposal = z.infer<typeof ChartSuiteCopilotProposalSchema>

export interface ChartSuiteFieldEvidence {
  id: string
  name: string
  role: string
}

export interface ChartSuiteMetricEvidence {
  id: string
  name: string
  aggregation: string
}

function title(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function requestedCount(instruction: string, requestedTypeCount: number) {
  const match = instruction.match(/\b(\d{1,2})\s+(?:charts?|visuals?|widgets?)\b/i)
  return Math.min(12, Math.max(1, match ? Number(match[1]) : requestedTypeCount || 5))
}

function requestedTemplates(instruction: string): ChartTemplateId[] {
  const normalized = instruction.toLowerCase()
  const result: ChartTemplateId[] = []
  const append = (templateId: ChartTemplateId, pattern: RegExp, present: boolean) => {
    const match = normalized.match(pattern)
    const count = match ? Math.min(12, Number(match[1])) : present ? 1 : 0
    for (let index = 0; index < count; index += 1) result.push(templateId)
  }
  append('kpi-card', /\b(\d{1,2})\s+(?:kpis?|cards?)\b/, normalized.includes('kpi') || normalized.includes('card'))
  append('line', /\b(\d{1,2})\s+(?:line charts?|trends?)\b/, normalized.includes('line') || normalized.includes('trend'))
  append(normalized.includes('horizontal bar') ? 'horizontal-bar' : 'bar', /\b(\d{1,2})\s+(?:horizontal\s+)?bar charts?\b/, normalized.includes('bar'))
  append('pie', /\b(\d{1,2})\s+pie charts?\b/, normalized.includes('pie'))
  append('gauge', /\b(\d{1,2})\s+gauges?\b/, normalized.includes('gauge'))
  append('table-grid', /\b(\d{1,2})\s+tables?\b/, normalized.includes('table'))
  return result.slice(0, 12)
}

function defaultSize(templateId: ChartTemplateId): 'compact' | 'standard' | 'wide' | 'full' {
  if (templateId === 'kpi-card') return 'compact'
  if (templateId === 'table-grid') return 'full'
  if (['line', 'trend-composed', 'grouped-bar', 'horizontal-stacked-bar', 'drilldown-bar'].includes(templateId)) return 'wide'
  return 'standard'
}

export function buildDeterministicChartSuiteProposal({
  instruction,
  datasetName,
  fields,
  metrics,
  allowedTemplateIds,
}: {
  instruction: string
  datasetName: string
  fields: ChartSuiteFieldEvidence[]
  metrics: ChartSuiteMetricEvidence[]
  allowedTemplateIds: ChartTemplateId[]
}): ChartSuiteCopilotProposal {
  if (metrics.length === 0) throw new Error('Chart composition requires at least one approved metric.')
  const allowed = [...new Set(allowedTemplateIds)]
  if (allowed.length === 0) throw new Error('No compatible chart templates are available for this dataset.')
  const allRequested = requestedTemplates(instruction)
  const requested = allRequested.filter(template => allowed.includes(template))
  const templateSequence = [...requested, ...allowed.filter(template => !requested.includes(template))]
  const count = requestedCount(instruction, allRequested.length)
  const dateFields = fields.filter(field => field.role === 'date')
  const categoryFields = fields.filter(field => ['dimension', 'attribute'].includes(field.role))
  const fallbackFields = fields.filter(field => field.role !== 'identifier')

  const charts = Array.from({ length: count }, (_, index) => {
    const templateId = templateSequence[index % templateSequence.length]
    const metric = metrics[index % metrics.length]
    const prefersDate = templateId === 'line' || templateId === 'trend-composed'
    const axisPool = prefersDate && dateFields.length > 0 ? dateFields : categoryFields.length > 0 ? categoryFields : fallbackFields
    const axis = axisPool[index % Math.max(axisPool.length, 1)]
    const supportsMany = ['grouped-bar', 'horizontal-stacked-bar', 'trend-composed', 'kpi-grid', 'drilldown-bar', 'table-grid'].includes(templateId)
    const yMetricIds = supportsMany ? metrics.slice(0, Math.min(4, metrics.length)).map(item => item.id) : [metric.id]
    const encoding: DashboardChartEncoding = {
      ...(axis ? { xAxisFieldId: axis.id } : {}),
      yMetricIds,
      stackMetricIds: templateId === 'horizontal-stacked-bar' ? yMetricIds : [],
      tooltipFieldIds: [...(axis ? [axis.id] : []), ...yMetricIds],
      labelById: Object.fromEntries([...fields, ...metrics].map(item => [item.id, item.name])),
      colorById: {},
      sort: null,
      limit: templateId === 'kpi-card' ? 1 : 25,
      filters: [],
    }
    const chartName = templateId === 'kpi-card'
      ? metric.name
      : axis
        ? `${metric.name} by ${axis.name}`
        : `${metric.name} ${title(templateId)}`
    const size = defaultSize(templateId)
    return {
      name: chartName.slice(0, 120),
      description: `Editable ${title(templateId)} proposed from ${datasetName}.`,
      templateId,
      encoding,
      presentation: { size, showLegend: templateId !== 'kpi-card', showLabels: templateId === 'pie', valueFormat: null },
      layout: { order: index, gridSpan: size === 'compact' ? 1 : size === 'standard' ? 2 : size === 'wide' ? 3 : 4 },
      confidence: requested.includes(templateId) ? 0.9 : 0.82,
      rationale: requested.includes(templateId) ? 'Matches an explicitly requested visual type.' : 'Selected from templates compatible with the governed dataset shape.',
    }
  })
  const nameCounts = new Map<string, number>()
  const uniqueCharts = charts.map((chart) => {
    const key = chart.name.toLowerCase()
    const countForName = (nameCounts.get(key) ?? 0) + 1
    nameCounts.set(key, countForName)
    return countForName === 1 ? chart : { ...chart, name: `${chart.name} ${countForName}`.slice(0, 120) }
  })

  return ChartSuiteCopilotProposalSchema.parse({
    title: `${datasetName} dashboard`.slice(0, 120),
    summary: `${instruction.trim()} Proposed ${charts.length} editable chart drafts from compatible templates.`.slice(0, 500),
    charts: uniqueCharts,
    warnings: allRequested.some(template => !allowed.includes(template))
      ? ['At least one requested chart type was incompatible with the dataset and was replaced by a safe template.']
      : [],
  })
}
