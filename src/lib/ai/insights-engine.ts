// Module: InsightsEngine
interface DataPoint {
  [key: string]: any
}

interface Insight {
  type: 'trend' | 'anomaly' | 'forecast' | 'pattern' | 'recommendation'
  title: string
  description: string
  confidence: number
  impact: 'high' | 'medium' | 'low'
  data?: any
}

export class AIInsightsEngine {
  static analyzeDataset(data: DataPoint[]): Insight[] {
    const insights: Insight[] = []

    if (!data || data.length === 0) return insights

    // Detect numeric fields
    const numericFields = this.detectNumericFields(data)
    const timeFields = this.detectTimeFields(data)
    const categoricalFields = this.detectCategoricalFields(data)

    // Trend Analysis
    if (numericFields.length > 0) {
      insights.push(...this.analyzeTrends(data, numericFields))
    }

    // Anomaly Detection
    if (numericFields.length > 0) {
      insights.push(...this.detectAnomalies(data, numericFields))
    }

    // Pattern Recognition
    if (categoricalFields.length > 0 && numericFields.length > 0) {
      insights.push(...this.detectPatterns(data, categoricalFields, numericFields))
    }

    // Forecasting
    if (numericFields.length > 0 && data.length >= 5) {
      insights.push(...this.generateForecasts(data, numericFields))
    }

    // Smart Recommendations
    insights.push(...this.generateRecommendations(data, numericFields, categoricalFields))

    return insights.sort((a, b) => {
      const impactWeight = { high: 3, medium: 2, low: 1 }
      return impactWeight[b.impact] - impactWeight[a.impact] || b.confidence - a.confidence
    })
  }

  private static detectNumericFields(data: DataPoint[]): string[] {
    const first = data[0]
    return Object.keys(first).filter(key => {
      const values = data.map(d => d[key]).filter(v => v != null)
      return values.every(v => typeof v === 'number')
    })
  }

  private static detectTimeFields(data: DataPoint[]): string[] {
    const first = data[0]
    const timePatterns = [/date/i, /time/i, /created/i, /updated/i]
    return Object.keys(first).filter(key => 
      timePatterns.some(pattern => pattern.test(key))
    )
  }

  private static detectCategoricalFields(data: DataPoint[]): string[] {
    const first = data[0]
    return Object.keys(first).filter(key => {
      const values = data.map(d => d[key]).filter(v => v != null)
      const uniqueCount = new Set(values).size
      return typeof values[0] === 'string' && uniqueCount < data.length * 0.5
    })
  }

  private static analyzeTrends(data: DataPoint[], fields: string[]): Insight[] {
    const insights: Insight[] = []

    fields.forEach(field => {
      const values = data.map(d => d[field]).filter(v => typeof v === 'number')
      if (values.length < 2) return

      const firstHalf = values.slice(0, Math.floor(values.length / 2))
      const secondHalf = values.slice(Math.floor(values.length / 2))
      
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      
      const change = ((avgSecond - avgFirst) / avgFirst) * 100
      const direction = change > 0 ? 'increased' : 'decreased'
      
      if (Math.abs(change) > 10) {
        insights.push({
          type: 'trend',
          title: `${field} Trend Detected`,
          description: `${field} has ${direction} by ${Math.abs(change).toFixed(1)}% in the latter half of your dataset`,
          confidence: Math.min(95, 70 + Math.abs(change)),
          impact: Math.abs(change) > 30 ? 'high' : Math.abs(change) > 20 ? 'medium' : 'low',
          data: { field, change, direction }
        })
      }
    })

    return insights
  }

  private static detectAnomalies(data: DataPoint[], fields: string[]): Insight[] {
    const insights: Insight[] = []

    fields.forEach(field => {
      const values = data.map(d => d[field]).filter(v => typeof v === 'number')
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const stdDev = Math.sqrt(
        values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length
      )

      const outliers = values.filter(v => Math.abs(v - mean) > 2 * stdDev)

      if (outliers.length > 0 && outliers.length < values.length * 0.1) {
        insights.push({
          type: 'anomaly',
          title: `Anomalies Detected in ${field}`,
          description: `Found ${outliers.length} unusual value(s) that deviate significantly from the mean (${mean.toFixed(2)}). These could indicate data quality issues or exceptional events.`,
          confidence: 85,
          impact: 'high',
          data: { field, outliers: outliers.length, mean, stdDev }
        })
      }
    })

    return insights
  }

  private static detectPatterns(data: DataPoint[], categoricalFields: string[], numericFields: string[]): Insight[] {
    const insights: Insight[] = []

    if (categoricalFields.length > 0 && numericFields.length > 0) {
      const catField = categoricalFields[0]
      const numField = numericFields[0]

      const groupedData = data.reduce((acc, item) => {
        const key = item[catField]
        if (!acc[key]) acc[key] = []
        acc[key].push(item[numField])
        return acc
      }, {} as Record<string, number[]>)

      const topCategory = Object.entries(groupedData)
        .sort((a, b) => b[1].length - a[1].length)[0]

      if (topCategory) {
        const percentage = ((topCategory[1].length / data.length) * 100).toFixed(1)
        insights.push({
          type: 'pattern',
          title: `Dominant Category: ${topCategory[0]}`,
          description: `${topCategory[0]} accounts for ${percentage}% of your data, significantly more than other categories. Consider this when making decisions.`,
          confidence: 90,
          impact: 'medium',
          data: { category: topCategory[0], percentage }
        })
      }
    }

    return insights
  }

  private static generateForecasts(data: DataPoint[], fields: string[]): Insight[] {
    const insights: Insight[] = []

    fields.forEach(field => {
      const values = data.map(d => d[field]).filter(v => typeof v === 'number')
      if (values.length < 5) return

      // Simple linear regression
      const n = values.length
      const xSum = (n * (n - 1)) / 2
      const ySum = values.reduce((a, b) => a + b, 0)
      const xySum = values.reduce((sum, y, x) => sum + x * y, 0)
      const xxSum = (n * (n - 1) * (2 * n - 1)) / 6

      const slope = (n * xySum - xSum * ySum) / (n * xxSum - xSum * xSum)
      const intercept = (ySum - slope * xSum) / n

      const nextValue = slope * n + intercept
      const trend = slope > 0 ? 'upward' : 'downward'

      insights.push({
        type: 'forecast',
        title: `Forecast for ${field}`,
        description: `Based on current ${trend} trend, the next expected value for ${field} is approximately ${nextValue.toFixed(2)}`,
        confidence: 75,
        impact: 'medium',
        data: { field, forecast: nextValue, trend }
      })
    })

    return insights
  }

  private static generateRecommendations(
    data: DataPoint[],
    numericFields: string[],
    categoricalFields: string[]
  ): Insight[] {
    const insights: Insight[] = []

    if (data.length < 20) {
      insights.push({
        type: 'recommendation',
        title: 'Increase Sample Size',
        description: `You have ${data.length} records. For more reliable AI insights, consider collecting at least 50-100 data points.`,
        confidence: 95,
        impact: 'low'
      })
    }

    if (categoricalFields.length > 0 && numericFields.length > 0) {
      insights.push({
        type: 'recommendation',
        title: 'Segment Your Analysis',
        description: `Try breaking down ${numericFields[0]} by ${categoricalFields[0]} to uncover hidden patterns and correlations.`,
        confidence: 80,
        impact: 'medium'
      })
    }

    return insights
  }
}
