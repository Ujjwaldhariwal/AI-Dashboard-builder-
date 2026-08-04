import {
  executeOracleReadOnlyQuery,
  introspectOracleSchema,
  profileOracleSchema,
  testOracleConnection,
} from '@/lib/data-sources/oracle-runtime'
import {
  executePostgresReadOnlyQuery,
  introspectPostgresSchema,
  profilePostgresSchema,
  testPostgresConnection,
  type PostgresRuntimeOptions,
  type PostgresSchemaIntrospectionResult,
} from '@/lib/data-sources/postgres-runtime'
import type { DataSourceType } from '@/types/data-source'

export function resolveDataSourceType(value: unknown): DataSourceType {
  return value === 'oracle' ? 'oracle' : 'postgres'
}

export interface DataSourceQueryResult {
  rows: Array<Record<string, unknown>>
  rowCount: number
  fields: Array<{ name: string; dataTypeId: number }>
  elapsedMs: number
}

export function testDataSourceConnection(type: DataSourceType, ciphertext: string) {
  return type === 'oracle' ? testOracleConnection(ciphertext) : testPostgresConnection(ciphertext)
}

export function introspectDataSourceSchema(type: DataSourceType, ciphertext: string, schemas?: string[]) {
  return type === 'oracle'
    ? introspectOracleSchema(ciphertext, schemas)
    : introspectPostgresSchema(ciphertext, schemas)
}

export function profileDataSourceSchema(
  type: DataSourceType,
  ciphertext: string,
  introspection: PostgresSchemaIntrospectionResult,
) {
  return type === 'oracle'
    ? profileOracleSchema(ciphertext, introspection)
    : profilePostgresSchema(ciphertext, introspection)
}

export async function executeDataSourceReadOnlyQuery(
  type: DataSourceType,
  ciphertext: string,
  sql: string,
  options: PostgresRuntimeOptions = {},
): Promise<DataSourceQueryResult> {
  return type === 'oracle'
    ? executeOracleReadOnlyQuery(ciphertext, sql, options)
    : executePostgresReadOnlyQuery(ciphertext, sql, options)
}
