export type NaturalLanguageVisualization = 'table' | 'chart' | 'metric'

export type NaturalLanguageMetric = {
  metric: string | number
  label?: string
  count?: number
}

export type NaturalLanguageIntent = {
  summary: string
  confidence: number
  clarification?: string | null
}

export type NaturalLanguageQueryResult = {
  content: string
  data?: Record<string, unknown>[] | NaturalLanguageMetric
  visualizationType?: NaturalLanguageVisualization
  confidence?: number
  intent?: NaturalLanguageIntent
  warnings: string[]
  source: 'governed-ai'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function normalizeRows(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rows = value.filter(isRecord)
  return rows.length === value.length ? rows : undefined
}

function normalizeMetric(value: unknown): NaturalLanguageMetric | undefined {
  if (typeof value === 'number' || typeof value === 'string') {
    return { metric: value }
  }
  if (!isRecord(value)) return undefined

  const metric = value.metric ?? value.value
  if (typeof metric !== 'number' && typeof metric !== 'string') return undefined

  return {
    metric,
    label: typeof value.label === 'string' ? value.label : undefined,
    count: typeof value.count === 'number' ? value.count : undefined,
  }
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(1, Math.max(0, value))
}

function normalizeIntent(value: unknown): NaturalLanguageIntent | undefined {
  if (!isRecord(value) || typeof value.summary !== 'string' || !value.summary.trim()) return undefined
  const confidence = normalizeConfidence(value.confidence)
  if (confidence === undefined) return undefined
  return {
    summary: value.summary.trim(),
    confidence,
    clarification: typeof value.clarification === 'string' || value.clarification === null
      ? value.clarification
      : undefined,
  }
}

export function normalizeNaturalLanguageQueryResult(value: unknown): NaturalLanguageQueryResult {
  if (typeof value === 'string' && value.trim()) {
    return {
      content: value.trim(),
      warnings: [],
      source: 'governed-ai',
    }
  }
  if (!isRecord(value)) {
    throw new Error('The AI query service returned an unsupported response.')
  }

  const content = firstString(value, ['content', 'answer', 'summary', 'message'])
  if (!content) {
    throw new Error('The AI query service returned no grounded answer.')
  }

  const rows = normalizeRows(value.rows) ?? normalizeRows(value.data)
  const metric = normalizeMetric(value.metric)
  const requestedVisualization = value.visualizationType
  const visualizationType: NaturalLanguageVisualization | undefined =
    requestedVisualization === 'table' ||
    requestedVisualization === 'chart' ||
    requestedVisualization === 'metric'
      ? requestedVisualization
      : metric
        ? 'metric'
        : rows
          ? 'table'
          : undefined

  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === 'string' && Boolean(warning.trim()))
    : []

  return {
    content,
    data: metric ?? rows,
    visualizationType,
    confidence: normalizeConfidence(value.confidence),
    intent: normalizeIntent(value.intent),
    warnings,
    source: 'governed-ai',
  }
}
