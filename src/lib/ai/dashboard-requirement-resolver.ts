import { getChartTemplate } from '@/lib/semantic/chart-template-registry'
import {
  dashboardRequirementTemplateId,
  type DashboardBrief,
  type DashboardChartRequirement,
} from '@/types/dashboard-brief'
import type {
  ProjectAutopilotRequirementCoverage,
  ProjectAutopilotRequirementCoverageItem,
} from '@/types/project-autopilot'

export interface RequirementFieldEvidence {
  id: string
  entityId: string
  entityName: string
  name: string
  role: string
}

export interface RequirementMetricEvidence {
  id: string
  entityId: string | null
  name: string
  aggregation: string
  description?: string | null
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'chart', 'dashboard', 'for', 'from', 'in', 'of', 'on', 'show', 'the', 'to', 'with',
])

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokens(value: string) {
  return normalize(value).split(/\s+/).filter(token => token.length > 1 && !STOP_WORDS.has(token))
}

function scoreCandidate(query: string, candidate: string) {
  const normalizedQuery = normalize(query)
  const normalizedCandidate = normalize(candidate)
  const queryTokens = new Set(tokens(query))
  const candidateTokens = new Set(tokens(candidate))
  let score = [...queryTokens].reduce((total, token) => total + (candidateTokens.has(token) ? 6 : 0), 0)
  if (normalizedQuery && normalizedCandidate === normalizedQuery) score += 30
  else if (normalizedQuery && (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate))) score += 16
  return score
}

function requirementQuery(requirement: DashboardChartRequirement) {
  return [
    requirement.metric?.concept,
    requirement.title,
    requirement.instruction,
    requirement.dimensions.join(' '),
    requirement.timeGrain,
  ].filter(Boolean).join(' ')
}

function bestCandidate<T extends { id: string }>(items: T[], score: (item: T) => number) {
  const ranked = items
    .map(item => ({ item, score: score(item) }))
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
  return {
    best: ranked[0] ?? null,
    ambiguous: Boolean(ranked[0] && ranked[1] && ranked[0].score === ranked[1].score),
  }
}

function resolveRequirement({
  requirement,
  fields,
  metrics,
}: {
  requirement: DashboardChartRequirement
  fields: RequirementFieldEvidence[]
  metrics: RequirementMetricEvidence[]
}): ProjectAutopilotRequirementCoverageItem {
  const templateId = dashboardRequirementTemplateId(requirement)
  const query = requirementQuery(requirement)
  const reasons: string[] = []
  let status: ProjectAutopilotRequirementCoverageItem['status'] = 'ready'

  const metricMatch = bestCandidate(metrics, metric => scoreCandidate(
    requirement.metric?.concept || query,
    `${metric.name} ${metric.description ?? ''}`,
  ))
  const metric = metricMatch.best?.item ?? null
  if (!metric) {
    status = 'blocked'
    reasons.push('No approved metric is available for this requirement.')
  } else if ((metricMatch.best?.score ?? 0) === 0) {
    status = requirement.metric ? 'blocked' : 'needs_review'
    reasons.push(requirement.metric
      ? `No approved metric matches “${requirement.metric.concept}”.`
      : `Confirm whether “${metric.name}” is the intended metric.`)
  } else if (metricMatch.ambiguous) {
    status = 'needs_review'
    reasons.push('Multiple approved metrics match with equal confidence.')
  }
  if (metric && requirement.metric && metric.aggregation !== requirement.metric.aggregation) {
    status = status === 'blocked' ? status : 'needs_review'
    reasons.push(`Requested ${requirement.metric.aggregation}, but the matched metric uses ${metric.aggregation}.`)
  }

  const selectedFields: RequirementFieldEvidence[] = []
  const selectableFields = fields.filter(field => !['hidden', 'metric_source', 'identifier'].includes(field.role))
  for (const dimension of requirement.dimensions) {
    const match = bestCandidate(selectableFields, field => scoreCandidate(dimension, `${field.entityName} ${field.name}`))
    if (!match.best || match.best.score === 0) {
      status = 'blocked'
      reasons.push(`No approved dimension matches “${dimension}”.`)
      continue
    }
    if (match.ambiguous) {
      status = status === 'blocked' ? status : 'needs_review'
      reasons.push(`Multiple approved fields match dimension “${dimension}”.`)
      continue
    }
    selectedFields.push(match.best.item)
  }

  const template = getChartTemplate(templateId)
  const minDimensions = template?.requirement.minDimensions ?? 0
  const requiresDateAxis = Boolean(template?.requirement.requiresDateAxis)
  if (requiresDateAxis && !selectedFields.some(field => field.role === 'date')) {
    const match = bestCandidate(
      selectableFields.filter(field => field.role === 'date'),
      field => scoreCandidate(query, `${field.entityName} ${field.name}`) + (metric?.entityId === field.entityId ? 2 : 0) + 8,
    )
    if (!match.best) {
      status = 'blocked'
      reasons.push('No approved date field can support the requested trend.')
    } else if (match.ambiguous && match.best.score <= 10) {
      status = status === 'blocked' ? status : 'needs_review'
      reasons.push('Confirm which approved date field defines the trend.')
    } else {
      selectedFields.unshift(match.best.item)
    }
  }
  if (selectedFields.length > (template?.requirement.maxDimensions ?? selectedFields.length)) {
    status = status === 'blocked' ? status : 'needs_review'
    reasons.push(`${template?.name ?? templateId} cannot represent all requested dimensions in one governed chart.`)
  }
  const missingDimensions = Math.max(0, minDimensions - selectedFields.length)
  if (missingDimensions > 0) {
    const wantsDate = requiresDateAxis || Boolean(requirement.timeGrain)
    const candidates = selectableFields.filter(field => (
      !selectedFields.some(selected => selected.id === field.id)
      && (!wantsDate || field.role === 'date')
    ))
    const match = bestCandidate(candidates, field => (
      scoreCandidate(query, `${field.entityName} ${field.name}`)
      + (metric?.entityId === field.entityId ? 2 : 0)
      + (wantsDate && field.role === 'date' ? 8 : 0)
    ))
    if (!match.best) {
      status = 'blocked'
      reasons.push(wantsDate ? 'No approved date field can support the requested trend.' : 'No approved dimension can support this chart.')
    } else if (match.ambiguous && match.best.score <= 10) {
      status = status === 'blocked' ? status : 'needs_review'
      reasons.push(wantsDate ? 'Confirm which approved date field defines the trend.' : 'Confirm which approved dimension defines the breakdown.')
    } else {
      selectedFields.push(match.best.item)
    }
  }

  if (requirement.timeGrain) {
    const dateField = selectedFields.find(field => field.role === 'date')
    if (!dateField) {
      status = 'blocked'
      reasons.push(`No approved date field supports the ${requirement.timeGrain} grain.`)
    } else if (!normalize(dateField.name).includes(requirement.timeGrain)) {
      status = status === 'blocked' ? status : 'needs_review'
      reasons.push(`Confirm that “${dateField.name}” is already bucketed at ${requirement.timeGrain} grain.`)
    }
  }

  const score = metricMatch.best?.score ?? 0
  const confidence = status === 'ready'
    ? Math.min(0.98, 0.82 + Math.min(score, 30) / 200)
    : status === 'needs_review' ? 0.62 : 0
  return {
    requirementId: requirement.id,
    title: requirement.title,
    required: requirement.required,
    status,
    metricId: metric?.id ?? null,
    fieldIds: [...new Set(selectedFields.map(field => field.id))],
    templateId,
    confidence,
    reason: reasons.join(' ') || `Resolved to ${metric?.name ?? 'an approved metric'} using governed semantic IDs.`,
  }
}

export function resolveDashboardRequirementCoverage({
  spec,
  specHash,
  fields,
  metrics,
  evaluatedAt = new Date().toISOString(),
}: {
  spec: DashboardBrief
  specHash: string
  fields: RequirementFieldEvidence[]
  metrics: RequirementMetricEvidence[]
  evaluatedAt?: string
}): ProjectAutopilotRequirementCoverage {
  const items = spec.requirements.map(requirement => resolveRequirement({ requirement, fields, metrics }))
  return {
    specId: spec.id,
    specVersion: spec.version,
    specHash,
    total: items.length,
    ready: items.filter(item => item.status === 'ready').length,
    needsReview: items.filter(item => item.status === 'needs_review').length,
    blocked: items.filter(item => item.status === 'blocked').length,
    evaluatedAt,
    items,
  }
}

export function dashboardRequirementInstruction(spec: DashboardBrief) {
  const requirements = spec.requirements.map((requirement, index) => {
    const metric = requirement.metric
      ? ` Metric: ${requirement.metric.concept} (${requirement.metric.aggregation}).`
      : ''
    const dimensions = requirement.dimensions.length > 0
      ? ` Dimensions: ${requirement.dimensions.join(', ')}.`
      : ''
    const grain = requirement.timeGrain ? ` Time grain: ${requirement.timeGrain}.` : ''
    return `${index + 1}. ${requirement.title}.${metric}${dimensions}${grain} ${requirement.instruction}`.trim()
  })
  return `${spec.objective.trim()}\n${requirements.join('\n')}`
}
