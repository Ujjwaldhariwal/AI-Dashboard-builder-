import { z } from 'zod'

import type { DataSourceColumnMetadata } from '@/types/data-source'
import type {
  BusinessEntityType,
  BusinessFieldRole,
  BusinessMetricAggregation,
  BusinessRelationshipType,
} from '@/types/semantic-model'

export const SEMANTIC_COPILOT_VERSION = 'dashboardos.semantic.proposal.v1' as const

const MetricProposalSchema = z.object({
  name: z.string().trim().min(2).max(120),
  aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count', 'count_distinct']),
  unit: z.string().trim().max(40).optional(),
  displayFormat: z.string().trim().max(80).optional(),
}).strict()

export const SemanticMappingProposalSchema = z.object({
  columnId: z.string().trim().min(1).max(100),
  entityName: z.string().trim().min(2).max(120),
  entityType: z.enum(['fact', 'dimension', 'event', 'snapshot']),
  fieldName: z.string().trim().min(2).max(120),
  role: z.enum(['identifier', 'dimension', 'metric_source', 'date', 'attribute', 'hidden']),
  isFilterable: z.boolean(),
  isTooltipField: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(2).max(300),
  metric: MetricProposalSchema.optional(),
}).strict()

export const SemanticRelationshipProposalSchema = z.object({
  fromColumnId: z.string().trim().min(1).max(100),
  toColumnId: z.string().trim().min(1).max(100),
  type: z.enum(['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many']),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(2).max(300),
}).strict()

export const SemanticCopilotProposalSchema = z.object({
  version: z.literal(SEMANTIC_COPILOT_VERSION).default(SEMANTIC_COPILOT_VERSION),
  summary: z.string().trim().min(2).max(500),
  mappings: z.array(SemanticMappingProposalSchema).min(1).max(80),
  relationships: z.array(SemanticRelationshipProposalSchema).max(24).default([]),
}).strict()

export type SemanticMappingProposal = z.infer<typeof SemanticMappingProposalSchema>
export type SemanticCopilotProposal = z.infer<typeof SemanticCopilotProposalSchema>

export interface SemanticProposalValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  path?: string[]
}

const NUMERIC_TYPES = /int|numeric|decimal|real|double|float|money/
const DATE_TYPES = /date|time/
const BOOLEAN_TYPES = /bool/
const SENSITIVE_NAMES = /password|secret|token|credential|api[_-]?key|email|phone|mobile|address|ssn|aadhaar|pan[_-]?number/i

function words(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function title(value: string) {
  return words(value).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}

function singularTableName(value: string) {
  const normalized = title(value)
  return normalized.endsWith('ies')
    ? `${normalized.slice(0, -3)}y`
    : normalized.endsWith('s') && !normalized.endsWith('ss')
      ? normalized.slice(0, -1)
      : normalized
}

function normalizedIdentifier(column: DataSourceColumnMetadata) {
  const columnName = column.columnName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
  const tableName = column.tableName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
  const singularTable = tableName.endsWith('ies')
    ? `${tableName.slice(0, -3)}y`
    : tableName.endsWith('s') && !tableName.endsWith('ss')
      ? tableName.slice(0, -1)
      : tableName
  if (columnName === 'id' || columnName === 'uuid') return singularTable
  return columnName.replace(/_(id|uuid|key)$/, '')
}

function roleForColumn(column: DataSourceColumnMetadata): BusinessFieldRole {
  const name = column.columnName.toLowerCase()
  const type = column.dataType.toLowerCase()
  if (SENSITIVE_NAMES.test(name)) return 'hidden'
  if (DATE_TYPES.test(type) || /(^|_)(date|time|month|year|week|day|created|updated)(_at)?$/.test(name)) return 'date'
  if (/(^id$|_id$|^uuid$|_key$)/.test(name)) return 'identifier'
  if (NUMERIC_TYPES.test(type)) {
    if (/(amount|total|price|cost|revenue|sales|profit|quantity|qty|units|count|score|rate|percent|ratio|hours|duration|balance|usage|consumption)/.test(name)) return 'metric_source'
    return 'attribute'
  }
  if (BOOLEAN_TYPES.test(type)) return 'dimension'
  if (/(status|type|category|segment|region|country|state|city|name|channel|department|group)/.test(name)) return 'dimension'
  return 'attribute'
}

function entityTypeForColumns(columns: DataSourceColumnMetadata[]): BusinessEntityType {
  const roles = columns.map(roleForColumn)
  if (roles.includes('metric_source') && roles.includes('date')) return 'event'
  if (roles.includes('metric_source')) return 'fact'
  return 'dimension'
}

function aggregationForColumn(column: DataSourceColumnMetadata): BusinessMetricAggregation {
  const name = column.columnName.toLowerCase()
  if (/(average|avg|rate|ratio|percent|percentage|score|hours|duration|temperature)/.test(name)) return 'avg'
  if (/(^|_)count($|_)/.test(name)) return 'sum'
  return 'sum'
}

function metricNameForColumn(column: DataSourceColumnMetadata, aggregation: BusinessMetricAggregation) {
  const baseName = title(column.columnName)
  if (aggregation === 'avg' && /^(average|avg)\b/i.test(baseName)) return baseName
  if (aggregation === 'sum' && /^total\b/i.test(baseName)) return baseName
  const prefix = aggregation === 'avg' ? 'Average' : 'Total'
  return `${prefix} ${baseName}`
}

export function buildDeterministicSemanticProposal(
  columns: DataSourceColumnMetadata[],
  objective = 'Create a reusable business model from the selected schema.',
): SemanticCopilotProposal {
  const byTable = new Map<string, DataSourceColumnMetadata[]>()
  for (const column of columns) {
    const key = `${column.dataSourceId}:${column.schemaName}.${column.tableName}`
    byTable.set(key, [...(byTable.get(key) ?? []), column])
  }

  const mappings: SemanticMappingProposal[] = []
  for (const tableColumns of byTable.values()) {
    const entityName = singularTableName(tableColumns[0]?.tableName ?? 'Business Entity')
    const entityType = entityTypeForColumns(tableColumns)
    for (const column of tableColumns) {
      const role = roleForColumn(column)
      if (role === 'hidden') continue
      const aggregation = role === 'metric_source' ? aggregationForColumn(column) : null
      mappings.push({
        columnId: column.id,
        entityName,
        entityType,
        fieldName: title(column.columnName),
        role,
        isFilterable: ['identifier', 'dimension', 'date'].includes(role),
        isTooltipField: true,
        confidence: role === 'attribute' ? 0.72 : 0.88,
        reason: `Classified from the ${column.dataType} type and ${column.columnName} name.`,
        ...(aggregation ? {
          metric: {
            name: metricNameForColumn(column, aggregation),
            aggregation: aggregation as 'sum' | 'avg',
          },
        } : {}),
      })
    }
  }

  const relationships: SemanticCopilotProposal['relationships'] = []
  const identifierColumns = columns.filter(column => roleForColumn(column) === 'identifier')
  for (let leftIndex = 0; leftIndex < identifierColumns.length; leftIndex += 1) {
    const left = identifierColumns[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < identifierColumns.length; rightIndex += 1) {
      const right = identifierColumns[rightIndex]
      if (left.tableName === right.tableName || normalizedIdentifier(left) !== normalizedIdentifier(right)) continue
      const leftIsPrimary = /^(id|uuid)$/.test(left.columnName.toLowerCase())
      const rightIsPrimary = /^(id|uuid)$/.test(right.columnName.toLowerCase())
      if (!leftIsPrimary && !rightIsPrimary && left.columnName.toLowerCase() !== right.columnName.toLowerCase()) continue
      const type: BusinessRelationshipType = leftIsPrimary && !rightIsPrimary
        ? 'one_to_many'
        : !leftIsPrimary && rightIsPrimary
          ? 'many_to_one'
          : 'many_to_one'
      relationships.push({
        fromColumnId: left.id,
        toColumnId: right.id,
        type,
        confidence: leftIsPrimary !== rightIsPrimary ? 0.86 : 0.72,
        reason: `Matched the ${normalizedIdentifier(left)} identifier across two selected tables; verify cardinality before approval.`,
      })
      if (relationships.length >= 24) break
    }
    if (relationships.length >= 24) break
  }

  return SemanticCopilotProposalSchema.parse({
    summary: `${objective.trim()} Proposed ${mappings.length} governed mappings across ${byTable.size} selected table${byTable.size === 1 ? '' : 's'}.`,
    mappings: mappings.slice(0, 80),
    relationships,
  })
}

export function validateSemanticCopilotProposal({
  proposal,
  selectedColumns,
}: {
  proposal: SemanticCopilotProposal
  selectedColumns: DataSourceColumnMetadata[]
}) {
  const columnById = new Map(selectedColumns.map(column => [column.id, column]))
  const issues: SemanticProposalValidationIssue[] = []
  const seenColumns = new Set<string>()
  const mappings = proposal.mappings.filter((mapping, index) => {
    const column = columnById.get(mapping.columnId)
    if (!column) {
      issues.push({ severity: 'error', code: 'unknown_column', message: `Proposal referenced a column outside the approved schema scope.`, path: ['mappings', String(index), 'columnId'] })
      return false
    }
    if (seenColumns.has(mapping.columnId)) {
      issues.push({ severity: 'warning', code: 'duplicate_column', message: `${column.schemaName}.${column.tableName}.${column.columnName} was proposed more than once.`, path: ['mappings', String(index)] })
      return false
    }
    seenColumns.add(mapping.columnId)
    if (mapping.metric && mapping.role !== 'metric_source') {
      issues.push({ severity: 'warning', code: 'metric_role_mismatch', message: `${mapping.fieldName} cannot create a metric until its role is metric_source.`, path: ['mappings', String(index), 'metric'] })
      return true
    }
    return true
  }).map(mapping => mapping.metric && mapping.role !== 'metric_source'
    ? { ...mapping, metric: undefined }
    : mapping)

  const relationships = proposal.relationships.filter((relationship, index) => {
    const from = columnById.get(relationship.fromColumnId)
    const to = columnById.get(relationship.toColumnId)
    if (!from || !to) {
      issues.push({ severity: 'error', code: 'unknown_relationship_column', message: 'A proposed relationship referenced a column outside the approved schema scope.', path: ['relationships', String(index)] })
      return false
    }
    if (from.tableName === to.tableName && from.schemaName === to.schemaName) {
      issues.push({ severity: 'warning', code: 'same_table_relationship', message: 'A relationship must connect two selected relations.', path: ['relationships', String(index)] })
      return false
    }
    return true
  })

  if (mappings.length === 0) {
    issues.push({ severity: 'error', code: 'no_valid_mappings', message: 'No valid mappings remained after schema validation.' })
  }

  const sanitized = SemanticCopilotProposalSchema.parse({ ...proposal, mappings, relationships })
  return {
    proposal: sanitized,
    issues,
    state: issues.some(issue => issue.severity === 'error') ? 'warning' as const : issues.length > 0 ? 'warning' as const : 'valid' as const,
  }
}
