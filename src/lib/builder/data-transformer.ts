//src/lib/builder/data-transformer.ts
import type {
  TransformDateFormat,
  TransformFilterOperator,
  TransformOp,
} from '@/types/widget'

type DataRow = Record<string, unknown>

const hasOwn = (row: DataRow, key: string) =>
  Object.prototype.hasOwnProperty.call(row, key)

const sanitizeNumericString = (value: unknown) =>
  String(value).replace(/[^0-9.\-]/g, '')

const parseSanitizedNumber = (value: unknown): number | null => {
  const parsed = parseFloat(sanitizeNumericString(value))
  return Number.isNaN(parsed) ? null : parsed
}

const parseComparableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const roundTo2 = (value: number) => Math.round(value * 100) / 100

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fromNumber = new Date(value)
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const fromString = new Date(value)
    return Number.isNaN(fromString.getTime()) ? null : fromString
  }
  return null
}

const formatDateValue = (date: Date, format: TransformDateFormat): string => {
  switch (format) {
    case 'iso-date':
      return date.toISOString().slice(0, 10)
    case 'iso-datetime':
      return date.toISOString()
    case 'locale-date':
      return date.toLocaleDateString('en-IN')
    case 'locale-datetime':
      return date.toLocaleString('en-IN')
    case 'month-day':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    case 'month-short':
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    case 'year-month': {
      const month = String(date.getUTCMonth() + 1).padStart(2, '0')
      return `${date.getUTCFullYear()}-${month}`
    }
    default:
      return date.toISOString()
  }
}

const compareFilterValues = (
  left: unknown,
  right: unknown,
  operator: TransformFilterOperator,
) => {
  const leftNum = parseComparableNumber(left)
  const rightNum = parseComparableNumber(right)
  const isNumericCompare = leftNum !== null && rightNum !== null

  if (isNumericCompare) {
    switch (operator) {
      case '>':
        return leftNum > rightNum
      case '<':
        return leftNum < rightNum
      case '=':
        return leftNum == rightNum
      case '!=':
        return leftNum != rightNum
      case '>=':
        return leftNum >= rightNum
      case '<=':
        return leftNum <= rightNum
      default:
        return false
    }
  }

  const leftStr = left == null ? '' : String(left)
  const rightStr = right == null ? '' : String(right)
  switch (operator) {
    case '>':
      return leftStr > rightStr
    case '<':
      return leftStr < rightStr
    case '=':
      return leftStr === rightStr
    case '!=':
      return leftStr !== rightStr
    case '>=':
      return leftStr >= rightStr
    case '<=':
      return leftStr <= rightStr
    default:
      return false
  }
}

const applyParseNumber = (rows: DataRow[], op: Extract<TransformOp, { type: 'parse_number' }>) =>
  rows.map(row => {
    if (!hasOwn(row, op.field)) return row
    const parsed = parseFloat(sanitizeNumericString(row[op.field]))
    if (Number.isNaN(parsed)) return row
    return { ...row, [op.field]: parsed }
  })

const applyConcat = (rows: DataRow[], op: Extract<TransformOp, { type: 'concat' }>) =>
  rows.map(row => {
    const values = op.fields
      .filter(field => hasOwn(row, field))
      .map(field => row[field])
      .filter(value => value !== null && value !== undefined && String(value).trim().length > 0)
      .map(value => String(value))

    return {
      ...row,
      [op.outputField]: values.length ? values.join(op.separator) : '',
    }
  })

const applyRename = (rows: DataRow[], op: Extract<TransformOp, { type: 'rename' }>) =>
  rows.map(row => {
    if (!hasOwn(row, op.from)) return row
    const next: DataRow = { ...row, [op.to]: row[op.from] }
    if (op.to !== op.from) {
      delete next[op.from]
    }
    return next
  })

const applyMath = (rows: DataRow[], op: Extract<TransformOp, { type: 'math' }>) =>
  rows.map(row => {
    if (!hasOwn(row, op.field)) return row
    const left = parseSanitizedNumber(row[op.field])
    if (left === null) return row

    const right = Number(op.value)
    if (!Number.isFinite(right)) return row

    let result = 0
    switch (op.operator) {
      case '+':
        result = left + right
        break
      case '-':
        result = left - right
        break
      case '*':
        result = left * right
        break
      case '/':
        result = right === 0 ? 0 : left / right
        break
    }

    return { ...row, [op.outputField]: Number.isFinite(result) ? result : 0 }
  })

const applyPercentOfTotal = (
  rows: DataRow[],
  op: Extract<TransformOp, { type: 'percent_of_total' }>,
) => {
  const numericValues = rows.map(row => parseSanitizedNumber(row[op.field]) ?? 0)
  const total = numericValues.reduce((sum, value) => sum + value, 0)

  return rows.map((row, index) => ({
    ...row,
    [op.outputField]: total === 0 ? 0 : roundTo2((numericValues[index] / total) * 100),
  }))
}

const applyFilterRows = (rows: DataRow[], op: Extract<TransformOp, { type: 'filter_rows' }>) =>
  rows.filter(row => compareFilterValues(row[op.field], op.value, op.operator))

const applySort = (rows: DataRow[], op: Extract<TransformOp, { type: 'sort' }>) => {
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aValue = a.row[op.field]
      const bValue = b.row[op.field]
      const aNum = parseComparableNumber(aValue)
      const bNum = parseComparableNumber(bValue)

      let compare = 0
      if (aNum !== null && bNum !== null) {
        compare = aNum - bNum
      } else {
        const aStr = aValue == null ? '' : String(aValue)
        const bStr = bValue == null ? '' : String(bValue)
        compare = aStr.localeCompare(bStr)
      }

      if (compare !== 0) {
        return op.order === 'asc' ? compare : -compare
      }
      return a.index - b.index
    })

  return sorted.map(item => item.row)
}

const applyLimit = (rows: DataRow[], op: Extract<TransformOp, { type: 'limit' }>) => {
  const count = Math.trunc(op.count)
  if (count <= 0) return rows
  return rows.slice(0, count)
}

const applyFieldsToRows = (
  rows: DataRow[],
  op: Extract<TransformOp, { type: 'fields_to_rows' }>,
) => {
  const fields = Array.from(new Set(op.fields.map(field => field.trim()).filter(Boolean)))
  if (fields.length === 0 || !op.keyField.trim() || !op.valueField.trim()) return rows

  return rows.flatMap(row => {
    const keyLabels = asRecord(op.keyLabels) ?? {}
    const baseRow: DataRow = op.keepOtherFields
      ? Object.fromEntries(
        Object.entries(row).filter(([field]) => !fields.includes(field)),
      )
      : {}

    const mappedRows = fields.flatMap(field => {
      if (!hasOwn(row, field)) return []
      const mappedLabel = keyLabels[field]
      return [{
        ...baseRow,
        [op.keyField]: typeof mappedLabel === 'string' && mappedLabel.trim()
          ? mappedLabel.trim()
          : field,
        [op.valueField]: row[field],
      }]
    })

    return mappedRows.length > 0 ? mappedRows : [row]
  })
}

const applyGroupAggregate = (
  rows: DataRow[],
  op: Extract<TransformOp, { type: 'group_aggregate' }>,
) => {
  const groupBy = Array.from(new Set(op.groupBy.map(field => field.trim()).filter(Boolean)))
  if (groupBy.length === 0 || !op.outputField.trim()) return rows

  const grouped = new Map<string, {
    group: DataRow
    rowsCount: number
    valueCount: number
    sum: number
    min: number
    max: number
  }>()

  rows.forEach(row => {
    const key = groupBy.map(field => String(row[field] ?? '')).join('\u0001')
    const existing = grouped.get(key) ?? {
      group: Object.fromEntries(groupBy.map(field => [field, row[field] ?? null])),
      rowsCount: 0,
      valueCount: 0,
      sum: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    }

    existing.rowsCount += 1

    const parsed = parseSanitizedNumber(row[op.valueField])
    if (parsed !== null) {
      existing.valueCount += 1
      existing.sum += parsed
      existing.min = Math.min(existing.min, parsed)
      existing.max = Math.max(existing.max, parsed)
    }

    grouped.set(key, existing)
  })

  return Array.from(grouped.values()).map(group => {
    let aggregateValue = 0
    switch (op.reducer) {
      case 'sum':
        aggregateValue = group.sum
        break
      case 'avg':
        aggregateValue = group.valueCount > 0 ? roundTo2(group.sum / group.valueCount) : 0
        break
      case 'min':
        aggregateValue = group.valueCount > 0 ? group.min : 0
        break
      case 'max':
        aggregateValue = group.valueCount > 0 ? group.max : 0
        break
      case 'count':
        aggregateValue = group.rowsCount
        break
    }

    return {
      ...group.group,
      [op.outputField]: aggregateValue,
    }
  })
}

const applyMapValues = (
  rows: DataRow[],
  op: Extract<TransformOp, { type: 'map_values' }>,
) => {
  if (!op.field.trim()) return rows

  return rows.map(row => {
    if (!hasOwn(row, op.field)) return row
    const sourceValue = String(row[op.field] ?? '')
    const mappedValue = op.mappings[sourceValue]
    const nextValue = typeof mappedValue === 'string'
      ? mappedValue
      : op.defaultValue ?? sourceValue

    return {
      ...row,
      [op.field]: nextValue,
    }
  })
}

const applyDateFormat = (
  rows: DataRow[],
  op: Extract<TransformOp, { type: 'date_format' }>,
) =>
  rows.map(row => {
    if (!hasOwn(row, op.field)) return row
    const parsedDate = toDate(row[op.field])
    if (!parsedDate) return row

    return {
      ...row,
      [op.outputField]: formatDateValue(parsedDate, op.format),
    }
  })

const applyTransformOp = (rows: DataRow[], op: TransformOp): DataRow[] => {
  switch (op.type) {
    case 'parse_number':
      return applyParseNumber(rows, op)
    case 'concat':
      return applyConcat(rows, op)
    case 'rename':
      return applyRename(rows, op)
    case 'math':
      return applyMath(rows, op)
    case 'percent_of_total':
      return applyPercentOfTotal(rows, op)
    case 'filter_rows':
      return applyFilterRows(rows, op)
    case 'sort':
      return applySort(rows, op)
    case 'limit':
      return applyLimit(rows, op)
    case 'fields_to_rows':
      return applyFieldsToRows(rows, op)
    case 'group_aggregate':
      return applyGroupAggregate(rows, op)
    case 'map_values':
      return applyMapValues(rows, op)
    case 'date_format':
      return applyDateFormat(rows, op)
    default:
      return rows
  }
}

export function applyTransforms(rows: DataRow[], ops: TransformOp[]): DataRow[] {
  if (!rows.length || !ops.length) return rows
  return ops.reduce<DataRow[]>((currentRows, op) => applyTransformOp(currentRows, op), rows)
}
