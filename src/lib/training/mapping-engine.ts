import { DataAnalyzer, type FieldType } from '@/lib/ai/data-analyzer'
import type {
  EndpointFieldStat,
  MappingCandidate,
  ProfileDriftFlags,
  ProfilePatternClass,
} from '@/types/training'
import {
  DEFAULT_PROFILE_DRIFT_FLAGS,
  getConfidenceBand,
  type MappingConfidenceBand,
} from '@/types/training'

interface MappingEngineInput {
  rows: Record<string, unknown>[]
  endpointName?: string
  endpointUrl?: string
  endpointPath?: string
  seedMapping?: MappingCandidate | null
  previousShapeSignature?: string
  previousUnauthorizedCount?: number
  previousEmptyCount?: number
}

interface AIFallbackInput {
  fields: EndpointFieldStat[]
  sampleRows: Record<string, unknown>[]
  endpointName?: string
  endpointUrl?: string
}

interface MappingEngineOptions {
  aiFallback?: (input: AIFallbackInput) => Promise<MappingCandidate | null>
}

export interface MappingEngineResult {
  candidate: MappingCandidate | null
  deterministicCandidate: MappingCandidate | null
  confidence: number
  confidenceBand: MappingConfidenceBand
  patternClass: ProfilePatternClass
  fieldStats: EndpointFieldStat[]
  shapeSignature: string
  driftFlags: ProfileDriftFlags
  aiFallbackUsed: boolean
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function isDateLike(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed)
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeFieldType(type: FieldType): EndpointFieldStat['type'] {
  if (type === 'number' || type === 'string' || type === 'date' || type === 'boolean') {
    return type
  }
  return 'unknown'
}

function computeFieldStats(rows: Record<string, unknown>[]): EndpointFieldStat[] {
  if (!rows.length) return []

  const inferred = DataAnalyzer.inferTypes(rows)
  const sampleRows = rows.slice(0, 200)

  return inferred.map(field => {
    const values = sampleRows.map(row => row[field.name])
    const nonNull = values.filter(value => value !== null && value !== undefined)
    const distinct = new Set(nonNull.map(value => String(value))).size

    return {
      name: field.name,
      type: normalizeFieldType(field.type),
      distinctCount: distinct,
      nullRatio: values.length ? 1 - (nonNull.length / values.length) : 1,
      sampleValues: nonNull.slice(0, 3).map(value => String(value).slice(0, 40)),
    }
  })
}

export function computeShapeSignature(rows: Record<string, unknown>[]): string {
  if (!rows.length) return 'empty'

  const sampleRows = rows.slice(0, 50)
  const keySet = new Set<string>()

  sampleRows.forEach(row => {
    Object.keys(row).forEach(key => keySet.add(key))
  })

  const keys = Array.from(keySet).sort((a, b) => a.localeCompare(b))
  const schema = keys.map(key => {
    const values = sampleRows.map(row => row[key]).filter(value => value !== null && value !== undefined)
    const first = values[0]

    let type = 'unknown'
    if (typeof first === 'boolean') type = 'boolean'
    else if (toNumber(first) !== null) type = 'number'
    else if (isDateLike(first)) type = 'date'
    else if (typeof first === 'string') type = 'string'

    return {
      key,
      type,
      samples: values.slice(0, 2).map(value => String(value).slice(0, 24)),
    }
  })

  return hashString(JSON.stringify({ rows: Math.min(rows.length, 9999), schema }))
}

function pickBestField(
  fields: EndpointFieldStat[],
  predicate: (field: EndpointFieldStat) => boolean,
): EndpointFieldStat | null {
  const matches = fields.filter(predicate)
  if (!matches.length) return null

  return matches
    .slice()
    .sort((a, b) => {
      if (a.nullRatio !== b.nullRatio) return a.nullRatio - b.nullRatio
      if (a.distinctCount !== b.distinctCount) return a.distinctCount - b.distinctCount
      return a.name.localeCompare(b.name)
    })[0]
}

function pickNumericFields(fields: EndpointFieldStat[]): EndpointFieldStat[] {
  return fields
    .filter(field => field.type === 'number')
    .slice()
    .sort((a, b) => {
      if (a.nullRatio !== b.nullRatio) return a.nullRatio - b.nullRatio
      return b.distinctCount - a.distinctCount
    })
}

function validateCandidate(
  candidate: MappingCandidate | null,
  fields: EndpointFieldStat[],
): candidate is MappingCandidate {
  if (!candidate) return false

  const fieldNames = new Set(fields.map(field => field.name))
  const numeric = new Set(fields.filter(field => field.type === 'number').map(field => field.name))
  const needsXAxis = !['gauge', 'ring-gauge', 'status-card'].includes(candidate.type)

  if (needsXAxis && (!candidate.xAxis || !fieldNames.has(candidate.xAxis))) return false

  if (candidate.yAxis && !fieldNames.has(candidate.yAxis)) return false
  if (candidate.yAxis && !numeric.has(candidate.yAxis) && candidate.type !== 'table') return false

  if (candidate.yAxes?.length) {
    for (const axis of candidate.yAxes) {
      if (!fieldNames.has(axis.key) || !numeric.has(axis.key)) return false
    }
  }

  return true
}

function buildDeterministicCandidate(input: {
  rows: Record<string, unknown>[]
  fields: EndpointFieldStat[]
}): {
  candidate: MappingCandidate | null
  confidence: number
  patternClass: ProfilePatternClass
} {
  const { rows, fields } = input
  const numeric = fields.filter(field => field.type === 'number')
  const dates = fields.filter(field => field.type === 'date')
  const strings = fields.filter(field => field.type === 'string')

  const rowCount = rows.length
  const topNumeric = pickNumericFields(fields)
  const topCategory = pickBestField(strings, field => field.distinctCount >= 2)
  const topDate = pickBestField(dates, () => true)

  let candidate: MappingCandidate | null = null
  let confidence = 0
  let patternClass: ProfilePatternClass = 'table-fallback'

  if (topDate && topNumeric[0]) {
    patternClass = 'time-series'
    confidence = 82
    candidate = {
      type: 'line',
      xAxis: topDate.name,
      yAxis: topNumeric[0].name,
      reason: 'Time axis and numeric metric detected.',
      confidence,
      source: 'deterministic',
    }
  } else if (topCategory && topNumeric.length >= 2) {
    const secondCategory = strings.find(field => field.name !== topCategory.name)
    const hierarchical = Boolean(
      secondCategory &&
      secondCategory.distinctCount > topCategory.distinctCount &&
      topCategory.distinctCount <= 16,
    )

    if (hierarchical) {
      patternClass = 'drilldown-hierarchical'
      confidence = 76
      candidate = {
        type: 'drilldown-bar',
        xAxis: topCategory.name,
        yAxis: topNumeric[0].name,
        reason: 'Hierarchical category signal detected with numeric metric.',
        confidence,
        source: 'deterministic',
      }
    } else {
      patternClass = 'multi-metric-category'
      confidence = 84
      candidate = {
        type: 'grouped-bar',
        xAxis: topCategory.name,
        yAxis: topNumeric[0].name,
        yAxes: topNumeric.slice(0, 3).map((field, index) => ({
          key: field.name,
          color: ['#3b82f6', '#10b981', '#f59e0b'][index % 3],
          label: field.name,
        })),
        reason: 'Category axis with multiple numeric metrics detected.',
        confidence,
        source: 'deterministic',
      }
    }
  } else if (topCategory && topNumeric[0]) {
    const categoryCount = topCategory.distinctCount
    patternClass = 'categorical-distribution'

    if (categoryCount <= 10) {
      confidence = 80
      candidate = {
        type: 'pie',
        xAxis: topCategory.name,
        yAxis: topNumeric[0].name,
        reason: 'Low-cardinality categorical distribution detected.',
        confidence,
        source: 'deterministic',
      }
    } else {
      confidence = 86
      candidate = {
        type: 'bar',
        xAxis: topCategory.name,
        yAxis: topNumeric[0].name,
        reason: 'Category comparison with many members detected.',
        confidence,
        source: 'deterministic',
      }
    }
  } else if (numeric[0]) {
    patternClass = 'kpi-single-value'
    confidence = 70
    candidate = {
      type: 'status-card',
      xAxis: '',
      yAxis: numeric[0].name,
      reason: 'Single numeric metric detected without category axis.',
      confidence,
      source: 'deterministic',
    }
  } else if (fields.length >= 2) {
    patternClass = 'table-fallback'
    confidence = 55
    candidate = {
      type: 'table',
      xAxis: fields[0].name,
      yAxis: fields[1].name,
      reason: 'Non-numeric or mixed schema fallback to table.',
      confidence,
      source: 'deterministic',
    }
  }

  if (candidate) {
    if (rowCount >= 30) confidence += 6
    else if (rowCount >= 10) confidence += 3
    else if (rowCount < 3) confidence -= 15

    if (candidate.xAxis) {
      const axisStat = fields.find(field => field.name === candidate.xAxis)
      if (axisStat && axisStat.nullRatio < 0.2) confidence += 4
      if (axisStat && axisStat.distinctCount <= 1) confidence -= 12
    }

    if (candidate.yAxis) {
      const yStat = fields.find(field => field.name === candidate.yAxis)
      if (yStat && yStat.nullRatio < 0.2) confidence += 4
    }

    candidate.confidence = Math.max(0, Math.min(100, confidence))
  }

  return {
    candidate,
    confidence: candidate?.confidence ?? 0,
    patternClass,
  }
}

function mergeSeedMapping(
  candidate: MappingCandidate | null,
  seedMapping: MappingCandidate | null | undefined,
  fields: EndpointFieldStat[],
): {
  candidate: MappingCandidate | null
  seedMismatch: boolean
} {
  if (!seedMapping) {
    return { candidate, seedMismatch: false }
  }

  const normalizedSeed: MappingCandidate = {
    ...seedMapping,
    source: 'seed',
    confidence: Math.max(88, seedMapping.confidence ?? 88),
  }

  if (!validateCandidate(normalizedSeed, fields)) {
    return {
      candidate,
      seedMismatch: true,
    }
  }

  if (!candidate || (candidate.confidence < normalizedSeed.confidence)) {
    return {
      candidate: normalizedSeed,
      seedMismatch: false,
    }
  }

  return {
    candidate,
    seedMismatch: false,
  }
}

export async function resolveMappingWithFallback(
  input: MappingEngineInput,
  options: MappingEngineOptions = {},
): Promise<MappingEngineResult> {
  const fields = computeFieldStats(input.rows)
  const shapeSignature = computeShapeSignature(input.rows)

  const deterministic = buildDeterministicCandidate({
    rows: input.rows,
    fields,
  })

  const seeded = mergeSeedMapping(deterministic.candidate, input.seedMapping, fields)

  let candidate = seeded.candidate
  let aiFallbackUsed = false

  if (candidate && !validateCandidate(candidate, fields)) {
    candidate = null
  }

  if ((candidate?.confidence ?? 0) < 80 && options.aiFallback) {
    const aiCandidate = await options.aiFallback({
      fields,
      sampleRows: input.rows.slice(0, 60),
      endpointName: input.endpointName,
      endpointUrl: input.endpointUrl,
    })

    if (validateCandidate(aiCandidate, fields)) {
      const normalizedAi = {
        ...aiCandidate,
        source: 'ai' as const,
        confidence: Math.max(aiCandidate.confidence ?? 68, 68),
      }

      if (!candidate || normalizedAi.confidence >= candidate.confidence + 2) {
        candidate = normalizedAi
      }
      aiFallbackUsed = true
    }
  }

  const confidence = candidate?.confidence ?? 0
  const confidenceBand = getConfidenceBand(confidence)

  const driftFlags: ProfileDriftFlags = {
    ...DEFAULT_PROFILE_DRIFT_FLAGS,
    shapeChanged: Boolean(input.previousShapeSignature && input.previousShapeSignature !== shapeSignature),
    repeatedUnauthorized: (input.previousUnauthorizedCount ?? 0) >= 2,
    repeatedEmpty: (input.previousEmptyCount ?? 0) >= 2,
    seedMismatch: seeded.seedMismatch,
  }

  return {
    candidate,
    deterministicCandidate: deterministic.candidate,
    confidence,
    confidenceBand,
    patternClass: deterministic.patternClass,
    fieldStats: fields,
    shapeSignature,
    driftFlags,
    aiFallbackUsed,
  }
}

export function mapRowsToAICandidate(input: {
  type: string
  xAxis?: string
  yAxis?: string
  reason?: string
  confidence?: number
}): MappingCandidate | null {
  if (!input.type) return null

  const normalizedType = input.type as MappingCandidate['type']
  return {
    type: normalizedType,
    xAxis: input.xAxis ?? '',
    yAxis: input.yAxis,
    reason: input.reason ?? 'AI fallback mapping suggestion',
    confidence: input.confidence ?? 68,
    source: 'ai',
  }
}