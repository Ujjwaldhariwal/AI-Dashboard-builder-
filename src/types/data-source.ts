export type DataSourceType = 'postgres'

export type DataSourceStatus = 'draft' | 'active' | 'error' | 'disabled'

export type DataSourceSslMode = 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'

export interface PostgresConnectionConfig {
  host: string
  port: number
  database: string
  username: string
  sslMode: DataSourceSslMode
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
  createdAt: string
  updatedAt: string
}

export interface DataSourceColumnMetadata {
  id: string
  dataSourceId: string
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

export interface DataSourceTableMetadata {
  schemaName: string
  tableName: string
  tableType: string
  columns: DataSourceColumnMetadata[]
}
