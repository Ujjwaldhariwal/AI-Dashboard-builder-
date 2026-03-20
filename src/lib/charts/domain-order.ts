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
    'between 2 to 7 days',
    'between 7 and 15 days',
    'between 15 and 30 days',
    'more than 30 days',
  ],
  [
    'less than 5 days',
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

export function sortNamedValues(values: NamedValue[]): NamedValue[] {
  if (!values.length) return values

  const orderMap = detectOrderMap(values.map(v => v.name))
  if (!orderMap) return values

  return [...values].sort((a, b) => {
    const ai = orderMap.get(normalize(a.name)) ?? Number.MAX_SAFE_INTEGER
    const bi = orderMap.get(normalize(b.name)) ?? Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })
}

export function sortLabels(labels: string[]): string[] {
  if (!labels.length) return labels

  const orderMap = detectOrderMap(labels)
  if (!orderMap) return labels

  return [...labels].sort((a, b) => {
    const ai = orderMap.get(normalize(a)) ?? Number.MAX_SAFE_INTEGER
    const bi = orderMap.get(normalize(b)) ?? Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    return a.localeCompare(b, undefined, { numeric: true })
  })
}
