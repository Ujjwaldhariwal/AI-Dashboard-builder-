export type SemanticDatasetStatus = 'draft' | 'published' | 'archived'

export interface SemanticDatasetSelection {
  fieldIds: string[]
  metricIds: string[]
  relationshipIds: string[]
}

export interface SemanticDataset {
  id: string
  tenantId: string
  projectId: string
  modelId: string
  name: string
  description?: string | null
  status: SemanticDatasetStatus
  selection: SemanticDatasetSelection
  cachePolicy: {
    ttlSeconds: number
  }
  createdAt: string
  updatedAt: string
}

export interface CompiledDatasetQueryPlan {
  dialect: 'postgres'
  select: Array<{
    id: string
    label: string
    expression: Record<string, unknown>
    role: 'field' | 'metric'
  }>
  joins: Array<{
    id: string
    type: string
    leftFieldId?: string
    rightFieldId?: string
    operator: '='
  }>
  groupByFieldIds: string[]
  filters: unknown[]
  limits: {
    rowLimit: number
    timeoutMs: number
  }
  executableSql: string | null
  warnings?: string[]
}
