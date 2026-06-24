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
