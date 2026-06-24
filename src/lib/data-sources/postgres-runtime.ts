import { Client } from 'pg'

import { decryptJsonSecret } from '@/lib/security/credential-vault'
import type { DataSourceSslMode, PostgresCredentialInput } from '@/types/data-source'

const DEFAULT_CONNECT_TIMEOUT_MS = 8_000
const DEFAULT_QUERY_TIMEOUT_MS = 12_000
const MAX_SCHEMA_TABLES = 500
const MAX_SCHEMA_COLUMNS = 5_000

interface PostgresRuntimeOptions {
  connectTimeoutMs?: number
  queryTimeoutMs?: number
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
}

export interface PostgresTableMetadata {
  schemaName: string
  tableName: string
  tableType: string
  columns: PostgresColumnMetadata[]
}

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

export async function introspectPostgresSchema(ciphertext: string): Promise<PostgresTableMetadata[]> {
  const credential = decryptPostgresCredential(ciphertext)
  const client = createPostgresClient(credential, { queryTimeoutMs: 15_000 })

  try {
    await client.connect()
    const result = await client.query<PostgresColumnMetadata & { tableType: string }>(
      `
        select
          c.table_schema as "schemaName",
          c.table_name as "tableName",
          t.table_type as "tableType",
          c.column_name as "columnName",
          c.ordinal_position as "ordinalPosition",
          c.data_type as "dataType",
          c.udt_name as "udtName",
          (c.is_nullable = 'YES') as "isNullable",
          c.column_default as "columnDefault"
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema
         and t.table_name = c.table_name
        where c.table_schema not in ('pg_catalog', 'information_schema')
          and t.table_type in ('BASE TABLE', 'VIEW')
        order by c.table_schema, c.table_name, c.ordinal_position
        limit $1
      `,
      [MAX_SCHEMA_COLUMNS],
    )

    const tableMap = new Map<string, PostgresTableMetadata>()
    for (const row of result.rows) {
      const key = `${row.schemaName}.${row.tableName}`
      const existing = tableMap.get(key)
      const table = existing ?? {
        schemaName: row.schemaName,
        tableName: row.tableName,
        tableType: row.tableType,
        columns: [],
      }
      if (!existing && tableMap.size >= MAX_SCHEMA_TABLES) continue
      table.columns.push({
        schemaName: row.schemaName,
        tableName: row.tableName,
        columnName: row.columnName,
        ordinalPosition: Number(row.ordinalPosition),
        dataType: row.dataType,
        udtName: row.udtName,
        isNullable: Boolean(row.isNullable),
        columnDefault: row.columnDefault,
      })
      tableMap.set(key, table)
    }

    return Array.from(tableMap.values())
  } finally {
    await client.end().catch(() => undefined)
  }
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
  const client = createPostgresClient(credential, { queryTimeoutMs: options.queryTimeoutMs ?? 12_000 })
  const startedAt = Date.now()

  try {
    await client.connect()
    await client.query('begin read only')
    await client.query('select set_config($1, $2, true)', [
      'statement_timeout',
      String(options.queryTimeoutMs ?? 12_000),
    ])
    const result = await client.query<Record<string, unknown>>(sql)
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
  } finally {
    await client.end().catch(() => undefined)
  }
}
