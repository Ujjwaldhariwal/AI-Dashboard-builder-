// src/lib/ai/chart-generator.ts
import { ChartType } from '@/types/widget'
import { DataField } from './data-analyzer'
import { resolveMappingWithFallback } from '@/lib/training/mapping-engine'
import { fetchAIFallbackMapping } from '@/lib/training/ai-fallback'

export interface AIChartSuggestion {
  title: string
  type: ChartType
  xAxis: string
  yAxis: string
  reason: string
}

export interface AIChartGeneratorResult {
  suggestions: AIChartSuggestion[]
  source: 'ai' | 'heuristic'
  error?: string
}

/**
 * Calls /api/ai/suggest — OpenAI powered.
 * Falls back to heuristic if API fails.
 */
export async function generateAIChartSuggestions(
  fields: DataField[],
  sampleData: any[],
  endpointName: string,
): Promise<AIChartGeneratorResult> {
  try {
    const rows = sampleData
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .slice(0, 120) as Record<string, unknown>[]

    if (!rows.length) {
      throw new Error('No valid data rows available for suggestion')
    }

    const mapping = await resolveMappingWithFallback({
      rows,
      endpointName,
    }, {
      aiFallback: ({ fields: inferredFields, sampleRows }) => fetchAIFallbackMapping({
        fields: inferredFields,
        sampleRows,
        endpointName,
      }),
    })

    const topSuggestion = mapping.candidate
    if (!topSuggestion) {
      throw new Error('No mapping candidate available')
    }

    const tableXAxis = fields[0]?.name ?? topSuggestion.xAxis ?? 'label'
    const tableYAxis = fields[1]?.name ?? topSuggestion.yAxis ?? tableXAxis

    return {
      suggestions: [
        {
          title: `${endpointName} Overview`,
          type: topSuggestion.type,
          xAxis: topSuggestion.xAxis,
          yAxis: topSuggestion.yAxis ?? '',
          reason: topSuggestion.reason,
        },
        {
          title: 'Raw Data Grid',
          type: 'table',
          xAxis: tableXAxis,
          yAxis: tableYAxis,
          reason: 'Tabular fallback for full field visibility',
        },
      ],
      source: mapping.aiFallbackUsed ? 'ai' : 'heuristic',
    }
  } catch (err: any) {
    // ── Heuristic fallback ─────────────────────────────────────────────
    const numbers    = fields.filter(f => f.type === 'number').map(f => f.name)
    const dates      = fields.filter(f => f.type === 'date').map(f => f.name)
    const categories = fields.filter(f => f.type === 'string').map(f => f.name)

    const suggestions: AIChartSuggestion[] = []

    if (dates.length && numbers.length) {
      suggestions.push({
        title: `${numbers[0]} over time`,
        type: 'area',
        xAxis: dates[0],
        yAxis: numbers[0],
        reason: 'Time series data is best shown as an area chart',
      })
    }
    if (categories.length && numbers.length) {
      suggestions.push({
        title: `${numbers[0]} by ${categories[0]}`,
        type: 'bar',
        xAxis: categories[0],
        yAxis: numbers[0],
        reason: 'Category comparison works best as a bar chart',
      })
      suggestions.push({
        title: `Distribution of ${numbers[0]}`,
        type: 'pie',
        xAxis: categories[0],
        yAxis: numbers[0],
        reason: 'Proportional breakdown suits a pie chart',
      })
    }
    if (fields.length >= 2) {
      suggestions.push({
        title: 'Raw Data Grid',
        type: 'table',
        xAxis: fields[0].name,
        yAxis: fields[1].name,
        reason: 'Full tabular view for all data',
      })
    }

    return { suggestions, source: 'heuristic', error: err.message }
  }
}
