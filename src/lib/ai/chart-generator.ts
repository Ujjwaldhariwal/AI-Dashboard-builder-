// src/lib/ai/chart-generator.ts
import { ChartType } from '@/types/widget'
import { DataField } from './data-analyzer'

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
    const res = await fetch('/api/ai/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, sampleData, endpointName }),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    if (!data.suggestions?.length) throw new Error('No suggestions returned')

    return {
      suggestions: data.suggestions as AIChartSuggestion[],
      source: 'ai',
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
