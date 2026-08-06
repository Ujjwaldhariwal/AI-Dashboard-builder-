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

export interface RequirementRelationshipEvidence {
  fromEntityId: string
  toEntityId: string
}

export interface RequirementMetricSourceEvidence {
  columnId: string
  entityName: string
  fieldName: string
  role: string
  dataType: string
}

export interface RequirementMetricMaterialization {
  requirementIds: string[]
  columnId: string
  name: string
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct'
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'chart', 'dashboard', 'for', 'from', 'in', 'of', 'on', 'show', 'the', 'to', 'with',
])

const AGGREGATION_WORDS = new Set(['average', 'avg', 'count', 'distinct', 'maximum', 'max', 'minimum', 'min', 'sum', 'total'])
const TOKEN_ALIASES: Record<string, string> = {
  amt: 'amount',
  cnt: 'count',
  recognised: 'recognized',
  qty: 'quantity',
}

function canonicalToken(value: string) {
  const aliased = TOKEN_ALIASES[value] ?? value
  if (aliased.endsWith('ies') && aliased.length > 4) return `${aliased.slice(0, -3)}y`
  if (aliased.endsWith('s') && !aliased.endsWith('ss') && aliased.length > 3) return aliased.slice(0, -1)
  return aliased
}

function normalize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(value: string) {
  return normalize(value).split(/\s+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token))
    .map(canonicalToken)
}

function scoreCandidate(query: string, candidate: string) {
  const queryValues = tokens(query)
  const candidateValues = tokens(candidate)
  const normalizedQuery = queryValues.join(' ')
  const normalizedCandidate = candidateValues.join(' ')
  const queryTokens = new Set(queryValues)
  const candidateTokens = new Set(candidateValues)
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
    ambiguous: Boolean(ranked[0] && ranked[1] && ranked[0].score - ranked[1].score < 6),
  }
}

function entitiesAreConnected(fromEntityId: string, toEntityId: string, relationships: RequirementRelationshipEvidence[]) {
  if (fromEntityId === toEntityId) return true
  const adjacent = new Map<string, string[]>()
  for (const relationship of relationships) {
    adjacent.set(relationship.fromEntityId, [...(adjacent.get(relationship.fromEntityId) ?? []), relationship.toEntityId])
    adjacent.set(relationship.toEntityId, [...(adjacent.get(relationship.toEntityId) ?? []), relationship.fromEntityId])
  }
  const visited = new Set([fromEntityId])
  const queue = [fromEntityId]
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const next of adjacent.get(current) ?? []) {
      if (next === toEntityId) return true
      if (visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  return false
}

function sourceSupportsAggregation(source: RequirementMetricSourceEvidence, aggregation: RequirementMetricMaterialization['aggregation']) {
  if (source.role === 'hidden') return false
  if (aggregation === 'count' || aggregation === 'count_distinct') return true
  return ['metric_source', 'attribute'].includes(source.role)
    && /int|numeric|decimal|real|double|float|money|number/.test(source.dataType.toLowerCase())
}

export function buildRequirementMetricMaterializations({
  spec,
  sources,
}: {
  spec: DashboardBrief
  sources: RequirementMetricSourceEvidence[]
}): RequirementMetricMaterialization[] {
  const requirements = spec.requirements.filter(requirement => requirement.metric)
  const aggregationsByConcept = new Map<string, Set<string>>()
  for (const requirement of requirements) {
    const concept = tokens(requirement.metric?.concept ?? '').filter(token => !AGGREGATION_WORDS.has(token)).join(' ')
    aggregationsByConcept.set(concept, new Set([
      ...(aggregationsByConcept.get(concept) ?? []),
      requirement.metric?.aggregation ?? '',
    ]))
  }

  const materializations = new Map<string, RequirementMetricMaterialization>()
  for (const requirement of requirements) {
    const metric = requirement.metric
    if (!metric) continue
    const conceptKey = tokens(metric.concept).filter(token => !AGGREGATION_WORDS.has(token)).join(' ')
    if (!conceptKey || (aggregationsByConcept.get(conceptKey)?.size ?? 0) > 1) continue
    const compatible = sources.filter(source => sourceSupportsAggregation(source, metric.aggregation))
    const match = bestCandidate(compatible.map(source => ({ ...source, id: source.columnId })), source => scoreCandidate(
      metric.concept,
      `${source.entityName} ${source.fieldName} ${metric.aggregation.replace('_', ' ')}`,
    ))
    if (!match.best || match.best.score < 12 || match.ambiguous) continue
    const key = `${conceptKey}:${metric.aggregation}`
    const existing = materializations.get(key)
    materializations.set(key, {
      requirementIds: [...(existing?.requirementIds ?? []), requirement.id],
      columnId: match.best.item.columnId,
      name: metric.concept,
      aggregation: metric.aggregation,
    })
  }
  return [...materializations.values()]
}

function resolveRequirement({
  requirement,
  fields,
  metrics,
  relationships,
}: {
  requirement: DashboardChartRequirement
  fields: RequirementFieldEvidence[]
  metrics: RequirementMetricEvidence[]
  relationships: RequirementRelationshipEvidence[]
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
  } else if ((metricMatch.best?.score ?? 0) < 12) {
    status = requirement.metric ? 'blocked' : 'needs_review'
    reasons.push(requirement.metric
      ? `No approved metric matches “${requirement.metric.concept}”.`
      : `Confirm whether “${metric.name}” is the intended metric.`)
  } else if (metricMatch.ambiguous) {
    status = 'needs_review'
    reasons.push('Multiple approved metrics have similarly strong matches.')
  }
  if (metric && requirement.metric && metric.aggregation !== requirement.metric.aggregation) {
    status = status === 'blocked' ? status : 'needs_review'
    reasons.push(`Requested ${requirement.metric.aggregation}, but the matched metric uses ${metric.aggregation}.`)
  }

  const selectedFields: RequirementFieldEvidence[] = []
  const selectableFields = fields.filter(field => !['hidden', 'metric_source', 'identifier'].includes(field.role))
  for (const dimension of requirement.dimensions) {
    const match = bestCandidate(
      selectableFields.filter(field => !selectedFields.some(selected => selected.id === field.id)),
      field => scoreCandidate(dimension, `${field.entityName} ${field.name}`),
    )
    if (!match.best || match.best.score < 12) {
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
    } else if (match.ambiguous) {
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
    } else if (match.ambiguous) {
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

  if (metric?.entityId) {
    const disconnected = selectedFields.find(field => !entitiesAreConnected(metric.entityId as string, field.entityId, relationships))
    if (disconnected) {
      status = 'blocked'
      reasons.push(`No approved relationship path connects metric "${metric.name}" to dimension "${disconnected.name}".`)
    }
  } else if (new Set(selectedFields.map(field => field.entityId)).size > 1) {
    status = status === 'blocked' ? status : 'needs_review'
    reasons.push('Confirm the metric entity before joining dimensions across multiple entities.')
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
  relationships = [],
  evaluatedAt = new Date().toISOString(),
}: {
  spec: DashboardBrief
  specHash: string
  fields: RequirementFieldEvidence[]
  metrics: RequirementMetricEvidence[]
  relationships?: RequirementRelationshipEvidence[]
  evaluatedAt?: string
}): ProjectAutopilotRequirementCoverage {
  const items = spec.requirements.map(requirement => resolveRequirement({ requirement, fields, metrics, relationships }))
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
