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

// Chart color palette for multi-metric charts
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899']

export class DataAnalyzer {
  
  /**
   * O(N) Breadth-First Search to find the first substantial array in weird JSON structures.
   */
  static extractDataArray(rawData: unknown): any[] {
    if (!rawData) return []
    if (Array.isArray(rawData)) return rawData

    const queue = [rawData]
    let maxDepth = 5 // Prevent infinite loops on circular structures

    while (queue.length > 0 && maxDepth > 0) {
      const current = queue.shift() as Record<string, unknown>
      
      for (const key in current) {
        const val = current[key]
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
          return val // Found the primary array of objects
        }
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          queue.push(val)
        }
      }
      maxDepth--
    }
    return []
  }

  /**
   * Samples up to 50 rows to accurately infer data types (optimized for performance).
   */
  static inferTypes(rows: any[]): DataField[] {
    if (!rows.length) return []
    
    const sampleSize = Math.min(rows.length, 50)
    const sampleRows = rows.slice(0, sampleSize)
    const keys = Object.keys(sampleRows[0] || {}).filter(k => k !== 'id' && !k.startsWith('_'))

    return keys.map(key => {
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
   * Generates intelligent dashboard widget suggestions based on available schema.
   */
  static generateSuggestions(fields: DataField[]): ChartSuggestion[] {
    const numbers = fields.filter(f => f.type === 'number').map(f => f.name)
    const dates = fields.filter(f => f.type === 'date').map(f => f.name)
    const categories = fields.filter(f => f.type === 'string').map(f => f.name)

    const suggestions: ChartSuggestion[] = []

    // 1. Time-Series Analysis (If dates and numbers exist)
    if (dates.length > 0 && numbers.length > 0) {
      // Pick up to 3 metrics for a clean chart
      const selectedMetrics = numbers.slice(0, 3)
      suggestions.push({
        title: `${selectedMetrics.join(' & ')} over time`,
        chartType: 'area',
        xAxis: dates[0],
        yAxes: selectedMetrics.map((key, i) => ({ key, color: COLORS[i % COLORS.length] })),
        description: 'Visualizes trend changes over the time period.'
      })
    }

    // 2. Categorical Comparison (If strings and numbers exist)
    if (categories.length > 0 && numbers.length > 0) {
      suggestions.push({
        title: `${numbers[0]} by ${categories[0]}`,
        chartType: 'bar',
        xAxis: categories[0],
        yAxes: [{ key: numbers[0], color: COLORS[0] }],
        description: 'Compares the primary metric across different categories.'
      })

      // If we have multiple metrics, suggest a multi-bar chart
      if (numbers.length > 1) {
        const multiMetrics = numbers.slice(0, 4)
        suggestions.push({
          title: `Metrics breakdown by ${categories[0]}`,
          chartType: 'bar',
          xAxis: categories[0],
          yAxes: multiMetrics.map((key, i) => ({ key, color: COLORS[i % COLORS.length] })),
          description: 'Side-by-side comparison of multiple data points.'
        })
      }
    }

    // 3. Distribution (Pie Chart)
    if (categories.length > 0 && numbers.length > 0) {
      suggestions.push({
        title: `Distribution of ${numbers[0]}`,
        chartType: 'pie',
        xAxis: categories[0],
        yAxes: [{ key: numbers[0], color: COLORS[4] }],
        description: 'Shows the proportional breakdown of the data.'
      })
    }

    // 4. Always suggest a raw Data Table
    if (fields.length > 0) {
      suggestions.push({
        title: `Raw Data Grid`,
        chartType: 'table',
        xAxis: fields[0].name,
        yAxes: numbers.map((key, i) => ({ key, color: COLORS[i % COLORS.length] })),
        description: 'Complete paginated view of the structured API response.'
      })
    }

    return suggestions
  }

  static analyzeJsonString(jsonString: string) {
    try {
      const parsed = JSON.parse(jsonString)
      const rows = this.extractDataArray(parsed)
      
      if (!rows || rows.length === 0) {
        throw new Error("Could not find a valid array of objects in the JSON.")
      }

      const fields = this.inferTypes(rows)
      const suggestions = this.generateSuggestions(fields)

      return {
        success: true,
        totalRows: rows.length,
        fields,
        suggestions
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }
}
