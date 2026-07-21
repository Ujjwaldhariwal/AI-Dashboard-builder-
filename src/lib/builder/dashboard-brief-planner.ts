import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import {
  fetchEndpointPayloadWithCache,
  type EndpointRuntimeTarget,
} from '@/lib/api/endpoint-runtime-cache'
import { applyAutoLayout, getNextWidgetStartY } from '@/lib/builder/auto-widget-generator'
import type { DashboardBrief, DashboardChartRequirement } from '@/types/dashboard-brief'
import type { ChartType, Widget } from '@/types/widget'

export interface BriefFieldProfile {
  name: string
  type: string
}

export interface BriefEndpointProfile {
  endpointId: string
  endpointName: string
  fields: BriefFieldProfile[]
}

export interface DashboardBriefDraft {
  requirementId: string
  endpointId: string
  endpointName: string
  title: string
  type: ChartType
  xAxis: string
  yAxis?: string
  confidence: number
  reason: string
  locked: boolean
  position: { x: number; y: number; w: number; h: number }
}

export interface DashboardBriefPlan {
  brief: DashboardBrief
  drafts: DashboardBriefDraft[]
  retainedRequirementIds: string[]
  unresolved: Array<{ requirementId: string; title: string; reason: string }>
  profiledEndpointCount: number
}

const TIME_WORDS = new Set(['date', 'day', 'week', 'month', 'quarter', 'year', 'time', 'trend', 'daily', 'weekly', 'monthly'])
const VALUE_WORDS = new Set(['amount', 'average', 'avg', 'balance', 'consumption', 'cost', 'count', 'margin', 'price', 'profit', 'revenue', 'sales', 'total', 'usage', 'value'])
const IDENTIFIER_RE = /(^id$|_id$|uuid|identifier)/i

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1)
}

function overlapScore(needles: string[], value: string) {
  const haystack = new Set(words(value))
  return needles.reduce((score, word) => score + (haystack.has(word) ? 5 : 0), 0)
}

function isNumeric(field: BriefFieldProfile) {
  return /number|integer|float|double|decimal|numeric|bigint|smallint/i.test(field.type)
}

function isDate(field: BriefFieldProfile) {
  return /date|time/i.test(field.type) || TIME_WORDS.has(field.name.toLowerCase()) || /(date|time|month|year|week|day)/i.test(field.name)
}

function requirementWords(brief: DashboardBrief, requirement: DashboardChartRequirement) {
  const specific = words(`${requirement.title} ${requirement.instruction}`)
  return [...specific, ...specific, ...words(brief.objective)]
}

function rankEndpoint(profile: BriefEndpointProfile, terms: string[]) {
  const fieldScore = profile.fields.reduce((score, field) => score + overlapScore(terms, field.name), 0)
  const endpointScore = overlapScore(terms, profile.endpointName) * 2
  const usableBonus = profile.fields.some(isNumeric) ? 4 : 0
  return fieldScore + endpointScore + usableBonus
}

function chooseMetric(fields: BriefFieldProfile[], terms: string[]) {
  const numeric = fields.filter(field => isNumeric(field) && !IDENTIFIER_RE.test(field.name))
  return [...numeric].sort((left, right) => {
    const rightScore = overlapScore(terms, right.name) + (words(right.name).some(word => VALUE_WORDS.has(word)) ? 2 : 0)
    const leftScore = overlapScore(terms, left.name) + (words(left.name).some(word => VALUE_WORDS.has(word)) ? 2 : 0)
    return rightScore - leftScore
  })[0] ?? null
}

function chooseDimension(fields: BriefFieldProfile[], terms: string[], chartType: ChartType) {
  const candidates = fields.filter(field => !isNumeric(field) && !IDENTIFIER_RE.test(field.name))
  const wantsTime = ['line', 'area'].includes(chartType) || terms.some(term => TIME_WORDS.has(term))
  return [...candidates].sort((left, right) => {
    const rightScore = overlapScore(terms, right.name) + (wantsTime && isDate(right) ? 8 : 0)
    const leftScore = overlapScore(terms, left.name) + (wantsTime && isDate(left) ? 8 : 0)
    return rightScore - leftScore
  })[0] ?? fields.find(field => !IDENTIFIER_RE.test(field.name)) ?? null
}

function resolveChartType(requirement: DashboardChartRequirement, fields: BriefFieldProfile[], terms: string[]): ChartType {
  if (requirement.chartType !== 'auto' && requirement.lockChartType) return requirement.chartType

  const hasMetric = fields.some(field => isNumeric(field) && !IDENTIFIER_RE.test(field.name))
  const hasDate = fields.some(isDate)
  const wantsKpi = terms.some(term => ['kpi', 'total', 'headline', 'summary'].includes(term))
  const wantsTable = terms.some(term => ['detail', 'records', 'table', 'list'].includes(term))
  if (wantsTable) return 'table'
  if (wantsKpi && hasMetric) return 'status-card'
  if (hasDate && hasMetric) return 'line'
  if (hasMetric) return 'bar'
  return 'table'
}

function existingRequirementIds(widgets: Widget[]) {
  return new Set(widgets.flatMap(widget => {
    const metadata = widget.dataMapping.autopilot
    return metadata?.requirementId ? [metadata.requirementId] : []
  }))
}

export function buildDashboardBriefPlan(input: {
  brief: DashboardBrief
  profiles: BriefEndpointProfile[]
  widgets: Widget[]
}): DashboardBriefPlan {
  const retained = existingRequirementIds(input.widgets)
  const draftsWithoutPosition: Array<Omit<DashboardBriefDraft, 'position'>> = []
  const unresolved: DashboardBriefPlan['unresolved'] = []

  for (const requirement of input.brief.requirements) {
    if (retained.has(requirement.id)) continue
    const terms = requirementWords(input.brief, requirement)
    const profile = [...input.profiles].sort((left, right) => rankEndpoint(right, terms) - rankEndpoint(left, terms))[0]
    if (!profile) {
      unresolved.push({ requirementId: requirement.id, title: requirement.title, reason: 'No readable endpoint profile is available.' })
      continue
    }

    const type = resolveChartType(requirement, profile.fields, terms)
    const metric = chooseMetric(profile.fields, terms)
    const dimension = chooseDimension(profile.fields, terms, type)
    const needsMetric = type !== 'table'
    const needsDimension = !['gauge', 'ring-gauge', 'status-card'].includes(type)
    if (needsMetric && !metric) {
      unresolved.push({ requirementId: requirement.id, title: requirement.title, reason: `${profile.endpointName} has no usable numeric measure.` })
      continue
    }
    if (needsDimension && !dimension) {
      unresolved.push({ requirementId: requirement.id, title: requirement.title, reason: `${profile.endpointName} has no usable category or date field.` })
      continue
    }

    const matchedTerms = [metric?.name, dimension?.name, profile.endpointName]
      .filter((value): value is string => Boolean(value))
      .reduce((score, value) => score + overlapScore(terms, value), 0)
    const confidence = Math.max(55, Math.min(96, 64 + matchedTerms * 2))
    draftsWithoutPosition.push({
      requirementId: requirement.id,
      endpointId: profile.endpointId,
      endpointName: profile.endpointName,
      title: requirement.title,
      type,
      xAxis: dimension?.name ?? metric?.name ?? '',
      yAxis: metric?.name,
      confidence,
      reason: `Mapped to ${profile.endpointName}${dimension ? ` using ${dimension.name}` : ''}${metric ? ` and ${metric.name}` : ''}.`,
      locked: requirement.lockChartType,
    })
  }

  return {
    brief: input.brief,
    drafts: applyAutoLayout(draftsWithoutPosition, getNextWidgetStartY(input.widgets)),
    retainedRequirementIds: [...retained],
    unresolved,
    profiledEndpointCount: input.profiles.length,
  }
}

export async function profileDashboardBriefEndpoints(input: {
  endpoints: EndpointRuntimeTarget[]
  sessionScope: string
}): Promise<BriefEndpointProfile[]> {
  const profiles: BriefEndpointProfile[] = []
  for (const endpoint of input.endpoints) {
    if (!endpoint.id || endpoint.status === 'inactive' || !endpoint.url?.trim()) continue
    try {
      const { value } = await fetchEndpointPayloadWithCache(endpoint, { sessionScope: input.sessionScope })
      const rows = DataAnalyzer.extractDataArray(value.payload)
      if (!rows?.length) continue
      const analysis = DataAnalyzer.analyzeArray(rows.filter(row => row && typeof row === 'object' && !Array.isArray(row)))
      if (!analysis.fields.length) continue
      profiles.push({
        endpointId: endpoint.id,
        endpointName: endpoint.name ?? endpoint.url,
        fields: analysis.fields.map(field => ({ name: field.name, type: field.type })),
      })
    } catch {
      // One unavailable source must not block planning against other connected sources.
    }
  }
  return profiles
}
