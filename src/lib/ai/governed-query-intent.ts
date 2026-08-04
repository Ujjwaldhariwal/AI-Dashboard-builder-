export type GovernedQueryAsset = {
  id: string
  name: string
  role: 'metric' | 'dimension'
  aliases?: string[]
}
export type GovernedQueryIntent = {
  version: 'dashboardos.governed-query-intent.v1'
  metricIds: string[]
  dimensionIds: string[]
  visualization: 'auto' | 'metric' | 'table' | 'bar' | 'line' | 'pie'
  sort: { byId: string; direction: 'asc' | 'desc' } | null
  limit: number | null
  confidence: number
  clarification: string | null
  summary: string
}

const GENERIC_METRIC_WORDS = new Set([
  'amount', 'count', 'metric', 'metrics', 'number', 'performance', 'total', 'value',
])
const QUESTION_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'for', 'from', 'in', 'is', 'of', 'on', 'show', 'the', 'to', 'what', 'which',
])

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function scoreAsset(question: string, asset: GovernedQueryAsset) {
  const normalizedQuestion = words(question).join(' ')
  const labels = [asset.name, ...(asset.aliases ?? [])]
  let best = 0

  for (const label of labels) {
    const labelWords = words(label).filter(word => !QUESTION_STOP_WORDS.has(word))
    if (labelWords.length === 0) continue

    const normalizedLabel = labelWords.join(' ')
    if (normalizedQuestion.includes(normalizedLabel)) {
      best = Math.max(best, 1)
      continue
    }

    const questionWords = new Set(words(question))
    const matched = labelWords.filter(word => questionWords.has(word))
    const score = matched.length / labelWords.length
    const onlyGeneric = matched.every(word => GENERIC_METRIC_WORDS.has(word))
    best = Math.max(best, onlyGeneric ? Math.min(score, 0.45) : score)
  }

  return best
}

function uniqueAssets(assets: GovernedQueryAsset[]) {
  return Array.from(new Map(assets.map(asset => [asset.id, asset])).values())
}

function matchedAssets(question: string, assets: GovernedQueryAsset[]) {
  return assets
    .map(asset => ({ asset, score: scoreAsset(question, asset) }))
    .filter(match => match.score >= 0.6)
    .sort((left, right) => right.score - left.score)
}

function resolveVisualization(question: string): GovernedQueryIntent['visualization'] {
  const normalized = words(question).join(' ')
  if (/\b(trend|over time|timeline|monthly|weekly|daily)\b/.test(normalized)) return 'line'
  if (/\b(share|proportion|percentage|distribution)\b/.test(normalized)) return 'pie'
  if (/\b(compare|comparison| versus | vs | by )\b/.test(` ${normalized} `)) return 'bar'
  if (/\b(list|rows|records|table|details)\b/.test(normalized)) return 'table'
  if (/\b(total|how many|number of|count)\b/.test(normalized)) return 'metric'
  return 'auto'
}

function requestedLimit(question: string) {
  const match = question.match(/\b(?:top|bottom)\s+(\d{1,3})\b/i)
  return match ? Math.max(1, Math.min(100, Number(match[1]))) : null
}

function summary(
  metrics: GovernedQueryAsset[],
  dimensions: GovernedQueryAsset[],
  visualization: GovernedQueryIntent['visualization'],
) {
  const metricNames = metrics.slice(0, 4).map(asset => asset.name).join(', ') || 'No metric'
  const dimensionNames = dimensions.slice(0, 3).map(asset => asset.name).join(', ')
  return `${metricNames}${dimensionNames ? ` by ${dimensionNames}` : ''} · ${visualization}`
}

export function planGovernedQueryIntent(
  question: string,
  suppliedAssets: GovernedQueryAsset[],
): GovernedQueryIntent {
  const assets = uniqueAssets(suppliedAssets)
  const metrics = assets.filter(asset => asset.role === 'metric')
  const dimensions = assets.filter(asset => asset.role === 'dimension')
  const metricMatches = matchedAssets(question, metrics)
  const dimensionMatches = matchedAssets(question, dimensions)
  const normalizedQuestion = words(question).join(' ')
  const requestsBroadAnalysis = /\b(metrics|trend|trends|performance|changed|changes|anomalies|patterns)\b/.test(normalizedQuestion)
  const selectedMetrics = metricMatches.length > 0
    ? metricMatches.slice(0, 8).map(match => match.asset)
    : requestsBroadAnalysis
      ? metrics.slice(0, 8)
      : []
  let selectedDimensions = dimensionMatches.slice(0, 4).map(match => match.asset)
  const visualization = resolveVisualization(question)

  if (selectedDimensions.length === 0 && visualization === 'line') {
    const timeDimension = dimensions.find(asset => /\b(date|day|month|quarter|time|week|year)\b/.test(words(asset.name).join(' ')))
    if (timeDimension) selectedDimensions = [timeDimension]
  }

  const clarification = assets.length === 0
    ? 'This release has no governed semantic fields available for the question.'
    : selectedMetrics.length === 0
      ? `Which governed metric should I use? Available metrics: ${metrics.slice(0, 6).map(asset => asset.name).join(', ') || 'none'}.`
      : null
  const limit = requestedLimit(question)
  const direction = /\bbottom\b/i.test(question) ? 'asc' as const : 'desc' as const
  const sortId = selectedMetrics[0]?.id ?? selectedDimensions[0]?.id
  const confidence = clarification
    ? 0.25
    : Math.min(0.98, 0.65 + (metricMatches.length > 0 ? 0.2 : 0.05) + (selectedDimensions.length > 0 ? 0.1 : 0))

  return {
    version: 'dashboardos.governed-query-intent.v1',
    metricIds: selectedMetrics.map(asset => asset.id),
    dimensionIds: selectedDimensions.map(asset => asset.id),
    visualization,
    sort: limit && sortId ? { byId: sortId, direction } : null,
    limit,
    confidence,
    clarification,
    summary: summary(selectedMetrics, selectedDimensions, visualization),
  }
}
