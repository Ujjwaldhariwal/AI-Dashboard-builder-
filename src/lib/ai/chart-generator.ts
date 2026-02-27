// Module: ChartGenerator
interface DataPoint {
  [key: string]: any
}

interface ChartRecommendation {
  type: 'line' | 'bar' | 'pie' | 'area'
  title: string
  xField: string
  yField: string
  reason: string
}

export class ChartGenerator {
  static generateRecommendations(data: DataPoint[]): ChartRecommendation[] {
    if (!data || data.length === 0) return []

    const recommendations: ChartRecommendation[] = []
    const fields = Object.keys(data[0])
    
    const numericFields = fields.filter(field => {
      return data.slice(0, 10).every(item => typeof item[field] === 'number')
    })

    const categoricalFields = fields.filter(field => {
      const uniqueValues = new Set(data.map(item => item[field])).size
      return typeof data[0][field] === 'string' && uniqueValues < data.length * 0.5
    })

    const timeFields = fields.filter(field => {
      return /date|time|created|updated/i.test(field)
    })

    // Recommendation 1: Trend over index/id (Line Chart)
    if (numericFields.length > 0) {
      const idField = fields.find(f => /id|index|number/i.test(f)) || fields[0]
      const valueField = numericFields[0]
      
      recommendations.push({
        type: 'line',
        title: `${valueField} Trend`,
        xField: idField,
        yField: valueField,
        reason: 'Shows progression and trends over sequential data'
      })
    }

    // Recommendation 2: Category comparison (Bar Chart)
    if (categoricalFields.length > 0 && numericFields.length > 0) {
      recommendations.push({
        type: 'bar',
        title: `${numericFields[0]} by ${categoricalFields[0]}`,
        xField: categoricalFields[0],
        yField: numericFields[0],
        reason: 'Compares values across different categories'
      })
    }

    // Recommendation 3: Distribution (Pie Chart)
    if (categoricalFields.length > 0) {
      const catField = categoricalFields[0]
      const valueField = numericFields[0] || catField
      
      recommendations.push({
        type: 'pie',
        title: `Distribution by ${catField}`,
        xField: catField,
        yField: valueField,
        reason: 'Shows proportional distribution of categories'
      })
    }

    // Recommendation 4: Area chart for cumulative/trend data
    if (numericFields.length > 1) {
      recommendations.push({
        type: 'area',
        title: `${numericFields[1]} Accumulation`,
        xField: fields[0],
        yField: numericFields[1],
        reason: 'Visualizes cumulative trends and volumes'
      })
    }

    return recommendations.slice(0, 4)
  }
}
