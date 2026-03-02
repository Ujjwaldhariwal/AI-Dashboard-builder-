// Module: AlertEngine
interface Alert {
  id: string
  type: 'critical' | 'warning' | 'info'
  title: string
  description: string
  timestamp: Date
  condition: string
  triggeredValue: any
  threshold?: any
  actionable: boolean
  suggestedAction?: string
}

export class AlertEngine {
  static generateAlerts(data: any[], previousData?: any[]): Alert[] {
    const alerts: Alert[] = []

    // Data quality alerts
    alerts.push(...this.checkDataQuality(data))

    // Threshold alerts
    alerts.push(...this.checkThresholds(data))

    // Change detection alerts
    if (previousData) {
      alerts.push(...this.checkChanges(data, previousData))
    }

    // Pattern alerts
    alerts.push(...this.checkPatterns(data))

    return alerts.sort((a, b) => {
      const typeWeight = { critical: 3, warning: 2, info: 1 }
      return typeWeight[b.type] - typeWeight[a.type]
    })
  }

  private static checkDataQuality(data: any[]): Alert[] {
    const alerts: Alert[] = []

    // Check for missing values
    const fields = Object.keys(data[0])
    fields.forEach(field => {
      const nullCount = data.filter(item => item[field] == null).length
      const nullPercentage = (nullCount / data.length) * 100

      if (nullPercentage > 10) {
        alerts.push({
          id: `quality-${field}-${Date.now()}`,
          type: 'warning',
          title: `High Missing Values in ${field}`,
          description: `${nullPercentage.toFixed(1)}% of records have missing values for ${field}. This may affect analysis accuracy.`,
          timestamp: new Date(),
          condition: 'missing_values',
          triggeredValue: `${nullPercentage.toFixed(1)}%`,
          threshold: '10%',
          actionable: true,
          suggestedAction: 'Consider data cleanup or imputation strategies'
        })
      }
    })

    // Check for duplicate records
    const uniqueRecords = new Set(data.map(item => JSON.stringify(item))).size
    const duplicateCount = data.length - uniqueRecords
    
    if (duplicateCount > 0) {
      alerts.push({
        id: `quality-duplicates-${Date.now()}`,
        type: 'warning',
        title: 'Duplicate Records Detected',
        description: `Found ${duplicateCount} duplicate records in your dataset. This may skew your analysis.`,
        timestamp: new Date(),
        condition: 'duplicates',
        triggeredValue: duplicateCount,
        actionable: true,
        suggestedAction: 'Review and remove duplicate entries'
      })
    }

    return alerts
  }

  private static checkThresholds(data: any[]): Alert[] {
    const alerts: Alert[] = []
    const numericFields = Object.keys(data[0]).filter(key => 
      typeof data[0][key] === 'number'
    )

    numericFields.forEach(field => {
      const values = data.map(item => item[field]).filter(v => v != null)
      const max = Math.max(...values)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const stdDev = Math.sqrt(
        values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length
      )

      // Check for extreme values (3 standard deviations)
      const extremeValues = values.filter(v => Math.abs(v - mean) > 3 * stdDev)
      
      if (extremeValues.length > 0) {
        alerts.push({
          id: `threshold-${field}-${Date.now()}`,
          type: 'critical',
          title: `Extreme Values in ${field}`,
          description: `Detected ${extremeValues.length} extreme value(s) that are beyond 3 standard deviations from the mean.`,
          timestamp: new Date(),
          condition: 'extreme_values',
          triggeredValue: extremeValues.length,
          threshold: `±${(3 * stdDev).toFixed(2)}`,
          actionable: true,
          suggestedAction: 'Investigate these outliers for data errors or significant events'
        })
      }
    })

    return alerts
  }

  private static checkChanges(data: any[], previousData: any[]): Alert[] {
    const alerts: Alert[] = []

    // Check for significant size change
    const sizeChange = ((data.length - previousData.length) / previousData.length) * 100
    
    if (Math.abs(sizeChange) > 20) {
      alerts.push({
        id: `change-size-${Date.now()}`,
        type: sizeChange < 0 ? 'critical' : 'warning',
        title: 'Significant Data Volume Change',
        description: `Dataset size changed by ${sizeChange.toFixed(1)}% compared to previous snapshot. ${
          sizeChange > 0 ? 'New records added.' : 'Records removed or missing.'
        }`,
        timestamp: new Date(),
        condition: 'volume_change',
        triggeredValue: `${sizeChange > 0 ? '+' : ''}${sizeChange.toFixed(1)}%`,
        actionable: true,
        suggestedAction: 'Verify data pipeline integrity'
      })
    }

    return alerts
  }

  private static checkPatterns(data: any[]): Alert[] {
    const alerts: Alert[] = []
    
    // Check for monotonic sequences (could indicate test data)
    const numericFields = Object.keys(data[0]).filter(key => 
      typeof data[0][key] === 'number'
    )

    numericFields.forEach(field => {
      const values = data.slice(0, 20).map(item => item[field])
      const isMonotonic = values.every((v, i) => i === 0 || v >= values[i - 1])

      if (isMonotonic && values.length > 10) {
        alerts.push({
          id: `pattern-${field}-${Date.now()}`,
          type: 'info',
          title: `Perfect Sequence in ${field}`,
          description: `Values in ${field} follow a perfect ascending pattern. This might indicate test data or auto-incremented IDs.`,
          timestamp: new Date(),
          condition: 'monotonic_sequence',
          triggeredValue: 'Perfect sequence',
          actionable: false
        })
      }
    })

    return alerts
  }
}
