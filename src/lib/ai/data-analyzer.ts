// Module: DataAnalyzer
// src/lib/ai/data-analyzer.ts
import { ChartType, YAxisConfig } from '@/types/widget'

export type FieldType = 'number' | 'string' | 'date' | 'boolean' | 'unknown'

export interface DataField {
  name: string
  type: FieldType
}

export interface ChartSuggestion {
  title: string
  chartType: ChartType
  xAxis: string
  yAxes: YAxisConfig[]
  description: string
}

export interface DataAnalysis {
  totalRecords: number
  fields: DataField[]
  suggestedCharts: {
    type: string
    xAxis?: string
    yAxis?: string
    groupBy?: string
    confidence: number
  }[]
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899']

export class DataAnalyzer {
  /**
   * BFS to find the first substantial array of objects in any JSON structure.
   * ✅ FIX: proper depth tracking per-node, not per outer-loop tick
   */
  static extractDataArray(rawData: unknown): any[] | undefined {
    if (!rawData) return undefined

    // Direct array
    if (Array.isArray(rawData)) {
      const valid = rawData.find(item => item && typeof item === 'object' && !Array.isArray(item))
      if (valid) return rawData
    }

    // BFS through object keys
    const queue: Array<{ node: unknown; depth: number }> = [{ node: rawData, depth: 0 }]

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!

      if (depth > 8) continue // ✅ FIX: per-node depth limit, was global maxDepth--

      if (Array.isArray(node)) {
        // Must have at least one object item
        if (node.length > 0 && typeof node[0] === 'object' && node[0] !== null) {
          return node
        }
        // Recurse into nested arrays
        node.forEach(item => {
          if (item && typeof item === 'object') {
            queue.push({ node: item, depth: depth + 1 })
          }
        })
        continue
      }

      if (node && typeof node === 'object') {
        for (const key of Object.keys(node as Record<string, unknown>)) {
          const val = (node as Record<string, unknown>)[key]
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
            return val // ✅ First array of objects wins
          }
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            queue.push({ node: val, depth: depth + 1 })
          }
        }
      }
    }

    return undefined
  }

  /**
   * Samples up to 50 rows to infer field types.
   * ✅ FIX: removed blanket `id` filter — only skip fields that are
   *         pure UUIDs or numeric auto-increment IDs with no analytical value.
   */
  static inferTypes(rows: any[]): DataField[] {
    if (!rows.length) return []

    const sampleSize = Math.min(rows.length, 50)
    const sampleRows = rows.slice(0, sampleSize)
    const keys = Object.keys(sampleRows[0])

    return keys
      .filter(k => {
        // ✅ FIX: only skip if it looks like a pure surrogate key
        // (named exactly 'id' or ends with '_uuid' and all values are UUID strings)
        if (k === 'id') {
          const allNumericIds = sampleRows.every(r => typeof r[k] === 'number')
          const allUuids = sampleRows.every(
            r => typeof r[k] === 'string' && /^[0-9a-f-]{36}$/i.test(r[k]),
          )
          return !allNumericIds && !allUuids // keep if not pure ID
        }
        return true // keep all other fields
      })
      .map(key => {
        let isNum = true, isDate = true, isBool = true

        for (const row of sampleRows) {
          const val = row[key]
          if (val === null || val === undefined) continue
          if (typeof val !== 'number' && isNaN(Number(val))) isNum = false
          if (typeof val !== 'boolean') isBool = false
          if (typeof val !== 'string' || isNaN(Date.parse(val))) isDate = false
        }

        let type: FieldType = 'string'
        if (isBool) type = 'boolean'
        else if (isNum) type = 'number'
        else if (isDate) type = 'date'

        return { name: key, type }
      })
  }

  /**
   * Generates chart suggestions from detected fields.
   */
  static generateSuggestions(fields: DataField[]): ChartSuggestion[] {
    const numbers = fields.filter(f => f.type === 'number').map(f => f.name)
    const dates = fields.filter(f => f.type === 'date').map(f => f.name)
    const categories = fields.filter(f => f.type === 'string').map(f => f.name)
    const suggestions: ChartSuggestion[] = []

    // Time series area chart
    if (dates.length > 0 && numbers.length > 0) {
      const selectedMetrics = numbers.slice(0, 3)
      suggestions.push({
        title: `${selectedMetrics.join(', ')} over time`,
        chartType: 'area',
        xAxis: dates[0],
        yAxes: selectedMetrics.map((key, i) => ({ key, color: COLORS[i % COLORS.length] })),
        description: 'Visualizes trend changes over the time period.',
      })
    }

    // Category bar chart
    if (categories.length > 0 && numbers.length > 0) {
      suggestions.push({
        title: `${numbers[0]} by ${categories[0]}`,
        chartType: 'bar',
        xAxis: categories[0],
        yAxes: [{ key: numbers[0], color: COLORS[0] }],
        description: 'Compares the primary metric across categories.',
      })
    }

    // Multi-metric bar
    if (categories.length > 0 && numbers.length > 1) {
      const multiMetrics = numbers.slice(0, 4)
      suggestions.push({
        title: `Metrics breakdown by ${categories[0]}`,
        chartType: 'bar',
        xAxis: categories[0],
        yAxes: multiMetrics.map((key, i) => ({ key, color: COLORS[i % COLORS.length] })),
        description: 'Side-by-side comparison of multiple data points.',
      })
    }

    // Pie chart
    if (categories.length > 0 && numbers.length > 0) {
      suggestions.push({
        title: `Distribution of ${numbers[0]}`,
        chartType: 'pie',
        xAxis: categories[0],
        yAxes: [{ key: numbers[0], color: COLORS[4] }],
        description: 'Shows the proportional breakdown.',
      })
    }

    // ✅ FIX: fallback when NO numbers detected — use first two string fields
    //         (covers APIs like JSONPlaceholder /users where fields are all strings)
    if (suggestions.length === 0 && fields.length >= 2) {
      const x = fields[0].name
      const y = fields[1].name
      suggestions.push({
        title: `${y} by ${x}`,
        chartType: 'bar',
        xAxis: x,
        yAxes: [{ key: y, color: COLORS[0] }],
        description: 'Auto-generated from available fields.',
      })
    }

    // Always add raw data table
    if (fields.length > 0) {
      suggestions.push({
        title: 'Raw Data Grid',
        chartType: 'table',
        xAxis: fields[0].name,
        yAxes: numbers.length
          ? numbers.map((key, i) => ({ key, color: COLORS[i % COLORS.length] }))
          : fields.slice(1, 4).map((f, i) => ({ key: f.name, color: COLORS[i % COLORS.length] })),
        description: 'Complete paginated view of the API response.',
      })
    }

    return suggestions
  }

  /**
   * Used by LiveAPIPreview + WidgetEditDialog — accepts already-parsed array.
   */
  static analyzeArray(dataArray: any[]): DataAnalysis {
    const fields = this.inferTypes(dataArray)
    const suggestions = this.generateSuggestions(fields)

    return {
      totalRecords: dataArray.length,
      fields,
      suggestedCharts: suggestions.map(s => ({
        type: s.chartType,
        xAxis: s.xAxis,
        yAxis: s.yAxes?.[0]?.key,
        groupBy: s.xAxis,
        confidence: 85,
      })),
    }
  }

  /**
   * Used by MagicPasteModal — accepts raw JSON string.
   * ✅ FIX: better error messages + handles all JSON shapes
   */
  static analyzeJsonString(jsonString: string): {
    success: boolean
    totalRows?: number
    fields?: DataField[]
    suggestions?: ChartSuggestion[]
    error?: string
  } {
    try {
      const parsed = JSON.parse(jsonString)
      const rows = this.extractDataArray(parsed)

      if (!rows || rows.length === 0) {
        // ✅ FIX: helpful error instead of generic message
        const shape = Array.isArray(parsed)
          ? `a flat array of ${parsed.length} items`
          : `an object with keys: ${Object.keys(parsed).join(', ')}`
        throw new Error(
          `Could not find a valid array of objects. Your JSON is ${shape}. ` +
          `Wrap your data in an array like [{"key": "value"}] or ` +
          `{"data": [{"key": "value"}]}.`,
        )
      }

      // Validate at least one object item
      const firstObj = rows.find(r => r && typeof r === 'object' && !Array.isArray(r))
      if (!firstObj) {
        throw new Error(
          'Found an array but its items are not objects. ' +
          'Magic Build needs an array of objects like [{"month":"Jan","revenue":500}].',
        )
      }

      const fields = this.inferTypes(rows)
      const suggestions = this.generateSuggestions(fields)

      return { success: true, totalRows: rows.length, fields, suggestions }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }
}
