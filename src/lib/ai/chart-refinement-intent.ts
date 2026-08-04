import type { ChartAiPatch } from '@/lib/ai/chart-ai-contract'
import type { DashboardChartConfig } from '@/types/dashboard-chart'

export interface GovernedChartDescriptor {
  id: string
  label: string
  semanticKey?: string
}

export interface GovernedChartIntentContext {
  chart: DashboardChartConfig
  allowedFields: GovernedChartDescriptor[]
  allowedMetrics: GovernedChartDescriptor[]
}

export interface ChartRefinementExample {
  instruction: string
  patch: ChartAiPatch
}

export interface DeterministicChartIntentResolution {
  patch: ChartAiPatch
  intent: 'rename' | 'chart_type' | 'grouping' | 'comparison' | 'sort_limit'
  confidence: 'high'
}

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function canonicalToken(token: string) {
  if (/^bill(ing|ed)?$/.test(token)) return 'bill'
  if (/^unit(s)?$/.test(token)) return 'unit'
  if (/^consum(ed|ption)?$/.test(token)) return 'consume'
  if (/^(month|monthly)$/.test(token)) return 'month'
  if (/^(revenue|sales)$/.test(token)) return 'revenue'
  return token
}

function tokens(value: string) {
  return Array.from(new Set(normalize(value).split(' ').filter(Boolean).map(canonicalToken)))
}

function descriptorTerms(descriptor: GovernedChartDescriptor) {
  return [descriptor.label, descriptor.semanticKey ?? '']
    .map(normalize)
    .filter(Boolean)
}

function mentionedDescriptors(instruction: string, descriptors: GovernedChartDescriptor[]) {
  const normalized = normalize(instruction)
  const instructionTokens = new Set(tokens(instruction))
  return descriptors
    .map((descriptor, index) => {
      const terms = descriptorTerms(descriptor)
      const exactIndex = terms
        .map(term => normalized.indexOf(term))
        .filter(position => position >= 0)
        .sort((left, right) => left - right)[0]
      const tokenMatch = terms
        .map(tokens)
        .some(termTokens => {
          const matchedCount = termTokens.filter(token => instructionTokens.has(token)).length
          return termTokens.length > 0 && matchedCount >= 1 && matchedCount / termTokens.length >= 0.75
        })
      return {
        descriptor,
        index,
        position: exactIndex ?? (tokenMatch ? Number.MAX_SAFE_INTEGER - index : -1),
        matched: exactIndex !== undefined || tokenMatch,
      }
    })
    .filter(candidate => candidate.matched)
    .sort((left, right) => left.position - right.position || left.index - right.index)
    .map(candidate => candidate.descriptor)
}

function chartTypeFromInstruction(instruction: string) {
  const normalized = normalize(instruction)
  if (/\b(horizontal|horizontal bar)\b/.test(normalized)) return 'horizontal-bar'
  if (/\b(grouped|group)\b.*\bbar\b/.test(normalized)) return 'grouped-bar'
  if (/\bstacked\b.*\bbar\b/.test(normalized)) return 'horizontal-stacked-bar'
  if (/\bline\b|\btrend\b/.test(normalized)) return 'line'
  if (/\bpie\b/.test(normalized)) return 'pie'
  if (/\b(donut|ring)\b/.test(normalized)) return 'ring-gauge'
  if (/\bbar\b/.test(normalized)) return 'bar'
  return null
}

function titleFromInstruction(instruction: string) {
  const quoted = instruction.match(/(?:rename|title|call)\s+(?:this|the chart)?\s*(?:to|as)?\s*["“]([^"”]{2,120})["”]/i)?.[1]
  if (quoted) return quoted.trim()
  const plain = instruction.match(/(?:rename|title|call)\s+(?:this|the chart)?\s*(?:to|as)\s+([^,.!]{2,120})/i)?.[1]
  return plain?.trim() ?? null
}

function numericLimit(instruction: string) {
  const match = instruction.match(/\b(?:top|first|limit)\s+(\d{1,3})\b/i)
  if (!match) return null
  const limit = Number(match[1])
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : null
}

/**
 * Resolves only unambiguous, governed requests. Any ambiguous request returns
 * null and continues to the structured model path with retrieved examples.
 */
export function resolveDeterministicChartIntent({
  instruction,
  context,
}: {
  instruction: string
  context: GovernedChartIntentContext
}): DeterministicChartIntentResolution | null {
  if (/\b(pink|purple|blue|green|orange|red|palette|color|compact|wide|full|labels?|legend|tooltip|grid|margin)\b/.test(normalize(instruction))) {
    return null
  }
  const title = titleFromInstruction(instruction)
  if (title) return { patch: { name: title }, intent: 'rename', confidence: 'high' }

  const templateId = chartTypeFromInstruction(instruction)
  if (templateId) return { patch: { templateId }, intent: 'chart_type', confidence: 'high' }

  const normalized = normalize(instruction)
  const fields = mentionedDescriptors(instruction, context.allowedFields)
  const metrics = mentionedDescriptors(instruction, context.allowedMetrics)

  if (/\bgroup\b|\bbreak\b.*\bdown\b|\bsplit\b/.test(normalized) && fields.length === 1) {
    return {
      patch: { encoding: { xAxisFieldId: fields[0].id } },
      intent: 'grouping',
      confidence: 'high',
    }
  }

  if (/\b(compare|versus|vs)\b/.test(normalized) && metrics.length >= 2) {
    return {
      patch: { encoding: { yMetricIds: metrics.slice(0, 2).map(metric => metric.id) } },
      intent: 'comparison',
      confidence: 'high',
    }
  }

  const limit = numericLimit(instruction)
  const direction = /\b(lowest|ascending|smallest)\b/.test(normalized)
    ? 'asc'
    : /\b(highest|descending|largest|top)\b/.test(normalized)
      ? 'desc'
      : null
  if (limit !== null || direction) {
    const sortTarget = metrics[0]?.id ?? context.chart.encoding.yMetricIds[0]
    if (sortTarget) {
      return {
        patch: {
          encoding: {
            limit: limit ?? context.chart.encoding.limit ?? 10,
            sort: { byId: sortTarget, direction: direction ?? 'desc' },
          },
        },
        intent: 'sort_limit',
        confidence: 'high',
      }
    }
  }

  return null
}

function scoreExample(instruction: string, keywords: string[]) {
  const normalized = normalize(instruction)
  return keywords.reduce((score, keyword) => score + (normalized.includes(keyword) ? 1 : 0), 0)
}

/** Returns only examples built from the current allowlisted semantic IDs. */
export function selectRelevantChartRefinementExamples({
  instruction,
  context,
  maximum = 3,
}: {
  instruction: string
  context: GovernedChartIntentContext
  maximum?: number
}) {
  const firstField = context.allowedFields[0]
  const firstMetric = context.allowedMetrics[0]
  const secondMetric = context.allowedMetrics[1]
  const candidates: Array<{ keywords: string[]; example: ChartRefinementExample }> = [
    {
      keywords: ['pink', 'color', 'palette', 'label', 'compact', 'legend', 'tooltip'],
      example: {
        instruction: 'Use a pink palette, show bold labels, and keep the chart compact',
        patch: {
          presentation: {
            colors: ['#EC4899'],
            size: 'compact',
            showLabels: true,
            labels: { fontWeight: 'bold' },
          },
        },
      },
    },
    {
      keywords: ['date only', 'without time', 'hide time', 'bottom axis', 'x axis'],
      example: {
        instruction: 'Show only the date on the bottom axis and make those labels slightly bold',
        patch: {
          presentation: {
            xAxis: {
              labelFormat: 'date-only',
              labelFontWeight: 'medium',
            },
          },
        },
      },
    },
    {
      keywords: ['line', 'bar', 'pie', 'trend', 'chart type'],
      example: { instruction: 'Make this a line chart', patch: { templateId: 'line' } },
    },
    ...(firstField ? [{
      keywords: ['group', 'break down', 'split'],
      example: { instruction: `Group by ${firstField.label}`, patch: { encoding: { xAxisFieldId: firstField.id } } },
    }] : []),
    ...(firstMetric && secondMetric ? [{
      keywords: ['compare', 'versus', 'vs'],
      example: {
        instruction: `Compare ${firstMetric.label} vs ${secondMetric.label}`,
        patch: { encoding: { yMetricIds: [firstMetric.id, secondMetric.id] } },
      },
    }] : []),
    ...(firstMetric ? [{
      keywords: ['top', 'highest', 'lowest', 'sort', 'limit'],
      example: {
        instruction: `Sort by highest ${firstMetric.label} and show the top 10`,
        patch: { encoding: { sort: { byId: firstMetric.id, direction: 'desc' as const }, limit: 10 } },
      },
    }] : []),
  ]

  return candidates
    .map(candidate => ({ ...candidate, score: scoreExample(instruction, candidate.keywords) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(maximum, 5)))
    .map(candidate => candidate.example)
}
