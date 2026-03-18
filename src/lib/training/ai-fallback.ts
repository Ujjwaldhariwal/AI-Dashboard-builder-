import type { EndpointFieldStat, MappingCandidate } from '@/types/training'
import { mapRowsToAICandidate } from '@/lib/training/mapping-engine'

interface AISuggestResponse {
  suggestions?: Array<{
    type: string
    xAxis?: string
    yAxis?: string
    reason?: string
  }>
}

export async function fetchAIFallbackMapping(input: {
  fields: EndpointFieldStat[]
  sampleRows: Record<string, unknown>[]
  endpointName?: string
}): Promise<MappingCandidate | null> {
  const response = await fetch('/api/ai/suggest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: input.fields.map(field => ({ name: field.name, type: field.type })),
      sampleData: input.sampleRows,
      endpointName: input.endpointName ?? 'Endpoint',
    }),
  })

  if (!response.ok) return null

  const payload = (await response.json()) as AISuggestResponse
  const suggestion = payload.suggestions?.[0]
  if (!suggestion) return null

  return mapRowsToAICandidate({
    type: suggestion.type,
    xAxis: suggestion.xAxis,
    yAxis: suggestion.yAxis,
    reason: suggestion.reason,
    confidence: 70,
  })
}