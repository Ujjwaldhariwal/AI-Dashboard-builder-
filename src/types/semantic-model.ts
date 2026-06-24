export type BusinessModelStatus = 'draft' | 'review' | 'approved' | 'archived'

export type BusinessEntityType = 'fact' | 'dimension' | 'event' | 'snapshot'

export type BusinessFieldRole =
  | 'identifier'
  | 'dimension'
  | 'metric_source'
  | 'date'
  | 'attribute'
  | 'hidden'

export type BusinessMetricAggregation =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'count_distinct'
  | 'ratio'
  | 'custom'

export type BusinessRelationshipType = 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many'

export interface SourceColumnRef {
  dataSourceId?: string
  schemaName?: string
  tableName: string
  columnName: string
  dataType?: string
}

export interface BusinessModel {
  id: string
  tenantId: string
  projectId: string
  name: string
  description?: string | null
  status: BusinessModelStatus
  version: number
  createdAt: string
  updatedAt: string
  approvedAt?: string | null
}

export interface BusinessEntity {
  id: string
  modelId: string
  name: string
  semanticKey: string
  type: BusinessEntityType
  description?: string | null
  sourceRef?: {
    dataSourceId?: string
    schemaName?: string
    tableName?: string
  } | null
  createdAt: string
  updatedAt: string
}

export interface BusinessField {
  id: string
  entityId: string
  name: string
  semanticKey: string
  role: BusinessFieldRole
  sourceColumn?: SourceColumnRef | null
  isFilterable: boolean
  isTooltipField: boolean
  displayFormat?: string | null
  defaultAggregation?: BusinessMetricAggregation | null
  createdAt: string
  updatedAt: string
}

export interface BusinessMetric {
  id: string
  modelId: string
  entityId?: string | null
  name: string
  semanticKey: string
  aggregation: BusinessMetricAggregation
  expression: Record<string, unknown>
  unit?: string | null
  displayFormat?: string | null
  description?: string | null
  createdAt: string
  updatedAt: string
}

export interface BusinessRelationship {
  id: string
  modelId: string
  fromEntityId: string
  toEntityId: string
  type: BusinessRelationshipType
  joinConfig: Record<string, unknown>
  description?: string | null
  createdAt: string
  updatedAt: string
}
