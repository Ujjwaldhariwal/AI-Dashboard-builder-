import type { TransformFilterOperator, TransformOp } from '@/types/widget'

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
    default:
      return rows
  }
}

export function applyTransforms(rows: DataRow[], ops: TransformOp[]): DataRow[] {
  if (!rows.length || !ops.length) return rows
  return ops.reduce<DataRow[]>((currentRows, op) => applyTransformOp(currentRows, op), rows)
}
