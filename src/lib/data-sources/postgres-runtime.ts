import { Client, Pool, type PoolClient } from 'pg'

import { decryptJsonSecret } from '@/lib/security/credential-vault'
import {
  buildSchemaIntelligenceProfile,
  type SchemaForeignKeyEvidence,
  type SchemaIntelligenceProfile,
} from '@/lib/data-sources/schema-profile'
import type { DataSourceSslMode, PostgresCredentialInput } from '@/types/data-source'

const DEFAULT_CONNECT_TIMEOUT_MS = 8_000
const DEFAULT_QUERY_TIMEOUT_MS = 12_000
const DEFAULT_POOL_MAX = 3
const DEFAULT_POOL_IDLE_MS = 5 * 60_000
const DEFAULT_POOL_CONNECTION_IDLE_MS = 30_000
const DEFAULT_MAX_ACTIVE_POOLS = 30
const MAX_SCHEMA_TABLES = 500
const MAX_SCHEMA_COLUMNS = 5_000
const MAX_SELECTED_SCHEMAS = 10
const MAX_PROFILE_COLUMNS_PER_TABLE = 50
const MAX_PROFILE_ROWS_PER_TABLE = 200
interface PostgresRuntimeOptions {
  connectTimeoutMs?: number
  queryTimeoutMs?: number
  parameters?: unknown[]
  poolKey?: string
  poolMax?: number
  poolIdleMs?: number
  maxActivePools?: number
  usePool?: boolean
}

export interface PostgresColumnMetadata {
  schemaName: string
  tableName: string
  columnName: string
  ordinalPosition: number
  dataType: string
  udtName: string
  isNullable: boolean
  columnDefault?: string | null
  comment?: string | null
  isPrimaryKey?: boolean
  isUnique?: boolean
  isIndexed?: boolean
}

export interface PostgresTableMetadata {
  schemaName: string
  tableName: string
  tableType: string
  relationKind?: string | null
  comment?: string | null
  estimatedRowCount?: number | null
  columns: PostgresColumnMetadata[]
}

export type PostgresSchemaTruncationReason = 'column_limit' | 'table_limit'

export interface PostgresSchemaIntrospectionResult {
  tables: PostgresTableMetadata[]
  selectedSchemas?: string[]
  foreignKeys?: SchemaForeignKeyEvidence[]
  completeness: {
    complete: boolean
    reasons: PostgresSchemaTruncationReason[]
    observedColumnCount: number
    acceptedColumnCount: number
    maxColumns: number
    maxTables: number
  }
}

export interface PostgresSchemaRow extends PostgresColumnMetadata {
  tableType: string
  relationKind?: string | null
  tableComment?: string | null
  estimatedRowCount?: number | null
}

interface PostgresForeignKeyRow {
  constraintName: string
  sourceSchema: string
  sourceTable: string
  sourceColumn: string
  targetSchema: string
  targetTable: string
  targetColumn: string
}

interface ManagedPostgresPool {
  pool: Pool
  activeQueries: number
  createdAt: number
  lastUsedAt: number
}

const globalForPostgresPools = globalThis as typeof globalThis & {
  __dashboardPostgresPools?: Map<string, ManagedPostgresPool>
}

const postgresPools = globalForPostgresPools.__dashboardPostgresPools ?? new Map<string, ManagedPostgresPool>()
globalForPostgresPools.__dashboardPostgresPools = postgresPools

function sslConfigForMode(mode: DataSourceSslMode) {
  if (mode === 'disable') return false
  if (mode === 'verify-full' || mode === 'verify-ca') {
    return { rejectUnauthorized: true }
  }
  return { rejectUnauthorized: false }
}

export function decryptPostgresCredential(ciphertext: string): PostgresCredentialInput {
  const parsed = decryptJsonSecret<PostgresCredentialInput & { type?: string }>(ciphertext)
  if (parsed.type && parsed.type !== 'postgres') {
    throw new Error('Encrypted credential is not a Postgres credential')
  }
  return parsed
}

export function createPostgresClient(
  credential: PostgresCredentialInput,
  options: PostgresRuntimeOptions = {},
) {
  return new Client({
    host: credential.host,
    port: credential.port,
    database: credential.database,
    user: credential.username,
    password: credential.password,
    ssl: sslConfigForMode(credential.sslMode),
    connectionTimeoutMillis: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    query_timeout: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
    statement_timeout: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
  })
}

function postgresPoolKey(credential: PostgresCredentialInput, options: PostgresRuntimeOptions) {
  return options.poolKey ?? [
    credential.host,
    credential.port,
    credential.database,
    credential.username,
    credential.sslMode,
  ].join(':')
}

function cleanupIdlePostgresPools(poolIdleMs: number, now = Date.now()) {
  for (const [key, managed] of postgresPools.entries()) {
    if (managed.activeQueries > 0) continue
    if (now - managed.lastUsedAt < poolIdleMs) continue
    postgresPools.delete(key)
    managed.pool.end().catch(() => undefined)
  }
}

function evictOldestIdlePool(maxActivePools: number) {
  if (postgresPools.size < maxActivePools) return

  const idlePools = Array.from(postgresPools.entries())
    .filter(([, managed]) => managed.activeQueries === 0)
    .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)

  const oldest = idlePools[0]
  if (!oldest) {
    throw new Error('All database pools are busy. Please retry shortly.')
  }

  postgresPools.delete(oldest[0])
  oldest[1].pool.end().catch(() => undefined)
}

function getPostgresPool(
  credential: PostgresCredentialInput,
  options: PostgresRuntimeOptions = {},
) {
  const now = Date.now()
  const key = postgresPoolKey(credential, options)
  cleanupIdlePostgresPools(options.poolIdleMs ?? DEFAULT_POOL_IDLE_MS, now)

  const existing = postgresPools.get(key)
  if (existing) {
    existing.lastUsedAt = now
    return existing
  }

  evictOldestIdlePool(options.maxActivePools ?? DEFAULT_MAX_ACTIVE_POOLS)

  const managed: ManagedPostgresPool = {
    pool: new Pool({
      host: credential.host,
      port: credential.port,
      database: credential.database,
      user: credential.username,
      password: credential.password,
      ssl: sslConfigForMode(credential.sslMode),
      max: options.poolMax ?? DEFAULT_POOL_MAX,
      idleTimeoutMillis: DEFAULT_POOL_CONNECTION_IDLE_MS,
      connectionTimeoutMillis: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      query_timeout: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
      statement_timeout: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
    }),
    activeQueries: 0,
    createdAt: now,
    lastUsedAt: now,
  }
  postgresPools.set(key, managed)
  return managed
}

async function withPostgresClient<T>(
  credential: PostgresCredentialInput,
  options: PostgresRuntimeOptions,
  operation: (client: Client | PoolClient) => Promise<T>,
) {
  if (options.usePool === false) {
    const client = createPostgresClient(credential, options)
    try {
      await client.connect()
      return await operation(client)
    } finally {
      await client.end().catch(() => undefined)
    }
  }

  const managed = getPostgresPool(credential, options)
  managed.activeQueries += 1
  managed.lastUsedAt = Date.now()
  const client = await managed.pool.connect()

  try {
    return await operation(client)
  } finally {
    client.release()
    managed.activeQueries = Math.max(0, managed.activeQueries - 1)
    managed.lastUsedAt = Date.now()
  }
}

export async function testPostgresConnection(ciphertext: string) {
  const credential = decryptPostgresCredential(ciphertext)
  const client = createPostgresClient(credential)
  const startedAt = Date.now()

  try {
    await client.connect()
    const result = await client.query<{ now: string; current_database: string; current_user: string }>(
      'select now()::text, current_database()::text, current_user::text',
    )
    const row = result.rows[0]
    return {
      ok: true,
      latencyMs: Math.max(0, Date.now() - startedAt),
      database: row?.current_database ?? credential.database,
      user: row?.current_user ?? credential.username,
      serverTime: row?.now ?? null,
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

export function buildPostgresSchemaIntrospectionResult(
  rows: PostgresSchemaRow[],
  limits: { maxColumns?: number; maxTables?: number } = {},
  context: { selectedSchemas?: string[]; foreignKeys?: SchemaForeignKeyEvidence[] } = {},
): PostgresSchemaIntrospectionResult {
  const maxColumns = limits.maxColumns ?? MAX_SCHEMA_COLUMNS
  const maxTables = limits.maxTables ?? MAX_SCHEMA_TABLES
  const columnLimitExceeded = rows.length > maxColumns
  const acceptedRows = rows.slice(0, maxColumns)
  const reasons: PostgresSchemaTruncationReason[] = []
  if (columnLimitExceeded) reasons.push('column_limit')

  const tableMap = new Map<string, PostgresTableMetadata>()
  let tableLimitExceeded = false
  for (const row of acceptedRows) {
    const key = `${row.schemaName}.${row.tableName}`
    const existing = tableMap.get(key)
    if (!existing && tableMap.size >= maxTables) {
      tableLimitExceeded = true
      continue
    }
    const table = existing ?? {
      schemaName: row.schemaName,
      tableName: row.tableName,
      tableType: row.tableType,
      relationKind: row.relationKind ?? null,
      comment: row.tableComment ?? null,
      estimatedRowCount: row.estimatedRowCount === null || row.estimatedRowCount === undefined
        ? null
        : Number(row.estimatedRowCount),
      columns: [],
    }
    table.columns.push({
      schemaName: row.schemaName,
      tableName: row.tableName,
      columnName: row.columnName,
      ordinalPosition: Number(row.ordinalPosition),
      dataType: row.dataType,
      udtName: row.udtName,
      isNullable: Boolean(row.isNullable),
      columnDefault: row.columnDefault,
      comment: row.comment ?? null,
      isPrimaryKey: Boolean(row.isPrimaryKey),
      isUnique: Boolean(row.isUnique),
      isIndexed: Boolean(row.isIndexed),
    })
    tableMap.set(key, table)
  }

  if (tableLimitExceeded) reasons.push('table_limit')
  const tables = Array.from(tableMap.values())
  return {
    tables,
    selectedSchemas: context.selectedSchemas ?? [],
    foreignKeys: context.foreignKeys ?? [],
    completeness: {
      complete: reasons.length === 0,
      reasons,
      observedColumnCount: rows.length,
      acceptedColumnCount: tables.reduce((total, table) => total + table.columns.length, 0),
      maxColumns,
      maxTables,
    },
  }
}

export function resolvePostgresSchemaScope(
  credential: Pick<PostgresCredentialInput, 'schemas'>,
  configuredSchemas = process.env.DATA_SOURCE_SCHEMAS,
) {
  const requested = credential.schemas?.length
    ? credential.schemas
    : configuredSchemas?.split(',').map(value => value.trim()).filter(Boolean) ?? ['public']
  const unique = Array.from(new Set(requested))
  if (unique.length === 0) return ['public']
  if (unique.length > MAX_SELECTED_SCHEMAS) {
    throw new Error(`A maximum of ${MAX_SELECTED_SCHEMAS} schemas can be introspected per data source`)
  }
  for (const schema of unique) {
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema)) {
      throw new Error(`Invalid Postgres schema name: ${schema}`)
    }
  }
  return unique
}

function quotePostgresIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export async function introspectPostgresSchema(ciphertext: string): Promise<PostgresSchemaIntrospectionResult> {
  const credential = decryptPostgresCredential(ciphertext)
  const selectedSchemas = resolvePostgresSchemaScope(credential)

  return withPostgresClient(credential, { queryTimeoutMs: 15_000, usePool: false }, async client => {
    const [result, foreignKeyResult] = await Promise.all([
      client.query<PostgresSchemaRow>(
      `
        select
          c.table_schema as "schemaName",
          c.table_name as "tableName",
          t.table_type as "tableType",
          cls.relkind::text as "relationKind",
          c.column_name as "columnName",
          c.ordinal_position as "ordinalPosition",
          c.data_type as "dataType",
          c.udt_name as "udtName",
          (c.is_nullable = 'YES') as "isNullable",
          c.column_default as "columnDefault",
          pg_catalog.col_description(cls.oid, attr.attnum) as "comment",
          pg_catalog.obj_description(cls.oid, 'pg_class') as "tableComment",
          greatest(cls.reltuples, 0)::bigint as "estimatedRowCount",
          exists (
            select 1 from pg_catalog.pg_constraint key_constraint
            where key_constraint.conrelid = cls.oid
              and key_constraint.contype = 'p'
              and attr.attnum = any(key_constraint.conkey)
          ) as "isPrimaryKey",
          exists (
            select 1 from pg_catalog.pg_constraint unique_constraint
            where unique_constraint.conrelid = cls.oid
              and unique_constraint.contype in ('p', 'u')
              and attr.attnum = any(unique_constraint.conkey)
          ) as "isUnique",
          exists (
            select 1 from pg_catalog.pg_index column_index
            where column_index.indrelid = cls.oid
              and attr.attnum = any(column_index.indkey)
          ) as "isIndexed"
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema
         and t.table_name = c.table_name
        join pg_catalog.pg_namespace ns on ns.nspname = c.table_schema
        join pg_catalog.pg_class cls on cls.relnamespace = ns.oid and cls.relname = c.table_name and cls.relkind in ('r', 'p', 'v', 'm', 'f')
        join pg_catalog.pg_attribute attr on attr.attrelid = cls.oid and attr.attname = c.column_name and attr.attnum > 0
        where c.table_schema = any($2::text[])
          and t.table_type in ('BASE TABLE', 'VIEW')
        order by c.table_schema, c.table_name, c.ordinal_position
        limit $1
      `,
      [MAX_SCHEMA_COLUMNS + 1, selectedSchemas],
      ),
      client.query<PostgresForeignKeyRow>(
        `
          select
            constraint_row.conname as "constraintName",
            source_namespace.nspname as "sourceSchema",
            source_table.relname as "sourceTable",
            source_column.attname as "sourceColumn",
            target_namespace.nspname as "targetSchema",
            target_table.relname as "targetTable",
            target_column.attname as "targetColumn"
          from pg_catalog.pg_constraint constraint_row
          join pg_catalog.pg_class source_table on source_table.oid = constraint_row.conrelid
          join pg_catalog.pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
          join pg_catalog.pg_class target_table on target_table.oid = constraint_row.confrelid
          join pg_catalog.pg_namespace target_namespace on target_namespace.oid = target_table.relnamespace
          join lateral unnest(constraint_row.conkey) with ordinality source_key(attnum, position) on true
          join lateral unnest(constraint_row.confkey) with ordinality target_key(attnum, position) on target_key.position = source_key.position
          join pg_catalog.pg_attribute source_column on source_column.attrelid = source_table.oid and source_column.attnum = source_key.attnum
          join pg_catalog.pg_attribute target_column on target_column.attrelid = target_table.oid and target_column.attnum = target_key.attnum
          where constraint_row.contype = 'f'
            and source_namespace.nspname = any($1::text[])
            and target_namespace.nspname = any($1::text[])
          order by source_namespace.nspname, source_table.relname, constraint_row.conname, source_key.position
        `,
        [selectedSchemas],
      ),
    ])
    return buildPostgresSchemaIntrospectionResult(result.rows, {}, {
      selectedSchemas,
      foreignKeys: foreignKeyResult.rows,
    })
  })
}

export async function profilePostgresSchema(
  ciphertext: string,
  introspection: PostgresSchemaIntrospectionResult,
): Promise<SchemaIntelligenceProfile> {
  const credential = decryptPostgresCredential(ciphertext)
  const sampledRows = new Map<string, Array<Record<string, unknown>>>()
  const warnings: string[] = []
  const profileTables = introspection.tables.map(table => ({
    ...table,
    totalColumnCount: table.columns.length,
    columns: table.columns.slice(0, MAX_PROFILE_COLUMNS_PER_TABLE),
  }))

  await withPostgresClient(credential, { queryTimeoutMs: 30_000, usePool: false }, async client => {
    await client.query('begin read only')
    try {
      for (const table of profileTables) {
        const columns = table.columns
        if (table.totalColumnCount > columns.length) {
          warnings.push(`${table.schemaName}.${table.tableName}: profiled the first ${columns.length} of ${table.totalColumnCount} columns`)
        }
        if (columns.length === 0) continue
        const projection = columns.map(column => quotePostgresIdentifier(column.columnName)).join(', ')
        const qualifiedTable = `${quotePostgresIdentifier(table.schemaName)}.${quotePostgresIdentifier(table.tableName)}`
        await client.query('savepoint schema_profile_table')
        try {
          const result = await client.query<Record<string, unknown>>(
            `select ${projection} from ${qualifiedTable} limit $1`,
            [MAX_PROFILE_ROWS_PER_TABLE],
          )
          sampledRows.set(`${table.schemaName}.${table.tableName}`, result.rows)
          await client.query('release savepoint schema_profile_table')
        } catch (error) {
          await client.query('rollback to savepoint schema_profile_table').catch(() => undefined)
          await client.query('release savepoint schema_profile_table').catch(() => undefined)
          const message = error instanceof Error ? error.message : String(error)
          warnings.push(`${table.schemaName}.${table.tableName}: sampling skipped (${message.slice(0, 160)})`)
        }
      }
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    }
  })

  return buildSchemaIntelligenceProfile({
    selectedSchemas: introspection.selectedSchemas ?? ['public'],
    tables: profileTables,
    foreignKeys: introspection.foreignKeys ?? [],
    sampledRows,
    warnings,
  })
}

export async function executePostgresReadOnlyQuery(
  ciphertext: string,
  sql: string,
  options: PostgresRuntimeOptions = {},
) {
  const normalized = sql.trim().toLowerCase()
  if (!normalized.startsWith('select ')) {
    throw new Error('Only SELECT statements can be executed through dataset previews')
  }
  if (/;\s*\S/.test(sql) || /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do)\b/i.test(sql)) {
    throw new Error('Dataset query failed read-only validation')
  }

  const credential = decryptPostgresCredential(ciphertext)
  const startedAt = Date.now()

  return withPostgresClient(credential, {
    ...options,
    queryTimeoutMs: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
  }, async client => {
    try {
      await client.query('begin read only')
      await client.query('select set_config($1, $2, true)', [
        'statement_timeout',
        String(options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS),
      ])
      const result = await client.query<Record<string, unknown>>(sql, options.parameters ?? [])
      await client.query('commit')
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
        fields: result.fields.map(field => ({ name: field.name, dataTypeId: field.dataTypeID })),
        elapsedMs: Math.max(0, Date.now() - startedAt),
      }
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    }
  })
}
