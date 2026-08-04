import oracledb, { type Connection, type Pool } from 'oracledb'

import { decryptJsonSecret } from '@/lib/security/credential-vault'
import {
  buildSchemaIntelligenceProfile,
  type SchemaForeignKeyEvidence,
  type SchemaIntelligenceProfile,
} from '@/lib/data-sources/schema-profile'
import {
  buildPostgresSchemaIntrospectionResult,
  type PostgresRuntimeOptions,
  type PostgresSchemaIntrospectionResult,
  type PostgresSchemaRow,
} from '@/lib/data-sources/postgres-runtime'
import type { OracleCredentialInput } from '@/types/data-source'

const MAX_SCHEMA_COLUMNS = 5_000
const MAX_SELECTED_SCHEMAS = 10
const MAX_PROFILE_COLUMNS_PER_TABLE = 50
const MAX_PROFILE_ROWS_PER_TABLE = 200
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 8
const DEFAULT_QUERY_TIMEOUT_MS = 12_000
const DEFAULT_POOL_IDLE_MS = 5 * 60_000
const DEFAULT_MAX_ACTIVE_POOLS = 30

// ponytail: Phase-one Oracle support uses Thin TCP connections. Add wallet/TCPS
// configuration only when a real source requires it.

interface OracleForeignKeyRow {
  constraintName: string
  sourceSchema: string
  sourceTable: string
  sourceColumn: string
  targetSchema: string
  targetTable: string
  targetColumn: string
}

interface ManagedOraclePool {
  pool: Promise<Pool>
  activeQueries: number
  lastUsedAt: number
}

const globalForOraclePools = globalThis as typeof globalThis & {
  __dashboardOraclePools?: Map<string, ManagedOraclePool>
}
const oraclePools = globalForOraclePools.__dashboardOraclePools ?? new Map<string, ManagedOraclePool>()
globalForOraclePools.__dashboardOraclePools = oraclePools

export function decryptOracleCredential(ciphertext: string): OracleCredentialInput {
  const parsed = decryptJsonSecret<OracleCredentialInput & { type?: string }>(ciphertext)
  if (parsed.type !== 'oracle') throw new Error('Encrypted credential is not an Oracle credential')
  if (!/^[A-Za-z0-9.-]+$/.test(parsed.host)) throw new Error('Invalid Oracle host')
  if (!/^[A-Za-z0-9._$#-]+$/.test(parsed.database)) throw new Error('Invalid Oracle SID or service name')
  if (parsed.connectType !== 'sid' && parsed.connectType !== 'service_name') {
    throw new Error('Invalid Oracle connection identifier type')
  }
  return parsed
}

export function oracleConnectString(credential: OracleCredentialInput) {
  const identifier = credential.connectType === 'sid'
    ? `(SID=${credential.database})`
    : `(SERVICE_NAME=${credential.database})`
  return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${credential.host})(PORT=${credential.port}))(CONNECT_DATA=(SERVER=DEDICATED)${identifier}))`
}

function connectionAttributes(credential: OracleCredentialInput) {
  return {
    user: credential.username,
    password: credential.password,
    connectString: oracleConnectString(credential),
    connectTimeout: DEFAULT_CONNECT_TIMEOUT_SECONDS,
    transportConnectTimeout: DEFAULT_CONNECT_TIMEOUT_SECONDS,
  }
}

function oraclePoolKey(credential: OracleCredentialInput, options: PostgresRuntimeOptions) {
  return options.poolKey ?? [
    credential.host,
    credential.port,
    credential.database,
    credential.connectType,
    credential.username,
  ].join(':')
}

function cleanupIdleOraclePools(poolIdleMs: number, now = Date.now()) {
  for (const [key, managed] of oraclePools.entries()) {
    if (managed.activeQueries > 0 || now - managed.lastUsedAt < poolIdleMs) continue
    oraclePools.delete(key)
    managed.pool.then(pool => pool.close(0)).catch(() => undefined)
  }
}

function evictOldestIdleOraclePool(maxActivePools: number) {
  if (oraclePools.size < maxActivePools) return
  const oldest = Array.from(oraclePools.entries())
    .filter(([, managed]) => managed.activeQueries === 0)
    .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)[0]
  if (!oldest) throw new Error('All database pools are busy. Please retry shortly.')
  oraclePools.delete(oldest[0])
  oldest[1].pool.then(pool => pool.close(0)).catch(() => undefined)
}

async function getOraclePool(credential: OracleCredentialInput, options: PostgresRuntimeOptions) {
  const now = Date.now()
  const key = oraclePoolKey(credential, options)
  cleanupIdleOraclePools(options.poolIdleMs ?? DEFAULT_POOL_IDLE_MS, now)
  const existing = oraclePools.get(key)
  if (existing) {
    existing.lastUsedAt = now
    return existing
  }

  evictOldestIdleOraclePool(options.maxActivePools ?? DEFAULT_MAX_ACTIVE_POOLS)
  const managed: ManagedOraclePool = {
    pool: oracledb.createPool({
      ...connectionAttributes(credential),
      poolMin: 0,
      poolMax: options.poolMax ?? 3,
      poolIncrement: 1,
      poolTimeout: 30,
      queueTimeout: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
    }),
    activeQueries: 0,
    lastUsedAt: now,
  }
  oraclePools.set(key, managed)
  try {
    await managed.pool
    return managed
  } catch (error) {
    if (oraclePools.get(key) === managed) oraclePools.delete(key)
    throw error
  }
}

async function withOracleConnection<T>(
  credential: OracleCredentialInput,
  options: PostgresRuntimeOptions,
  operation: (connection: Connection) => Promise<T>,
) {
  if (options.usePool === false) {
    const connection = await oracledb.getConnection(connectionAttributes(credential))
    try {
      connection.callTimeout = options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS
      return await operation(connection)
    } finally {
      await connection.close().catch(() => undefined)
    }
  }

  const managed = await getOraclePool(credential, options)
  const pool = await managed.pool
  managed.activeQueries += 1
  managed.lastUsedAt = Date.now()
  const connection = await pool.getConnection()
  try {
    connection.callTimeout = options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS
    return await operation(connection)
  } finally {
    await connection.close().catch(() => undefined)
    managed.activeQueries = Math.max(0, managed.activeQueries - 1)
    managed.lastUsedAt = Date.now()
  }
}

export function resolveOracleSchemaScope(credential: Pick<OracleCredentialInput, 'schemas' | 'username'>) {
  const requested = credential.schemas?.length ? credential.schemas : [credential.username]
  const unique = Array.from(new Set(requested.map(schema => schema.trim().toUpperCase()).filter(Boolean)))
  if (unique.length === 0) throw new Error('At least one Oracle schema is required')
  if (unique.length > MAX_SELECTED_SCHEMAS) {
    throw new Error(`A maximum of ${MAX_SELECTED_SCHEMAS} schemas can be introspected per data source`)
  }
  for (const schema of unique) {
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema)) throw new Error(`Invalid Oracle schema name: ${schema}`)
  }
  return unique
}

function schemaBinds(selectedSchemas: string[]) {
  return Object.fromEntries(selectedSchemas.map((schema, index) => [`schema${index}`, schema]))
}

function schemaPlaceholders(selectedSchemas: string[]) {
  return selectedSchemas.map((_, index) => `:schema${index}`).join(', ')
}

function quoteOracleIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export async function testOracleConnection(ciphertext: string) {
  const credential = decryptOracleCredential(ciphertext)
  const startedAt = Date.now()
  return withOracleConnection(credential, { usePool: false }, async connection => {
    const result = await connection.execute<Record<string, unknown>>(
      `select
         systimestamp as "serverTime",
         sys_context('USERENV', 'DB_NAME') as "database",
         user as "user"
       from dual`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 1 },
    )
    const row = result.rows?.[0]
    const serverTime = row?.serverTime
    return {
      ok: true,
      latencyMs: Math.max(0, Date.now() - startedAt),
      database: String(row?.database ?? credential.database),
      user: String(row?.user ?? credential.username),
      serverTime: serverTime instanceof Date ? serverTime.toISOString() : String(serverTime ?? ''),
    }
  })
}

export async function introspectOracleSchema(
  ciphertext: string,
  schemaOverride?: string[],
): Promise<PostgresSchemaIntrospectionResult> {
  const credential = decryptOracleCredential(ciphertext)
  const selectedSchemas = resolveOracleSchemaScope({
    username: credential.username,
    schemas: schemaOverride?.length ? schemaOverride : credential.schemas,
  })
  const placeholders = schemaPlaceholders(selectedSchemas)
  const binds = schemaBinds(selectedSchemas)

  return withOracleConnection(credential, { queryTimeoutMs: 20_000, usePool: false }, async connection => {
    const columnsResult = await connection.execute<PostgresSchemaRow>(
        `select * from (
          select
            c.owner as "schemaName",
            c.table_name as "tableName",
            case when o.object_type = 'TABLE' then 'BASE TABLE' else o.object_type end as "tableType",
            case o.object_type when 'TABLE' then 'r' when 'VIEW' then 'v' when 'MATERIALIZED VIEW' then 'm' end as "relationKind",
            c.column_name as "columnName",
            c.column_id as "ordinalPosition",
            c.data_type as "dataType",
            case when c.data_type_owner is null then c.data_type else c.data_type_owner || '.' || c.data_type end as "udtName",
            case when c.nullable = 'Y' then 1 else 0 end as "isNullable",
            cast(null as varchar2(1)) as "columnDefault",
            cc.comments as "comment",
            tc.comments as "tableComment",
            t.num_rows as "estimatedRowCount",
            case when exists (
              select 1 from all_constraints pk
              join all_cons_columns pkc on pkc.owner = pk.owner and pkc.constraint_name = pk.constraint_name
              where pk.owner = c.owner and pk.table_name = c.table_name and pkc.column_name = c.column_name and pk.constraint_type = 'P'
            ) then 1 else 0 end as "isPrimaryKey",
            case when exists (
              select 1 from all_constraints uq
              join all_cons_columns uqc on uqc.owner = uq.owner and uqc.constraint_name = uq.constraint_name
              where uq.owner = c.owner and uq.table_name = c.table_name and uqc.column_name = c.column_name and uq.constraint_type in ('P', 'U')
            ) then 1 else 0 end as "isUnique",
            case when exists (
              select 1 from all_ind_columns ic
              where ic.table_owner = c.owner and ic.table_name = c.table_name and ic.column_name = c.column_name
            ) then 1 else 0 end as "isIndexed"
          from all_tab_columns c
          join all_objects o on o.owner = c.owner and o.object_name = c.table_name and o.object_type in ('TABLE', 'VIEW', 'MATERIALIZED VIEW')
          left join all_col_comments cc on cc.owner = c.owner and cc.table_name = c.table_name and cc.column_name = c.column_name
          left join all_tab_comments tc on tc.owner = c.owner and tc.table_name = c.table_name
          left join all_tables t on t.owner = c.owner and t.table_name = c.table_name
          where c.owner in (${placeholders})
          order by c.owner, c.table_name, c.column_id
        ) where rownum <= :maxColumns`,
        { ...binds, maxColumns: MAX_SCHEMA_COLUMNS + 1 },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: MAX_SCHEMA_COLUMNS + 1 },
      )
    const foreignKeysResult = await connection.execute<OracleForeignKeyRow>(
        `select
          fk.constraint_name as "constraintName",
          source_col.owner as "sourceSchema",
          source_col.table_name as "sourceTable",
          source_col.column_name as "sourceColumn",
          target_col.owner as "targetSchema",
          target_col.table_name as "targetTable",
          target_col.column_name as "targetColumn"
        from all_constraints fk
        join all_cons_columns source_col
          on source_col.owner = fk.owner and source_col.constraint_name = fk.constraint_name
        join all_constraints target_constraint
          on target_constraint.owner = fk.r_owner and target_constraint.constraint_name = fk.r_constraint_name
        join all_cons_columns target_col
          on target_col.owner = target_constraint.owner
         and target_col.constraint_name = target_constraint.constraint_name
         and target_col.position = source_col.position
        where fk.constraint_type = 'R'
          and source_col.owner in (${placeholders})
          and target_col.owner in (${placeholders})
        order by source_col.owner, source_col.table_name, fk.constraint_name, source_col.position`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: MAX_SCHEMA_COLUMNS },
      )

    return buildPostgresSchemaIntrospectionResult(columnsResult.rows ?? [], {}, {
      selectedSchemas,
      foreignKeys: (foreignKeysResult.rows ?? []) as SchemaForeignKeyEvidence[],
    })
  })
}

export async function profileOracleSchema(
  ciphertext: string,
  introspection: PostgresSchemaIntrospectionResult,
): Promise<SchemaIntelligenceProfile> {
  const credential = decryptOracleCredential(ciphertext)
  const sampledRows = new Map<string, Array<Record<string, unknown>>>()
  const warnings: string[] = []
  const profileTables = introspection.tables.map(table => ({
    ...table,
    totalColumnCount: table.columns.length,
    columns: table.columns.slice(0, MAX_PROFILE_COLUMNS_PER_TABLE),
  }))

  await withOracleConnection(credential, { queryTimeoutMs: 30_000, usePool: false }, async connection => {
    for (const table of profileTables) {
      const columns = table.columns
      if (table.totalColumnCount > columns.length) {
        warnings.push(`${table.schemaName}.${table.tableName}: profiled the first ${columns.length} of ${table.totalColumnCount} columns`)
      }
      if (columns.length === 0) continue
      const projection = columns.map(column => quoteOracleIdentifier(column.columnName)).join(', ')
      const qualifiedTable = `${quoteOracleIdentifier(table.schemaName)}.${quoteOracleIdentifier(table.tableName)}`
      try {
        const result = await connection.execute<Record<string, unknown>>(
          `select ${projection} from ${qualifiedTable} where rownum <= :maxRows`,
          { maxRows: MAX_PROFILE_ROWS_PER_TABLE },
          { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: MAX_PROFILE_ROWS_PER_TABLE },
        )
        sampledRows.set(`${table.schemaName}.${table.tableName}`, result.rows ?? [])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warnings.push(`${table.schemaName}.${table.tableName}: sampling skipped (${message.slice(0, 160)})`)
      }
    }
  })

  return buildSchemaIntelligenceProfile({
    selectedSchemas: introspection.selectedSchemas ?? [credential.username.toUpperCase()],
    tables: profileTables,
    foreignKeys: introspection.foreignKeys ?? [],
    sampledRows,
    warnings,
  })
}

export async function executeOracleReadOnlyQuery(
  ciphertext: string,
  sql: string,
  options: PostgresRuntimeOptions = {},
) {
  const normalized = sql.trim().toLowerCase()
  if (!normalized.startsWith('select ')) throw new Error('Only SELECT statements can be executed through dataset previews')
  if (/;\s*\S/.test(sql) || /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|execute|begin|declare|call)\b/i.test(sql)) {
    throw new Error('Dataset query failed read-only validation')
  }

  const credential = decryptOracleCredential(ciphertext)
  const startedAt = Date.now()
  return withOracleConnection(credential, {
    ...options,
    queryTimeoutMs: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
  }, async connection => {
    await connection.execute('set transaction read only')
    try {
      const result = await connection.execute<Record<string, unknown>>(
        sql,
        options.parameters ?? [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 500 },
      )
      const rows = result.rows ?? []
      await connection.rollback()
      return {
        rows,
        rowCount: rows.length,
        fields: (result.metaData ?? []).map(field => ({ name: field.name, dataTypeId: 0 })),
        elapsedMs: Math.max(0, Date.now() - startedAt),
      }
    } catch (error) {
      await connection.rollback().catch(() => undefined)
      throw error
    }
  })
}
