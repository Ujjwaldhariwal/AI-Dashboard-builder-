// Module: CorrelationEngine
interface CorrelationResult {
  field1: string
  field2: string
  correlation: number
  strength: 'strong' | 'moderate' | 'weak'
  direction: 'positive' | 'negative'
  description: string
}

export class CorrelationEngine {
  static analyzeCorrelations(data: any[]): CorrelationResult[] {
    if (!data || data.length < 3) return []

    const correlations: CorrelationResult[] = []
    const numericFields = this.getNumericFields(data)

    // Calculate correlation for each pair of numeric fields
    for (let i = 0; i < numericFields.length; i++) {
      for (let j = i + 1; j < numericFields.length; j++) {
        const field1 = numericFields[i]
        const field2 = numericFields[j]
        
        const values1 = data.map(item => parseFloat(item[field1]) || 0)
        const values2 = data.map(item => parseFloat(item[field2]) || 0)
        
        const correlation = this.pearsonCorrelation(values1, values2)
        
        if (Math.abs(correlation) > 0.3) { // Only show significant correlations
          const strength = Math.abs(correlation) > 0.7 ? 'strong' : 
                          Math.abs(correlation) > 0.5 ? 'moderate' : 'weak'
          const direction = correlation > 0 ? 'positive' : 'negative'
          
          correlations.push({
            field1,
            field2,
            correlation: parseFloat(correlation.toFixed(3)),
            strength,
            direction,
            description: this.generateDescription(field1, field2, correlation, strength, direction)
          })
        }
      }
    }

    return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
  }

  private static pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length
    const sum1 = x.reduce((a, b) => a + b, 0)
    const sum2 = y.reduce((a, b) => a + b, 0)
    const sum1Sq = x.reduce((a, b) => a + b * b, 0)
    const sum2Sq = y.reduce((a, b) => a + b * b, 0)
    const pSum = x.map((x, i) => x * y[i]).reduce((a, b) => a + b, 0)
    
    const num = pSum - (sum1 * sum2 / n)
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n))
    
    return den === 0 ? 0 : num / den
  }

  private static getNumericFields(data: any[]): string[] {
    const first = data[0]
    return Object.keys(first).filter(key => {
      return data.slice(0, 10).every(item => typeof item[key] === 'number')
    })
  }

  private static generateDescription(
    field1: string, 
    field2: string, 
    correlation: number,
    strength: string,
    direction: string
  ): string {
    const abs = Math.abs(correlation)
    const percentage = (abs * 100).toFixed(0)
    
    if (direction === 'positive') {
      return `There is a ${strength} positive relationship between ${field1} and ${field2} (${percentage}% correlation). As ${field1} increases, ${field2} tends to increase as well.`
    } else {
      return `There is a ${strength} negative relationship between ${field1} and ${field2} (${percentage}% correlation). As ${field1} increases, ${field2} tends to decrease.`
    }
  }
}
