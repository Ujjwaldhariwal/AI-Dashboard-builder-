import type { DashboardFilter } from '@/types/filter'

function toNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toEpoch(value: unknown): number | null {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string') return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

function normalize(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function compareValues(
  rowValue: unknown,
  operator: DashboardFilter['operator'],
  filterValue: string,
): boolean {
  const raw = normalize(rowValue)
  const test = normalize(filterValue)

  if (!test) return true

  switch (operator) {
    case 'contains':
      return raw.toLowerCase().includes(test.toLowerCase())
    case 'equals':
      return raw.toLowerCase() === test.toLowerCase()
    case 'not-equals':
      return raw.toLowerCase() !== test.toLowerCase()
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const numA = toNumber(rowValue)
      const numB = toNumber(filterValue)

      if (numA !== null && numB !== null) {
        if (operator === 'gt') return numA > numB
        if (operator === 'gte') return numA >= numB
        if (operator === 'lt') return numA < numB
        return numA <= numB
      }

      const dateA = toEpoch(rowValue)
      const dateB = toEpoch(filterValue)
      if (dateA !== null && dateB !== null) {
        if (operator === 'gt') return dateA > dateB
        if (operator === 'gte') return dateA >= dateB
        if (operator === 'lt') return dateA < dateB
        return dateA <= dateB
      }

      return false
    }
    default:
      return true
  }
}

export function applyDashboardFilters(
  rows: Record<string, unknown>[],
  filters: DashboardFilter[],
): Record<string, unknown>[] {
  const active = filters.filter(
    f => f.active && f.field.trim() && f.value.trim(),
  )

  if (!active.length) return rows

  return rows.filter(row =>
    active.every(filter =>
      compareValues(row[filter.field], filter.operator, filter.value),
    ),
  )
}

