export type DataSourceType = 'postgres'

export type DataSourceStatus = 'draft' | 'active' | 'error' | 'disabled'

export type DataSourceSslMode = 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'

export type DataSourceRelationType = 'table' | 'partitioned_table' | 'view' | 'materialized_view' | 'foreign_table'

export type DataSourceRelationSelectionStatus = 'included' | 'excluded' | 'review'

export type DataSourceSchemaScopeStatus = 'unconfirmed' | 'confirmed' | 'review_required'

export type DataSourceRelationClassification = 'business_candidate' | 'internal' | 'needs_review'

export interface PostgresConnectionConfig {
  host: string
  port: number
  database: string
  username: string
  sslMode: DataSourceSslMode
  schemas?: string[]
}

export interface DataSourceSchemaProfileSummary {
  dataSourceId: string
  schemaHash: string
  profileVersion: number
  selectedSchemas: string[]
  generatedAt: string
  tableCount: number
  columnCount: number
  profiledColumnCount: number
  sensitiveColumnCount: number
  explicitJoinCount: number
  inferredJoinCount: number
  warningCount: number
}

export interface PostgresCredentialInput extends PostgresConnectionConfig {
  password: string
}

export interface DataSource {
  id: string
  tenantId: string
  projectId: string
  name: string
  type: DataSourceType
  status: DataSourceStatus
  connectionConfig: PostgresConnectionConfig
  credentialKeyId?: string | null
  lastTestedAt?: string | null
  lastTestStatus?: string | null
  lastError?: string | null
  schemaLastIntrospectedAt?: string | null
  schemaLastStatus?: 'ok' | 'error' | 'pending_refresh' | null
  schemaLastError?: string | null
  schemaHash?: string | null
  schemaTableCount: number
  schemaColumnCount: number
  schemaObjectCount?: number
  schemaBaseTableCount?: number
  schemaViewCount?: number
  schemaIncludedObjectCount?: number
  schemaIncludedColumnCount?: number
  schemaExcludedObjectCount?: number
  schemaReviewObjectCount?: number
  schemaScopeStatus?: DataSourceSchemaScopeStatus
  schemaRefreshAfter?: string | null
  schemaRefreshRequestedAt?: string | null
  schemaRefreshReason?: string | null
  createdAt: string
  updatedAt: string
}

export interface DataSourceSchemaRun {
  id: string
  dataSourceId: string
  status: 'ok' | 'error'
  schemaHash?: string | null
  tableCount: number
  columnCount: number
  startedAt: string
  finishedAt: string
  elapsedMs: number
  errorMessage?: string | null
  triggerSource: 'manual' | 'scheduled' | 'api'
}

export interface DataSourceColumnMetadata {
  id: string
  dataSourceId: string
  relationId?: string | null
  schemaName: string
  tableName: string
  columnName: string
  ordinalPosition: number
  dataType: string
  udtName: string
  isNullable: boolean
  columnDefault?: string | null
  createdAt: string
}

export interface DataSourceSchemaInventorySummary {
  discoveredObjectCount: number
  discoveredTableCount: number
  discoveredViewCount: number
  discoveredColumnCount: number
  includedObjectCount: number
  includedColumnCount: number
  excludedObjectCount: number
  reviewObjectCount: number
  scopeStatus: DataSourceSchemaScopeStatus
}

export interface DataSourceRelationInventoryItem {
  id: string
  dataSourceId: string
  schemaName: string
  relationName: string
  relationType: DataSourceRelationType
  columnCount: number
  estimatedRowCount?: number | null
  comment?: string | null
  fingerprint: string
  classification: DataSourceRelationClassification
  reasonCode: string
  reason: string
  selectionStatus: DataSourceRelationSelectionStatus
  decisionSource: 'system_rule' | 'user' | 'compatibility_migration'
  available: boolean
  firstDiscoveredAt: string
  lastDiscoveredAt: string
  columns: Array<{
    id: string
    name: string
    dataType: string
    ordinalPosition: number
  }>
}

export interface DataSourceSchemaInventory {
  dataSourceId: string
  inventoryHash: string | null
  selectedSchemas: string[]
  summary: DataSourceSchemaInventorySummary
  relations: DataSourceRelationInventoryItem[]
  reviewRequired: boolean
}

export interface DataSourceTableMetadata {
  schemaName: string
  tableName: string
  tableType: string
  columns: DataSourceColumnMetadata[]
}
