import {
  DASHBOARD_BRIEF_VERSION,
  DashboardBriefSchema,
  type BriefChartType,
  type DashboardBrief,
  type DashboardChartRequirement,
} from '@/types/dashboard-brief'

const MAX_REQUIREMENTS = 12
const REQUIREMENT_PREFIX = /^\s*(?:(?:[-*\u2022]+|\d+[.)]|[a-z][.)])\s*)/i
const LEADING_REQUEST = /^(?:please\s+)?(?:add|build|compare|create|display|give me|include|monitor|plot|report on|show|track|visuali[sz]e)\s+/i
const OPTIONAL_PREFIX = /^optional(?:ly)?\s*[:\-]?\s*/i

export interface RawDashboardRequirementInterpretation {
  requirements: DashboardChartRequirement[]
  omittedCount: number
}

function compact(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const clipped = normalized.slice(0, maxLength - 1).replace(/\s+\S*$/, '').trim()
  return `${clipped || normalized.slice(0, maxLength - 1)}\u2026`
}

function splitRequirementText(rawBrief: string) {
  const normalized = rawBrief
    .replace(/\r\n?/g, '\n')
    .replace(/\s+(?=\d+[.)]\s+)/g, '\n')

  const fragments = normalized
    .split(/\n+|;+/)
    .flatMap(fragment => fragment.split(/(?<=[.!?])\s+/))
    .flatMap(fragment => fragment.split(/,\s+(?=(?:add|compare|display|include|monitor|plot|report|show|track|visuali[sz]e)\b)/i))
    .flatMap(fragment => fragment.split(/\s+(?:and|then)\s+(?=(?:add|compare|display|include|monitor|plot|report|show|track|visuali[sz]e)\b)/i))
    .map(fragment => fragment.replace(REQUIREMENT_PREFIX, '').trim())
    .filter(fragment => fragment.length >= 2)

  const seen = new Set<string>()
  return fragments.filter(fragment => {
    const key = fragment.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function explicitChartType(instruction: string): BriefChartType {
  if (/\b(?:detail(?:ed)? table|data table|table view|tabular)\b/i.test(instruction)) return 'table'
  if (/\b(?:donut|doughnut)\b/i.test(instruction)) return 'donut'
  if (/\bpie(?: chart)?\b/i.test(instruction)) return 'pie'
  if (/\barea(?: chart)?\b/i.test(instruction)) return 'area'
  if (/\bline(?: chart)?\b/i.test(instruction)) return 'line'
  if (/\b(?:horizontal )?bar(?: chart)?\b/i.test(instruction)) return 'bar'
  if (/\b(?:gauge|meter)\b/i.test(instruction)) return 'gauge'
  if (/\b(?:kpi|scorecard|status card|headline (?:number|metric)|single value)\b/i.test(instruction)) return 'status-card'
  return 'auto'
}

function timeGrain(instruction: string): DashboardChartRequirement['timeGrain'] {
  if (/\b(?:daily|day[- ]over[- ]day|by day)\b/i.test(instruction)) return 'day'
  if (/\b(?:weekly|week[- ]over[- ]week|by week)\b/i.test(instruction)) return 'week'
  if (/\b(?:monthly|month[- ]over[- ]month|by month)\b/i.test(instruction)) return 'month'
  if (/\b(?:quarterly|quarter[- ]over[- ]quarter|by quarter)\b/i.test(instruction)) return 'quarter'
  if (/\b(?:yearly|annual(?:ly)?|year[- ]over[- ]year|by year)\b/i.test(instruction)) return 'year'
  return null
}

function requirementTitle(instruction: string) {
  const withoutOptional = instruction.replace(OPTIONAL_PREFIX, '')
  const title = withoutOptional.replace(LEADING_REQUEST, '').replace(/[.!?]+$/, '').trim()
  return compact(title || withoutOptional, 120)
}

export function interpretRawDashboardRequirements(
  rawBrief: string,
  createId: () => string = () => crypto.randomUUID(),
): RawDashboardRequirementInterpretation {
  const fragments = splitRequirementText(rawBrief)
  const requirements = fragments.slice(0, MAX_REQUIREMENTS).map(instruction => {
    const chartType = explicitChartType(instruction)
    return {
      id: createId(),
      title: requirementTitle(instruction),
      instruction: compact(instruction, 500),
      chartType,
      lockChartType: chartType !== 'auto',
      metric: null,
      dimensions: [],
      timeGrain: timeGrain(instruction),
      required: !OPTIONAL_PREFIX.test(instruction),
    } satisfies DashboardChartRequirement
  })

  return {
    requirements,
    omittedCount: Math.max(0, fragments.length - requirements.length),
  }
}

export function inferDashboardAudience(rawBrief: string) {
  if (/\b(?:board|c-suite|executive|leadership)\b/i.test(rawBrief)) return 'Leadership'
  if (/\b(?:sales|commercial|revenue) team\b/i.test(rawBrief)) return 'Sales'
  if (/\b(?:finance|financial) team\b/i.test(rawBrief)) return 'Finance'
  if (/\b(?:operations|operational) team\b/i.test(rawBrief)) return 'Operations'
  return null
}

export function compileRawDashboardBrief({
  rawBrief,
  projectName,
  createId = () => crypto.randomUUID(),
  updatedAt = new Date().toISOString(),
}: {
  rawBrief: string
  projectName: string
  createId?: () => string
  updatedAt?: string
}): DashboardBrief {
  const interpreted = interpretRawDashboardRequirements(rawBrief, createId)
  return DashboardBriefSchema.parse({
    version: DASHBOARD_BRIEF_VERSION,
    id: createId(),
    title: compact(`${projectName} dashboard requirements`, 120),
    objective: compact(rawBrief, 2_000),
    requirements: interpreted.requirements,
    updatedAt,
  })
}
