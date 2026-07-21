export const SCHEMA_PROFILE_VERSION = 1

export type SchemaSensitivity = 'none' | 'identifier' | 'personal' | 'secret'
export type SchemaSemanticType = 'boolean' | 'category' | 'date_time' | 'email' | 'identifier' | 'numeric' | 'phone' | 'text'

export interface SchemaProfileColumnInput {
  schemaName: string
  tableName: string
  columnName: string
  dataType: string
  udtName: string
  isNullable: boolean
  isPrimaryKey?: boolean
  isUnique?: boolean
  isIndexed?: boolean
  comment?: string | null
}

export interface SchemaProfileTableInput {
  schemaName: string
  tableName: string
  tableType: string
  comment?: string | null
  estimatedRowCount?: number | null
  totalColumnCount?: number
  columns: SchemaProfileColumnInput[]
}

export interface SchemaForeignKeyEvidence {
  constraintName: string
  sourceSchema: string
  sourceTable: string
  sourceColumn: string
  targetSchema: string
  targetTable: string
  targetColumn: string
}

export interface SchemaColumnProfile {
  schemaName: string
  tableName: string
  columnName: string
  semanticType: SchemaSemanticType
  sensitivity: SchemaSensitivity
  sensitivityReasons: string[]
  sampleRowCount: number
  nullPercent: number
  approximateDistinctCount: number
  distinctRatio: number
  minimum: string | null
  maximum: string | null
  maskedExamples: string[]
}

export interface SchemaTableProfile {
  schemaName: string
  tableName: string
  tableType: string
  comment: string | null
  estimatedRowCount: number | null
  sampledRowCount: number
  profiledColumnCount: number
  totalColumnCount: number
}

export interface SchemaJoinCandidate {
  sourceSchema: string
  sourceTable: string
  sourceColumn: string
  targetSchema: string
  targetTable: string
  targetColumn: string
  relationship: 'one_to_one' | 'many_to_one' | 'unknown'
  evidence: 'foreign_key' | 'name_and_type'
  confidence: number
  reasons: string[]
}

export interface SchemaIntelligenceProfile {
  version: typeof SCHEMA_PROFILE_VERSION
  selectedSchemas: string[]
  generatedAt: string
  tableProfiles: SchemaTableProfile[]
  columnProfiles: SchemaColumnProfile[]
  joinCandidates: SchemaJoinCandidate[]
  warnings: string[]
  summary: {
    tableCount: number
    columnCount: number
    profiledColumnCount: number
    sensitiveColumnCount: number
    explicitJoinCount: number
    inferredJoinCount: number
    warningCount: number
  }
}

const SECRET_NAME = /(^|_)(password|passwd|secret|token|api_?key|private_?key|credential|salt|hash)($|_)/i
const PERSONAL_NAME = /(^|_)(email|phone|mobile|address|first_?name|last_?name|full_?name|dob|birth|ssn|aadhaar|pan)($|_)/i
const IDENTIFIER_NAME = /(^id$|_id$|^uuid$|_uuid$|account_?number|customer_?number)/i
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_VALUE = /^\+?[\d\s().-]{7,20}$/
const NUMERIC_TYPE = /^(smallint|integer|bigint|decimal|numeric|real|double precision|money|int2|int4|int8|float4|float8)/i
const DATE_TYPE = /^(date|timestamp|timestamp with time zone|timestamp without time zone|time|timestamptz|timetz)/i

function stableValue(value: unknown) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function sensitivityForColumn(column: SchemaProfileColumnInput, values: unknown[]) {
  const text = `${column.columnName} ${column.comment ?? ''}`
  if (SECRET_NAME.test(text)) return { sensitivity: 'secret' as const, reasons: ['secret-like column name or comment'] }
  if (PERSONAL_NAME.test(text)) return { sensitivity: 'personal' as const, reasons: ['personal-data column name or comment'] }
  if (IDENTIFIER_NAME.test(text) || column.isPrimaryKey) return { sensitivity: 'identifier' as const, reasons: ['identifier or key column'] }

  const strings = values.map(stableValue).filter((value): value is string => Boolean(value)).slice(0, 25)
  if (strings.some(value => EMAIL_VALUE.test(value))) return { sensitivity: 'personal' as const, reasons: ['email-shaped sampled value'] }
  if (strings.some(value => PHONE_VALUE.test(value))) return { sensitivity: 'personal' as const, reasons: ['phone-shaped sampled value'] }
  return { sensitivity: 'none' as const, reasons: [] }
}

function semanticTypeForColumn(column: SchemaProfileColumnInput, values: unknown[], sensitivity: SchemaSensitivity): SchemaSemanticType {
  if (sensitivity === 'identifier') return 'identifier'
  if (/email/i.test(column.columnName)) return 'email'
  if (/phone|mobile/i.test(column.columnName)) return 'phone'
  if (/bool/i.test(column.dataType) || column.udtName === 'bool') return 'boolean'
  if (NUMERIC_TYPE.test(column.dataType) || NUMERIC_TYPE.test(column.udtName)) return 'numeric'
  if (DATE_TYPE.test(column.dataType) || DATE_TYPE.test(column.udtName)) return 'date_time'
  const present = values.filter(value => value !== null && value !== undefined)
  const distinct = new Set(present.map(stableValue))
  if (present.length > 0 && distinct.size <= Math.min(30, Math.max(2, Math.ceil(present.length * 0.2)))) return 'category'
  return 'text'
}

export function maskSchemaSampleValue(value: unknown, sensitivity: SchemaSensitivity) {
  const text = stableValue(value)
  if (!text) return null
  if (sensitivity === 'secret') return '[REDACTED]'
  if (EMAIL_VALUE.test(text)) {
    const [local, domain] = text.split('@')
    return `${local.slice(0, 1)}***@${domain}`
  }
  if (PHONE_VALUE.test(text)) {
    const digits = text.replace(/\D/g, '')
    return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`
  }
  if (sensitivity === 'personal') return `${text.slice(0, 1)}***`
  if (sensitivity === 'identifier') return text.length <= 4 ? '****' : `${text.slice(0, 2)}***${text.slice(-2)}`
  return text.slice(0, 80)
}

function comparableValue(value: unknown, semanticType: SchemaSemanticType) {
  if (value === null || value === undefined) return null
  if (semanticType === 'numeric') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  if (semanticType === 'date_time') {
    const timestamp = new Date(String(value)).getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  }
  return null
}

export function buildSchemaColumnProfile(column: SchemaProfileColumnInput, rows: Array<Record<string, unknown>>): SchemaColumnProfile {
  const values = rows.map(row => row[column.columnName])
  const present = values.filter(value => value !== null && value !== undefined)
  const sensitivity = sensitivityForColumn(column, present)
  const semanticType = semanticTypeForColumn(column, present, sensitivity.sensitivity)
  const distinctValues = Array.from(new Map(present.map(value => [stableValue(value), value])).values())
  const comparable = present
    .map(value => comparableValue(value, semanticType))
    .filter((value): value is number => value !== null)
  const allowRange = sensitivity.sensitivity === 'none' && (semanticType === 'numeric' || semanticType === 'date_time')
  const minimumValue = allowRange && comparable.length > 0 ? Math.min(...comparable) : null
  const maximumValue = allowRange && comparable.length > 0 ? Math.max(...comparable) : null
  const formatRange = (value: number | null) => {
    if (value === null) return null
    return semanticType === 'date_time' ? new Date(value).toISOString() : String(value)
  }

  return {
    schemaName: column.schemaName,
    tableName: column.tableName,
    columnName: column.columnName,
    semanticType,
    sensitivity: sensitivity.sensitivity,
    sensitivityReasons: sensitivity.reasons,
    sampleRowCount: rows.length,
    nullPercent: rows.length === 0 ? 0 : Math.round(((rows.length - present.length) / rows.length) * 10_000) / 100,
    approximateDistinctCount: distinctValues.length,
    distinctRatio: present.length === 0 ? 0 : Math.round((distinctValues.length / present.length) * 10_000) / 100,
    minimum: formatRange(minimumValue),
    maximum: formatRange(maximumValue),
    maskedExamples: distinctValues.slice(0, 3)
      .map(value => maskSchemaSampleValue(value, sensitivity.sensitivity))
      .filter((value): value is string => Boolean(value)),
  }
}

function columnKey(input: { schemaName: string; tableName: string; columnName: string }) {
  return `${input.schemaName}.${input.tableName}.${input.columnName}`
}

function compatibleTypes(left: SchemaProfileColumnInput, right: SchemaProfileColumnInput) {
  return left.udtName === right.udtName || left.dataType === right.dataType
}

export function inferSchemaJoinCandidates(
  tables: SchemaProfileTableInput[],
  columnProfiles: SchemaColumnProfile[],
  foreignKeys: SchemaForeignKeyEvidence[],
  sampledRows: Map<string, Array<Record<string, unknown>>> = new Map(),
): SchemaJoinCandidate[] {
  const columns = tables.flatMap(table => table.columns)
  const profileByColumn = new Map(columnProfiles.map(profile => [columnKey(profile), profile]))
  const candidates = new Map<string, SchemaJoinCandidate>()

  for (const foreignKey of foreignKeys) {
    const sourceProfile = profileByColumn.get(columnKey({
      schemaName: foreignKey.sourceSchema,
      tableName: foreignKey.sourceTable,
      columnName: foreignKey.sourceColumn,
    }))
    const targetProfile = profileByColumn.get(columnKey({
      schemaName: foreignKey.targetSchema,
      tableName: foreignKey.targetTable,
      columnName: foreignKey.targetColumn,
    }))
    const relationship = sourceProfile?.distinctRatio === 100 && targetProfile?.distinctRatio === 100
      ? 'one_to_one'
      : 'many_to_one'
    const key = `${foreignKey.sourceSchema}.${foreignKey.sourceTable}.${foreignKey.sourceColumn}->${foreignKey.targetSchema}.${foreignKey.targetTable}.${foreignKey.targetColumn}`
    candidates.set(key, {
      sourceSchema: foreignKey.sourceSchema,
      sourceTable: foreignKey.sourceTable,
      sourceColumn: foreignKey.sourceColumn,
      targetSchema: foreignKey.targetSchema,
      targetTable: foreignKey.targetTable,
      targetColumn: foreignKey.targetColumn,
      relationship,
      evidence: 'foreign_key',
      confidence: 100,
      reasons: [`Declared foreign key ${foreignKey.constraintName}`],
    })
  }

  const primaryColumns = columns.filter(column => column.isPrimaryKey || column.isUnique)
  for (const source of columns) {
    if (!/_id$/i.test(source.columnName) && !source.isPrimaryKey) continue
    for (const target of primaryColumns) {
      if (source.schemaName === target.schemaName && source.tableName === target.tableName) continue
      if (!compatibleTypes(source, target)) continue
      const sourceToken = source.columnName.replace(/_id$/i, '').toLowerCase()
      const tableToken = target.tableName.replace(/s$/i, '').toLowerCase()
      const targetToken = target.columnName.replace(/_id$/i, '').toLowerCase()
      if (source.columnName.toLowerCase() !== target.columnName.toLowerCase() && sourceToken !== tableToken && sourceToken !== targetToken) continue
      const key = `${source.schemaName}.${source.tableName}.${source.columnName}->${target.schemaName}.${target.tableName}.${target.columnName}`
      if (candidates.has(key)) continue
      const targetProfile = profileByColumn.get(columnKey(target))
      const targetUnique = Boolean(target.isPrimaryKey || target.isUnique || targetProfile?.distinctRatio === 100)
      const sourceValues = new Set(
        (sampledRows.get(`${source.schemaName}.${source.tableName}`) ?? [])
          .map(row => stableValue(row[source.columnName]))
          .filter((value): value is string => Boolean(value)),
      )
      const targetValues = new Set(
        (sampledRows.get(`${target.schemaName}.${target.tableName}`) ?? [])
          .map(row => stableValue(row[target.columnName]))
          .filter((value): value is string => Boolean(value)),
      )
      const overlapBase = Math.min(sourceValues.size, targetValues.size)
      const overlapCount = Array.from(sourceValues).filter(value => targetValues.has(value)).length
      const overlapPercent = overlapBase === 0 ? 0 : Math.round((overlapCount / overlapBase) * 100)
      const overlapBoost = overlapPercent >= 80 ? 12 : overlapPercent >= 50 ? 7 : 0
      candidates.set(key, {
        sourceSchema: source.schemaName,
        sourceTable: source.tableName,
        sourceColumn: source.columnName,
        targetSchema: target.schemaName,
        targetTable: target.tableName,
        targetColumn: target.columnName,
        relationship: targetUnique ? 'many_to_one' : 'unknown',
        evidence: 'name_and_type',
        confidence: Math.min(95, (targetUnique ? 78 : 62) + overlapBoost),
        reasons: [
          'Compatible data types',
          'Identifier name matches a key column or table name',
          targetUnique ? 'Target appears unique' : 'Target uniqueness is unconfirmed',
          ...(overlapBase > 0 ? [`${overlapPercent}% sampled key overlap`] : []),
        ],
      })
    }
  }

  return Array.from(candidates.values()).sort((left, right) => right.confidence - left.confidence)
}

export function buildSchemaIntelligenceProfile(input: {
  selectedSchemas: string[]
  tables: SchemaProfileTableInput[]
  foreignKeys: SchemaForeignKeyEvidence[]
  sampledRows: Map<string, Array<Record<string, unknown>>>
  warnings?: string[]
  generatedAt?: string
}): SchemaIntelligenceProfile {
  const columnProfiles = input.tables.flatMap(table => {
    const rows = input.sampledRows.get(`${table.schemaName}.${table.tableName}`) ?? []
    return table.columns.map(column => buildSchemaColumnProfile(column, rows))
  })
  const tableProfiles = input.tables.map(table => {
    const rows = input.sampledRows.get(`${table.schemaName}.${table.tableName}`) ?? []
    return {
      schemaName: table.schemaName,
      tableName: table.tableName,
      tableType: table.tableType,
      comment: table.comment ?? null,
      estimatedRowCount: table.estimatedRowCount ?? null,
      sampledRowCount: rows.length,
      profiledColumnCount: table.columns.length,
      totalColumnCount: table.totalColumnCount ?? table.columns.length,
    }
  })
  const joinCandidates = inferSchemaJoinCandidates(input.tables, columnProfiles, input.foreignKeys, input.sampledRows)
  const warnings = input.warnings ?? []
  return {
    version: SCHEMA_PROFILE_VERSION,
    selectedSchemas: input.selectedSchemas,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    tableProfiles,
    columnProfiles,
    joinCandidates,
    warnings,
    summary: {
      tableCount: input.tables.length,
      columnCount: input.tables.reduce((total, table) => total + table.columns.length, 0),
      profiledColumnCount: columnProfiles.filter(profile => profile.sampleRowCount > 0).length,
      sensitiveColumnCount: columnProfiles.filter(profile => profile.sensitivity !== 'none').length,
      explicitJoinCount: joinCandidates.filter(candidate => candidate.evidence === 'foreign_key').length,
      inferredJoinCount: joinCandidates.filter(candidate => candidate.evidence === 'name_and_type').length,
      warningCount: warnings.length,
    },
  }
}
