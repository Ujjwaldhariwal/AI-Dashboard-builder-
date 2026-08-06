import { z } from 'zod'

import type { BusinessFieldRole, BusinessMetricAggregation, BusinessRelationshipType } from '@/types/semantic-model'

export const DATASET_COPILOT_VERSION = 'dashboardos.dataset.proposal.v1' as const

export interface DatasetFieldEvidence {
  id: string
  entityId: string
  entityName: string
  name: string
  role: BusinessFieldRole
}

export interface DatasetMetricEvidence {
  id: string
  entityId: string | null
  name: string
  aggregation: BusinessMetricAggregation
  description?: string | null
}

export interface DatasetRelationshipEvidence {
  id: string
  fromEntityId: string
  toEntityId: string
  type: BusinessRelationshipType
  description?: string | null
}

export const DatasetCopilotProposalSchema = z.object({
  version: z.literal(DATASET_COPILOT_VERSION).default(DATASET_COPILOT_VERSION),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(500),
  fieldIds: z.array(z.string().uuid()).max(30).default([]),
  metricIds: z.array(z.string().uuid()).max(16).default([]),
  relationshipIds: z.array(z.string().uuid()).max(16).default([]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(2).max(1_000),
  warnings: z.array(z.string().trim().min(2).max(300)).max(20).default([]),
}).strict().refine(proposal => proposal.fieldIds.length + proposal.metricIds.length > 0, {
  message: 'A dataset proposal requires at least one field or metric.',
})

export type DatasetCopilotProposal = z.infer<typeof DatasetCopilotProposalSchema>

const STOP_WORDS = new Set(['a', 'an', 'and', 'by', 'create', 'dashboard', 'dataset', 'for', 'from', 'in', 'of', 'on', 'show', 'the', 'to', 'with'])

function tokens(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 1 && !STOP_WORDS.has(token))
}

function score(value: string, objectiveTokens: string[]) {
  const normalized = value.toLowerCase()
  return objectiveTokens.reduce((total, token) => total + (normalized.includes(token) ? 3 : 0), 0)
}

function proposalName(objective: string) {
  const words = objective.trim().split(/\s+/).filter(Boolean).slice(0, 7)
  const value = words.join(' ').replace(/[^a-zA-Z0-9 -]/g, '').trim().slice(0, 110).trim()
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)} Dataset` : 'Business Analysis Dataset'
}

export function buildDeterministicDatasetProposal({
  instruction,
  fields,
  metrics,
  relationships,
  preferredFieldIds = [],
  preferredMetricIds = [],
}: {
  instruction: string
  fields: DatasetFieldEvidence[]
  metrics: DatasetMetricEvidence[]
  relationships: DatasetRelationshipEvidence[]
  preferredFieldIds?: string[]
  preferredMetricIds?: string[]
}): DatasetCopilotProposal {
  const objectiveTokens = tokens(instruction)
  const rankedMetrics = [...metrics].sort((left, right) => (
    score(`${right.name} ${right.description ?? ''}`, objectiveTokens)
    - score(`${left.name} ${left.description ?? ''}`, objectiveTokens)
  ))
  const preferredMetricSet = new Set(preferredMetricIds)
  const matchedPreferredMetrics = metrics.filter(metric => preferredMetricSet.has(metric.id))
  const anchorEntityId = matchedPreferredMetrics[0]?.entityId ?? rankedMetrics.find(metric => metric.entityId)?.entityId ?? null
  const coherentMetrics = anchorEntityId
    ? rankedMetrics.filter(metric => metric.entityId === anchorEntityId)
    : rankedMetrics
  const metricIds = (matchedPreferredMetrics.length > 0 ? matchedPreferredMetrics : coherentMetrics)
    .slice(0, 16)
    .map(metric => metric.id)
  const directlyRelatedEntityIds = new Set(anchorEntityId ? [anchorEntityId] : [])
  if (anchorEntityId) {
    for (const relationship of relationships) {
      if (relationship.fromEntityId === anchorEntityId) directlyRelatedEntityIds.add(relationship.toEntityId)
      if (relationship.toEntityId === anchorEntityId) directlyRelatedEntityIds.add(relationship.fromEntityId)
    }
  }

  const rankedFields = [...fields]
    .filter(field => !['hidden', 'metric_source'].includes(field.role))
    .filter(field => !anchorEntityId || directlyRelatedEntityIds.has(field.entityId))
    .sort((left, right) => {
      const rolePriority = (role: BusinessFieldRole) => role === 'date' ? 4 : role === 'dimension' ? 3 : role === 'identifier' ? 0 : 1
      const entityPriority = (entityId: string) => entityId === anchorEntityId ? 100 : 0
      return (entityPriority(right.entityId) + score(`${right.entityName} ${right.name}`, objectiveTokens) + rolePriority(right.role))
        - (entityPriority(left.entityId) + score(`${left.entityName} ${left.name}`, objectiveTokens) + rolePriority(left.role))
    })
  const preferredFieldSet = new Set(preferredFieldIds)
  const matchedPreferredFields = fields.filter(field => preferredFieldSet.has(field.id) && field.role !== 'hidden')
  const fieldLimit = matchedPreferredFields.length > 0 ? 30 : metricIds.length > 0 ? 6 : 10
  const fieldIds = (matchedPreferredFields.length > 0 ? matchedPreferredFields : rankedFields)
    .slice(0, Math.min(fieldLimit, fields.length))
    .map(field => field.id)

  const selectedEntityIds = new Set([
    ...fields.filter(field => fieldIds.includes(field.id)).map(field => field.entityId),
    ...metrics.filter(metric => metricIds.includes(metric.id) && metric.entityId).map(metric => metric.entityId as string),
  ])
  const relationshipIds = relationships
    .filter(relationship => selectedEntityIds.has(relationship.fromEntityId) && selectedEntityIds.has(relationship.toEntityId))
    .slice(0, 16)
    .map(relationship => relationship.id)
  const warnings = selectedEntityIds.size > 1 && relationshipIds.length === 0
    ? ['The selected business concepts span multiple entities but no approved join connects them. Review the field selection.']
    : []

  return DatasetCopilotProposalSchema.parse({
    name: proposalName(instruction),
    description: `Generated from the approved semantic model for: ${instruction.trim()}`.slice(0, 500),
    fieldIds,
    metricIds,
    relationshipIds,
    confidence: warnings.length > 0 ? 0.68 : 0.86,
    rationale: `Selected ${fieldIds.length} descriptive fields, ${metricIds.length} metrics, and ${relationshipIds.length} approved joins that best match the business objective.`,
    warnings,
  })
}

export function validateDatasetCopilotProposal({
  proposal,
  fields,
  metrics,
  relationships,
}: {
  proposal: DatasetCopilotProposal
  fields: DatasetFieldEvidence[]
  metrics: DatasetMetricEvidence[]
  relationships: DatasetRelationshipEvidence[]
}) {
  const knownFields = new Set(fields.map(field => field.id))
  const knownMetrics = new Set(metrics.map(metric => metric.id))
  const knownRelationships = new Set(relationships.map(relationship => relationship.id))
  const issues: Array<{ severity: 'error' | 'warning'; code: string; message: string }> = []
  const sanitize = (ids: string[], known: Set<string>, kind: string) => ids.filter((id) => {
    if (known.has(id)) return true
    issues.push({ severity: 'error', code: `unknown_${kind}`, message: `Removed a ${kind} outside the approved semantic model.` })
    return false
  })
  const fieldIds = sanitize([...new Set(proposal.fieldIds)], knownFields, 'field')
  const metricIds = sanitize([...new Set(proposal.metricIds)], knownMetrics, 'metric')
  const relationshipIds = sanitize([...new Set(proposal.relationshipIds)], knownRelationships, 'relationship')
  if (fieldIds.length + metricIds.length === 0) throw new Error('No valid fields or metrics remained after semantic validation.')
  return {
    proposal: DatasetCopilotProposalSchema.parse({ ...proposal, fieldIds, metricIds, relationshipIds }),
    issues,
    state: issues.length > 0 ? 'warning' as const : 'valid' as const,
  }
}
