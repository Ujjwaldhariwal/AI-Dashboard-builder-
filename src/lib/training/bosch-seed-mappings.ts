import { BOSCH_UPPCL_BLUEPRINT } from '@/lib/blueprints/bosch-uppcl'
import type { MappingCandidate } from '@/types/training'

const SEED_BY_ENDPOINT = new Map<string, MappingCandidate>()

for (const group of BOSCH_UPPCL_BLUEPRINT) {
  for (const section of group.sections) {
    for (const chart of section.charts) {
      const key = chart.endpointPath.trim().toLowerCase()
      if (SEED_BY_ENDPOINT.has(key)) continue

      SEED_BY_ENDPOINT.set(key, {
        type: chart.builderType,
        xAxis: chart.dataMapping.xAxis,
        yAxis: chart.dataMapping.yAxis,
        yAxes: chart.dataMapping.yAxes,
        reason: 'Bosch blueprint seed mapping',
        confidence: 88,
        source: 'seed',
      })
    }
  }
}

function normalizeEndpointToken(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function extractEndpointToken(endpointUrl: string | undefined): string {
  const raw = endpointUrl?.trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw, 'http://local')
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (!segments.length) return normalizeEndpointToken(raw)
    return normalizeEndpointToken(segments[segments.length - 1])
  } catch {
    const cleaned = raw.replace(/\?.*$/, '')
    const parts = cleaned.split('/').filter(Boolean)
    return normalizeEndpointToken(parts[parts.length - 1] ?? cleaned)
  }
}

export function getBoschSeedMapping(input: {
  endpointPath?: string
  endpointUrl?: string
  endpointName?: string
}): MappingCandidate | null {
  const candidates = [
    normalizeEndpointToken(input.endpointPath),
    extractEndpointToken(input.endpointUrl),
    normalizeEndpointToken(input.endpointName),
  ].filter(Boolean)

  for (const token of candidates) {
    const seed = SEED_BY_ENDPOINT.get(token)
    if (seed) return seed
  }

  return null
}