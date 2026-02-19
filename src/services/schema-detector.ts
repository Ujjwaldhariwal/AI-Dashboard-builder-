import Ajv from 'ajv'
import { ApiSchema } from '@/types'

const ajv = new Ajv()

export class SchemaDetector {
  static async analyzeApiResponse(
    endpointId: string,
    data: any
  ): Promise<ApiSchema> {
    const fields = this.detectFields(data)
    const suggestedCharts = this.suggestChartTypes(fields)

    return {
      endpointId,
      structure: data,
      detectedFields: fields,
      suggestedCharts,
    }
  }

  private static detectFields(data: any, prefix = ''): any[] {
    const fields: any[] = []

    if (Array.isArray(data) && data.length > 0) {
      return this.detectFields(data[0], prefix)
    }

    if (typeof data === 'object' && data !== null) {
      Object.keys(data).forEach((key) => {
        const value = data[key]
        const fieldName = prefix ? `${prefix}.${key}` : key
        const type = this.getFieldType(value)

        fields.push({
          name: fieldName,
          type,
          isTimeSeries: this.isTimeSeriesField(key, value),
          isCategorical: this.isCategoricalField(value),
        })

        if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          fields.push(...this.detectFields(value, fieldName))
        }
      })
    }

    return fields
  }

  private static getFieldType(value: any): string {
    if (typeof value === 'number') return 'number'
    if (typeof value === 'boolean') return 'boolean'
    if (typeof value === 'string') {
      if (this.isDateString(value)) return 'date'
      return 'string'
    }
    if (Array.isArray(value)) return 'array'
    if (typeof value === 'object') return 'object'
    return 'string'
  }

  private static isDateString(value: string): boolean {
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}/, // MM/DD/YYYY
      /^\d{4}\/\d{2}\/\d{2}/, // YYYY/MM/DD
    ]
    return datePatterns.some((pattern) => pattern.test(value))
  }

  private static isTimeSeriesField(key: string, value: any): boolean {
    const timeSeriesKeys = ['date', 'time', 'timestamp', 'created', 'updated', 'year', 'month']
    return (
      timeSeriesKeys.some((k) => key.toLowerCase().includes(k)) ||
      this.isDateString(String(value))
    )
  }

  private static isCategoricalField(value: any): boolean {
    return typeof value === 'string' && value.length < 50
  }

  private static suggestChartTypes(fields: any[]): string[] {
    const suggestions: string[] = []
    
    const hasTimeSeries = fields.some((f) => f.isTimeSeries)
    const hasNumeric = fields.some((f) => f.type === 'number')
    const hasCategorical = fields.some((f) => f.isCategorical)

    if (hasTimeSeries && hasNumeric) {
      suggestions.push('line', 'bar')
    }

    if (hasCategorical && hasNumeric) {
      suggestions.push('bar', 'pie')
    }

    if (hasNumeric) {
      suggestions.push('gauge')
    }

    if (fields.filter((f) => f.type === 'number').length >= 2) {
      suggestions.push('scatter')
    }

    // If no specific patterns, default to line and bar
    if (suggestions.length === 0 && hasNumeric) {
      suggestions.push('line', 'bar')
    }

    return [...new Set(suggestions)]
  }
}
