// src/lib/charts/domain-order.ts
// Domain-aware ordering helpers inspired by Bosch category semantics.

const ORDER_GROUPS: string[][] = [
  [
    'less than 0.5',
    'between 0.5 and 0.7',
    'between 0.7 and 0.9',
    'greater than 0.9',
    'greated than 0.9',
  ],
  [
    'since yesterday',
    'yesterday',
    'today',
    'between 2 to 7 days',
    'between 2 and 7 days',
    '2-7 days',
    'between 7 and 15 days',
    '7-15 days',
    'between 15 and 30 days',
    '15-30 days',
    'more than 30 days',
    '>30 days',
  ],
  [
    'less than 5 days',
    '<5 days',
    '5-9 days',
    '5-10 days',
    '10-20 days',
    '20-30 days',
    '21-30 days',
    'more than 1 month',
  ],
  [
    'less than 1,000 negative',
    '1,000 to 5,000 negative',
    '5,000 to 10,000 negative',
    '10,000+ negative',
  ],
]

type NamedValue = { name: string; value: number }
type LabelComparator = (a: string, b: string) => number

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

const WEEKDAYS: Record<string, number> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 7,
  sunday: 7,
}

function normalize(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildOrderMap(group: string[]): Map<string, number> {
  const map = new Map<string, number>()
  group.forEach((label, i) => map.set(label, i))
  return map
}

function detectOrderMap(labels: string[]): Map<string, number> | null {
  const normalized = labels.map(normalize)

  for (const group of ORDER_GROUPS) {
    const orderMap = buildOrderMap(group)
    const hits = normalized.filter(label => orderMap.has(label)).length
    if (hits >= 2) return orderMap
  }

  return null
}

function parseYear(raw: string): number {
  const year = Number(raw)
  if (!Number.isFinite(year)) return year
  if (raw.length === 2) return year >= 70 ? 1900 + year : 2000 + year
  return year
}

function parseClockValue(label: string): number | null {
  const match = label.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!match) return null

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] ?? '0')
  const meridiem = (match[4] ?? '').toLowerCase()

  if (meridiem === 'pm' && hours < 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0

  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return hours * 3600 + minutes * 60 + seconds
}

function parseRangeStart(label: string): number | null {
  const normalized = normalize(label)

  if (normalized.includes('since yesterday')) return 0
  if (normalized === 'yesterday') return 0
  if (normalized === 'today') return 0

  const lessThan = normalized.match(/^(?:less than|<)\s*(\d+(?:\.\d+)?)\b/)
  if (lessThan) return Number(lessThan[1]) - 0.1

  const betweenWords = normalized.match(
    /^between\s*(\d+(?:\.\d+)?)\s*(?:to|and|-)\s*(\d+(?:\.\d+)?)/,
  )
  if (betweenWords) return Number(betweenWords[1])

  const hyphenRange = normalized.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/)
  if (hyphenRange) return Number(hyphenRange[1])

  const moreThan = normalized.match(/^(?:more than|>)\s*(\d+(?:\.\d+)?)\b/)
  if (moreThan) return Number(moreThan[1]) + 0.1

  return null
}

function parseTemporalValue(label: string): number | null {
  const normalized = normalize(label)
  if (!normalized) return null

  const rangeStart = parseRangeStart(normalized)
  if (rangeStart !== null) return rangeStart

  const weekday = WEEKDAYS[normalized]
  if (weekday !== undefined) return weekday

  const clockValue = parseClockValue(normalized)
  if (clockValue !== null) return clockValue

  const quarter = normalized.match(/^q([1-4])\s*(\d{2,4})$/)
  if (quarter) {
    const q = Number(quarter[1])
    const year = parseYear(quarter[2])
    return Date.UTC(year, (q - 1) * 3, 1)
  }

  const monthYear = normalized.match(
    /^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)[\s\-/]+(\d{2,4})$/,
  )
  if (monthYear) {
    const month = MONTHS[monthYear[1]]
    const year = parseYear(monthYear[2])
    return Date.UTC(year, month, 1)
  }

  const yearMonth = normalized.match(/^(\d{4})[\-/](\d{1,2})(?:[\-/](\d{1,2}))?$/)
  if (yearMonth) {
    const year = Number(yearMonth[1])
    const month = Number(yearMonth[2]) - 1
    const day = Number(yearMonth[3] ?? '1')
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return Date.UTC(year, month, day)
    }
  }

  const dayMonthYear = normalized.match(/^(\d{1,2})[\-/](\d{1,2})[\-/](\d{2,4})$/)
  if (dayMonthYear) {
    const day = Number(dayMonthYear[1])
    const month = Number(dayMonthYear[2]) - 1
    const year = parseYear(dayMonthYear[3])
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return Date.UTC(year, month, day)
    }
  }

  const timestamp = Date.parse(label)
  if (!Number.isNaN(timestamp)) return timestamp

  return null
}

function parseNumericValue(label: string): number | null {
  const normalized = normalize(label).replace(/,/g, '')
  if (!normalized) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function detectLabelComparator(labels: string[]): LabelComparator | null {
  if (!labels.length) return null

  const orderMap = detectOrderMap(labels)
  if (orderMap) {
    return (a, b) => {
      const ai = orderMap.get(normalize(a)) ?? Number.MAX_SAFE_INTEGER
      const bi = orderMap.get(normalize(b)) ?? Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi
      return a.localeCompare(b, undefined, { numeric: true })
    }
  }

  const temporalValues = labels.map(parseTemporalValue)
  const temporalHits = temporalValues.filter(value => value !== null).length
  const temporalThreshold = Math.max(2, Math.ceil(labels.length * 0.6))
  if (temporalHits >= temporalThreshold) {
    return (a, b) => {
      const ai = parseTemporalValue(a)
      const bi = parseTemporalValue(b)
      if (ai !== null && bi !== null && ai !== bi) return ai - bi
      if (ai !== null && bi === null) return -1
      if (ai === null && bi !== null) return 1
      return a.localeCompare(b, undefined, { numeric: true })
    }
  }

  const numericValues = labels.map(parseNumericValue)
  const numericHits = numericValues.filter(value => value !== null).length
  const numericThreshold = Math.max(2, Math.ceil(labels.length * 0.7))
  if (numericHits >= numericThreshold) {
    return (a, b) => {
      const ai = parseNumericValue(a)
      const bi = parseNumericValue(b)
      if (ai !== null && bi !== null && ai !== bi) return ai - bi
      if (ai !== null && bi === null) return -1
      if (ai === null && bi !== null) return 1
      return a.localeCompare(b, undefined, { numeric: true })
    }
  }

  return null
}

export function sortNamedValues(values: NamedValue[]): NamedValue[] {
  if (!values.length) return values

  const comparator = detectLabelComparator(values.map(v => v.name))
  if (!comparator) return values

  return [...values].sort((a, b) => {
    return comparator(a.name, b.name)
  })
}

export function sortLabels(labels: string[]): string[] {
  if (!labels.length) return labels

  const comparator = detectLabelComparator(labels)
  if (!comparator) return labels

  return [...labels].sort((a, b) => {
    return comparator(a, b)
  })
}

export function sortRowsByField<T extends Record<string, unknown>>(
  rows: T[],
  field: string,
): T[] {
  if (!rows.length || !field) return rows

  const comparator = detectLabelComparator(
    rows.map(row => String(row[field] ?? '')),
  )
  if (!comparator) return rows

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = String(a.row[field] ?? '')
      const right = String(b.row[field] ?? '')
      const order = comparator(left, right)
      if (order !== 0) return order
      return a.index - b.index
    })
    .map(item => item.row)
}
