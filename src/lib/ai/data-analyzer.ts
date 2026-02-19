export interface DataAnalysis {
  totalRecords: number
  fields: Array<{
    name: string
    type: 'string' | 'number' | 'date' | 'boolean' | 'object' | 'array'
    uniqueValues: number
    sampleValues: any[]
    hasNulls: boolean
    isNumeric: boolean
    isDate: boolean
    isCategorical: boolean
  }>
  suggestedCharts: Array<{
    type: 'line' | 'bar' | 'pie' | 'area' | 'table'
    confidence: number
    reason: string
    xAxis?: string
    yAxis?: string
    groupBy?: string
  }>
  timeSeries: {
    detected: boolean
    dateField?: string
  }
}

export class DataAnalyzer {
  static analyze(data: any[]): DataAnalysis {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        totalRecords: 0,
        fields: [],
        suggestedCharts: [],
        timeSeries: { detected: false },
      }
    }

    const firstItem = data[0]
    const fields = Object.keys(firstItem).map((fieldName) => {
      const values = data.map((item) => item[fieldName]).filter((v) => v != null)
      const uniqueCount = new Set(values).size
      const sampleValues = values.slice(0, 5)

      // Type detection
      const isNumeric = values.every((v) => typeof v === 'number' || !isNaN(Number(v)))
      const isDate = values.some((v) => {
        const str = String(v).toLowerCase()
        return str.includes('date') || str.includes('time') || !isNaN(Date.parse(v))
      })
      const isCategorical = uniqueCount < data.length * 0.5 && uniqueCount < 20

      let type: 'string' | 'number' | 'date' | 'boolean' | 'object' | 'array' = 'string'
      if (isNumeric) type = 'number'
      else if (isDate) type = 'date'
      else if (typeof values[0] === 'boolean') type = 'boolean'
      else if (Array.isArray(values[0])) type = 'array'
      else if (typeof values[0] === 'object') type = 'object'

      return {
        name: fieldName,
        type,
        uniqueValues: uniqueCount,
        sampleValues,
        hasNulls: values.length < data.length,
        isNumeric,
        isDate,
        isCategorical,
      }
    })

    // Detect time series
    const dateField = fields.find((f) => f.isDate)
    const timeSeries = {
      detected: !!dateField,
      dateField: dateField?.name,
    }

    // Generate chart suggestions
    const suggestedCharts = this.generateChartSuggestions(fields, data.length, timeSeries)

    return {
      totalRecords: data.length,
      fields,
      suggestedCharts,
      timeSeries,
    }
  }

  private static generateChartSuggestions(
    fields: any[],
    recordCount: number,
    timeSeries: any
  ) {
    const suggestions: any[] = []

    const numericFields = fields.filter((f) => f.isNumeric)
    const categoricalFields = fields.filter((f) => f.isCategorical)
    const dateFields = fields.filter((f) => f.isDate)

    // Time series line chart
    if (timeSeries.detected && numericFields.length > 0) {
      suggestions.push({
        type: 'line',
        confidence: 95,
        reason: 'Time series data detected with numeric values - perfect for trend visualization',
        xAxis: timeSeries.dateField,
        yAxis: numericFields[0].name,
      })

      suggestions.push({
        type: 'area',
        confidence: 85,
        reason: 'Area charts work well for showing volume over time',
        xAxis: timeSeries.dateField,
        yAxis: numericFields[0].name,
      })
    }

    // Bar chart for categorical data
    if (categoricalFields.length > 0 && numericFields.length > 0) {
      suggestions.push({
        type: 'bar',
        confidence: 90,
        reason: 'Categorical data with numeric values - ideal for comparison',
        xAxis: categoricalFields[0].name,
        yAxis: numericFields[0].name,
      })
    }

    // Pie chart for categorical distribution
    if (categoricalFields.length > 0 && categoricalFields[0].uniqueValues <= 10) {
      suggestions.push({
        type: 'pie',
        confidence: 80,
        reason: `Small number of categories (${categoricalFields[0].uniqueValues}) - good for showing distribution`,
        groupBy: categoricalFields[0].name,
        yAxis: numericFields[0]?.name || 'count',
      })
    }

    // Table for detailed view
    suggestions.push({
      type: 'table',
      confidence: 100,
      reason: 'Table view for detailed data inspection - always useful',
    })

    return suggestions.sort((a, b) => b.confidence - a.confidence)
  }
}
