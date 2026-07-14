import type { BusinessMetricAggregation } from '@/types/semantic-model'
import type { DashboardChartFilter, DashboardChartFilterOperator } from '@/types/dashboard-chart'
import type { CompiledDatasetQueryPlan } from '@/types/semantic-dataset'

const MAX_ROW_LIMIT = 500
const DEFAULT_TIMEOUT_MS = 12_000

type SourceColumn = {
  dataSourceId?: string
  schemaName?: string
  tableName?: string
  columnName?: string
  dataType?: string
}

type FieldRow = Record<string, unknown>
type MetricRow = Record<string, unknown>
type RelationshipRow = Record<string, unknown>

interface SelectTable {
  dataSourceId: string
  schemaName: string
  tableName: string
}

interface CompiledSelect {
  id: string
  label: string
  expression: Record<string, unknown>
  role: 'field' | 'metric'
}

export interface DatasetQueryCompileResult {
  queryPlan: CompiledDatasetQueryPlan
  warnings: string[]
  dataSourceId?: string
  parameters: unknown[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asSourceColumn(value: unknown): SourceColumn | null {
  const record = asRecord(value)
  const tableName = typeof record.tableName === 'string' ? record.tableName.trim() : ''
  const columnName = typeof record.columnName === 'string' ? record.columnName.trim() : ''
  if (!tableName || !columnName) return null
  return {
    dataSourceId: typeof record.dataSourceId === 'string' ? record.dataSourceId : undefined,
    schemaName: typeof record.schemaName === 'string' && record.schemaName.trim() ? record.schemaName : 'public',
    tableName,
    columnName,
    dataType: typeof record.dataType === 'string' ? record.dataType : undefined,
  }
}

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function tableKey(source: SelectTable) {
  return `${source.dataSourceId}:${source.schemaName}.${source.tableName}`
}

function columnSql(source: SourceColumn, alias: string) {
  if (!source.columnName) throw new Error('Missing source column')
  return `${quoteIdent(alias)}.${quoteIdent(source.columnName)}`
}

function outputAlias(value: string, fallback: string) {
  const trimmed = value.trim()
  return quoteIdent(trimmed || fallback)
}

function tableFromSource(source: SourceColumn): SelectTable | null {
  if (!source.dataSourceId || !source.tableName || !source.columnName) return null
  return {
    dataSourceId: source.dataSourceId,
    schemaName: source.schemaName || 'public',
    tableName: source.tableName,
  }
}

function getFieldSource(field: FieldRow) {
  return asSourceColumn(field.source_column)
}

function getMetricFieldId(metric: MetricRow) {
  const expression = asRecord(metric.expression)
  return typeof expression.fieldId === 'string' ? expression.fieldId : null
}

function isScalarFilterValue(value: unknown): value is string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof value)
}

function isFilterOperator(value: unknown): value is DashboardChartFilterOperator {
  return value === 'eq'
    || value === 'not_eq'
    || value === 'in'
    || value === 'contains'
    || value === 'gte'
    || value === 'lte'
}

function addParameter(parameters: unknown[], value: unknown) {
  parameters.push(value)
  return `$${parameters.length}`
}

function compileFilterCondition({
  filter,
  fieldById,
  tableAliases,
  referencedTables,
  parameters,
  warnings,
}: {
  filter: DashboardChartFilter
  fieldById: Map<string, FieldRow>
  tableAliases: Map<string, string>
  referencedTables: Map<string, SelectTable>
  parameters: unknown[]
  warnings: string[]
}) {
  if (!isFilterOperator(filter.operator)) {
    warnings.push(`Filter on field "${filter.fieldId}" uses an unsupported operator.`)
    return null
  }

  const field = fieldById.get(filter.fieldId)
  const source = field ? getFieldSource(field) : null
  const table = source ? tableFromSource(source) : null
  if (!field || !source || !table) {
    warnings.push(`Filter field "${filter.fieldId}" is not executable.`)
    return null
  }

  const alias = addTable(tableAliases, table)
  referencedTables.set(tableKey(table), table)
  const column = columnSql(source, alias)

  if (filter.operator === 'in') {
    const values = Array.isArray(filter.value) ? filter.value.filter(isScalarFilterValue) : []
    if (values.length === 0) {
      warnings.push(`Filter field "${filter.fieldId}" requires at least one scalar value.`)
      return null
    }
    const placeholders = values.map(value => addParameter(parameters, value))
    return {
      sql: `${column} in (${placeholders.join(', ')})`,
      descriptor: {
        fieldId: filter.fieldId,
        operator: filter.operator,
        parameterIndexes: placeholders.map(placeholder => Number(placeholder.slice(1))),
      },
    }
  }

  if (!isScalarFilterValue(filter.value)) {
    warnings.push(`Filter field "${filter.fieldId}" requires a scalar value.`)
    return null
  }

  if ((filter.operator === 'gte' || filter.operator === 'lte') && typeof filter.value === 'boolean') {
    warnings.push(`Filter field "${filter.fieldId}" cannot use a boolean comparison value.`)
    return null
  }

  if (filter.operator === 'contains') {
    const placeholder = addParameter(parameters, String(filter.value))
    return {
      sql: `${column}::text ilike '%' || ${placeholder}::text || '%'`,
      descriptor: {
        fieldId: filter.fieldId,
        operator: filter.operator,
        parameterIndexes: [Number(placeholder.slice(1))],
      },
    }
  }

  const placeholder = addParameter(parameters, filter.value)
  const operatorSql = filter.operator === 'eq'
    ? '='
    : filter.operator === 'not_eq'
      ? '<>'
      : filter.operator === 'gte'
        ? '>='
        : '<='

  return {
    sql: `${column} ${operatorSql} ${placeholder}`,
    descriptor: {
      fieldId: filter.fieldId,
      operator: filter.operator,
      parameterIndexes: [Number(placeholder.slice(1))],
    },
  }
}

function aggregationSql(
  aggregation: BusinessMetricAggregation,
  sourceSql: string,
  warnings: string[],
) {
  if (aggregation === 'count') return `count(${sourceSql})`
  if (aggregation === 'count_distinct') return `count(distinct ${sourceSql})`
  if (aggregation === 'avg') return `avg(${sourceSql})`
  if (aggregation === 'min') return `min(${sourceSql})`
  if (aggregation === 'max') return `max(${sourceSql})`
  if (aggregation === 'sum') return `sum(${sourceSql})`

  warnings.push(`Metric aggregation "${aggregation}" is not executable yet.`)
  return null
}

function addTable(
  tableAliases: Map<string, string>,
  source: SelectTable,
) {
  const key = tableKey(source)
  const existing = tableAliases.get(key)
  if (existing) return existing
  const alias = `t${tableAliases.size + 1}`
  tableAliases.set(key, alias)
  return alias
}

function compileRelationshipJoin(
  relationship: RelationshipRow,
  fieldById: Map<string, FieldRow>,
  tableAliases: Map<string, string>,
  joinedTableKeys: Set<string>,
  warnings: string[],
) {
  const joinConfig = asRecord(relationship.join_config)
  const leftFieldId = typeof joinConfig.leftFieldId === 'string' ? joinConfig.leftFieldId : null
  const rightFieldId = typeof joinConfig.rightFieldId === 'string' ? joinConfig.rightFieldId : null
  if (!leftFieldId || !rightFieldId) {
    warnings.push(`Relationship ${relationship.id ?? ''} is missing join fields.`)
    return null
  }

  const leftSource = getFieldSource(fieldById.get(leftFieldId) ?? {})
  const rightSource = getFieldSource(fieldById.get(rightFieldId) ?? {})
  const leftTable = leftSource ? tableFromSource(leftSource) : null
  const rightTable = rightSource ? tableFromSource(rightSource) : null
  if (!leftSource || !rightSource || !leftTable || !rightTable) {
    warnings.push(`Relationship ${relationship.id ?? ''} references unmapped fields.`)
    return null
  }

  const leftKey = tableKey(leftTable)
  const rightKey = tableKey(rightTable)
  if (leftKey === rightKey) return null

  const leftAlias = addTable(tableAliases, leftTable)
  const rightAlias = addTable(tableAliases, rightTable)
  const leftJoined = joinedTableKeys.has(leftKey)
  const rightJoined = joinedTableKeys.has(rightKey)

  if (leftJoined && rightJoined) return null
  if (!leftJoined && !rightJoined) return null

  const joinTable = leftJoined ? rightTable : leftTable
  const joinAlias = leftJoined ? rightAlias : leftAlias
  const joinKey = tableKey(joinTable)
  const onSql = `${columnSql(leftSource, leftAlias)} = ${columnSql(rightSource, rightAlias)}`
  joinedTableKeys.add(joinKey)

  return `left join ${quoteIdent(joinTable.schemaName)}.${quoteIdent(joinTable.tableName)} ${quoteIdent(joinAlias)} on ${onSql}`
}

export function compileDatasetQueryPlan({
  fields,
  metrics,
  relationships,
  metricSourceFields,
  filters = [],
}: {
  fields: FieldRow[]
  metrics: MetricRow[]
  relationships: RelationshipRow[]
  metricSourceFields?: FieldRow[]
  filters?: DashboardChartFilter[]
}): DatasetQueryCompileResult {
  const warnings: string[] = []
  const allFields = [...fields, ...(metricSourceFields ?? [])]
  const fieldById = new Map(allFields.map(field => [String(field.id), field]))
  const tableAliases = new Map<string, string>()
  const parameters: unknown[] = []

  const selectedFields: CompiledSelect[] = fields.map(row => ({
    id: String(row.id),
    label: String(row.name ?? ''),
    expression: {
      type: 'source_column',
      sourceColumn: row.source_column ?? null,
    },
    role: 'field' as const,
  }))
  const selectedMetrics: CompiledSelect[] = metrics.map(row => ({
    id: String(row.id),
    label: String(row.name ?? ''),
    expression: {
      type: 'aggregation',
      aggregation: row.aggregation,
      metricExpression: row.expression ?? {},
    },
    role: 'metric' as const,
  }))

  const selectSql: string[] = []
  const groupBySql: string[] = []
  const referencedTables = new Map<string, SelectTable>()
  const filterSql: string[] = []
  const compiledFilters: Array<{ fieldId: string; operator: DashboardChartFilterOperator; parameterIndexes: number[] }> = []
  let filtersExecutable = true

  for (const field of fields) {
    const source = getFieldSource(field)
    const table = source ? tableFromSource(source) : null
    if (!source || !table) {
      warnings.push(`Field "${String(field.name ?? field.id)}" is missing a source column.`)
      continue
    }
    const alias = addTable(tableAliases, table)
    referencedTables.set(tableKey(table), table)
    const expression = columnSql(source, alias)
    selectSql.push(`${expression} as ${outputAlias(String(field.name ?? ''), String(field.id))}`)
    groupBySql.push(expression)
  }

  for (const metric of metrics) {
    const sourceFieldId = getMetricFieldId(metric)
    const sourceField = sourceFieldId ? fieldById.get(sourceFieldId) : null
    const source = sourceField ? getFieldSource(sourceField) : null
    const table = source ? tableFromSource(source) : null
    if (!sourceFieldId || !source || !table) {
      warnings.push(`Metric "${String(metric.name ?? metric.id)}" is missing an executable source field.`)
      continue
    }
    const alias = addTable(tableAliases, table)
    referencedTables.set(tableKey(table), table)
    const aggregation = String(metric.aggregation ?? 'sum') as BusinessMetricAggregation
    const expression = aggregationSql(aggregation, columnSql(source, alias), warnings)
    if (!expression) continue
    selectSql.push(`${expression} as ${outputAlias(String(metric.name ?? ''), String(metric.id))}`)
  }

  if (filters.length > 4) {
    warnings.push('Chart filters are limited to four predicates for runtime execution.')
    filtersExecutable = false
  }

  for (const filter of filters) {
    const compiled = compileFilterCondition({
      filter,
      fieldById,
      tableAliases,
      referencedTables,
      parameters,
      warnings,
    })
    if (!compiled) {
      filtersExecutable = false
      continue
    }
    filterSql.push(compiled.sql)
    compiledFilters.push(compiled.descriptor)
  }

  const tables = Array.from(referencedTables.values())
  const dataSourceIds = new Set(tables.map(table => table.dataSourceId))
  if (dataSourceIds.size > 1) {
    warnings.push('Cross-data-source datasets are not executable yet.')
  }

  const baseTable = tables[0]
  let executableSql: string | null = null

  if (!baseTable) {
    warnings.push('Dataset has no executable source tables.')
  } else if (dataSourceIds.size === 1 && selectSql.length > 0 && filtersExecutable) {
    const baseAlias = addTable(tableAliases, baseTable)
    const joinedTableKeys = new Set([tableKey(baseTable)])
    const joins: string[] = []

    for (let index = 0; index < relationships.length; index += 1) {
      const beforeSize = joinedTableKeys.size
      for (const relationship of relationships) {
        const join = compileRelationshipJoin(relationship, fieldById, tableAliases, joinedTableKeys, warnings)
        if (join && !joins.includes(join)) joins.push(join)
      }
      if (joinedTableKeys.size === beforeSize) break
    }

    const unresolvedTables = Array.from(referencedTables.keys()).filter(key => !joinedTableKeys.has(key))
    if (unresolvedTables.length > 0) {
      warnings.push('Dataset references multiple tables without enough selected relationships to join them.')
    } else {
      const where = filterSql.length > 0 ? `\nwhere ${filterSql.join('\n  and ')}` : ''
      const groupBy = groupBySql.length > 0 ? `\ngroup by ${groupBySql.join(', ')}` : ''
      executableSql = [
        `select ${selectSql.join(', ')}`,
        `from ${quoteIdent(baseTable.schemaName)}.${quoteIdent(baseTable.tableName)} ${quoteIdent(baseAlias)}`,
        joins.join('\n'),
        where,
        groupBy,
        `limit ${MAX_ROW_LIMIT}`,
      ].filter(Boolean).join('\n')
    }
  }

  return {
    dataSourceId: dataSourceIds.size === 1 ? Array.from(dataSourceIds)[0] : undefined,
    warnings,
    queryPlan: {
      dialect: 'postgres',
      select: [...selectedFields, ...selectedMetrics],
      joins: relationships.map(row => {
        const joinConfig = asRecord(row.join_config)
        return {
          id: String(row.id),
          type: String(row.type ?? 'many_to_one'),
          leftFieldId: typeof joinConfig.leftFieldId === 'string' ? joinConfig.leftFieldId : undefined,
          rightFieldId: typeof joinConfig.rightFieldId === 'string' ? joinConfig.rightFieldId : undefined,
          operator: '=' as const,
        }
      }),
      groupByFieldIds: fields.map(row => String(row.id)),
      filters: compiledFilters,
      limits: {
        rowLimit: MAX_ROW_LIMIT,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      executableSql,
      warnings,
    },
    parameters,
  }
}
