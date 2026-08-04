import type {
  DataSource,
  DataSourceConnectionConfig,
  DataSourceSslMode,
  DataSourceStatus,
  DataSourceType,
  OracleConnectType,
} from '@/types/data-source'

export function mapDataSource(row: Record<string, unknown>): DataSource {
  const config = row.connection_config && typeof row.connection_config === 'object' && !Array.isArray(row.connection_config)
    ? row.connection_config as Record<string, unknown>
    : {}
  const type: DataSourceType = row.type === 'oracle' ? 'oracle' : 'postgres'
  const defaultSchema = type === 'oracle' ? String(config.username ?? '').toUpperCase() : 'public'
  const common = {
    host: String(config.host ?? ''),
    port: Number(config.port ?? (type === 'oracle' ? 1521 : 5432)),
    database: String(config.database ?? ''),
    username: String(config.username ?? ''),
    schemas: Array.isArray(config.schemas) ? config.schemas.map(String) : [defaultSchema].filter(Boolean),
  }
  const connectionConfig: DataSourceConnectionConfig = type === 'oracle'
    ? {
        ...common,
        connectType: String(config.connectType ?? 'service_name') as OracleConnectType,
      }
    : {
        ...common,
        sslMode: String(config.sslMode ?? 'require') as DataSourceSslMode,
      }

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    name: String(row.name ?? ''),
    type,
    status: String(row.status ?? 'draft') as DataSourceStatus,
    connectionConfig,
    credentialKeyId: typeof row.credential_key_id === 'string' ? row.credential_key_id : null,
    lastTestedAt: typeof row.last_tested_at === 'string' ? row.last_tested_at : null,
    lastTestStatus: typeof row.last_test_status === 'string' ? row.last_test_status : null,
    lastError: typeof row.last_error === 'string' ? row.last_error : null,
    schemaLastIntrospectedAt: typeof row.schema_last_introspected_at === 'string' ? row.schema_last_introspected_at : null,
    schemaLastStatus: typeof row.schema_last_status === 'string' ? row.schema_last_status as DataSource['schemaLastStatus'] : null,
    schemaLastError: typeof row.schema_last_error === 'string' ? row.schema_last_error : null,
    schemaHash: typeof row.schema_hash === 'string' ? row.schema_hash : null,
    schemaTableCount: Number(row.schema_table_count ?? 0),
    schemaColumnCount: Number(row.schema_column_count ?? 0),
    schemaObjectCount: Number(row.schema_object_count ?? row.schema_table_count ?? 0),
    schemaBaseTableCount: Number(row.schema_base_table_count ?? row.schema_table_count ?? 0),
    schemaViewCount: Number(row.schema_view_count ?? 0),
    schemaIncludedObjectCount: Number(row.schema_included_object_count ?? 0),
    schemaIncludedColumnCount: Number(row.schema_included_column_count ?? 0),
    schemaExcludedObjectCount: Number(row.schema_excluded_object_count ?? 0),
    schemaReviewObjectCount: Number(row.schema_review_object_count ?? 0),
    schemaScopeStatus: String(row.schema_scope_status ?? 'unconfirmed') as DataSource['schemaScopeStatus'],
    schemaRefreshAfter: typeof row.schema_refresh_after === 'string' ? row.schema_refresh_after : null,
    schemaRefreshRequestedAt: typeof row.schema_refresh_requested_at === 'string' ? row.schema_refresh_requested_at : null,
    schemaRefreshReason: typeof row.schema_refresh_reason === 'string' ? row.schema_refresh_reason : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}
