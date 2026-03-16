export interface TrendInsight {
  trend: 'rising' | 'falling' | 'flat' | 'volatile'
  trendStrength: 'strong' | 'moderate' | 'weak'
  changePercent: number
  average: number
  peak: { value: number; index: number }
  trough: { value: number; index: number }
  prediction: 'likely up' | 'likely down' | 'stable' | 'uncertain'
  anomalies: number[]
  summary: string
  recommendation: string
}

export class TrendAnalyzer {
  static analyze(data: { x: string; y: number }[]): TrendInsight | null {
    if (!data || data.length < 2) return null

    const values = data.map(d => d.y)
    const n = values.length

    const average = values.reduce((a, b) => a + b, 0) / n
    const max = Math.max(...values)
    const min = Math.min(...values)
    const peakIdx = values.indexOf(max)
    const troughIdx = values.indexOf(min)

    const slope = TrendAnalyzer.linearSlope(values)

    const variance = values.reduce((sum, v) => sum + (v - average) ** 2, 0) / n
    const stdDev = Math.sqrt(variance)
    const volatilityRatio = stdDev / (Math.abs(average) || 1)

    const first = values[0]
    const last = values[n - 1]
    const changePercent = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0

    let trend: TrendInsight['trend']
    if (volatilityRatio > 0.4) {
      trend = 'volatile'
    } else if (Math.abs(slope) < Math.abs(average) * 0.005) {
      trend = 'flat'
    } else if (slope > 0) {
      trend = 'rising'
    } else {
      trend = 'falling'
    }

    const absChange = Math.abs(changePercent)
    const trendStrength: TrendInsight['trendStrength'] =
      absChange > 30 ? 'strong' : absChange > 10 ? 'moderate' : 'weak'

    const anomalies = values.reduce<number[]>((acc, v, i) => {
      if (Math.abs((v - average) / (stdDev || 1)) > 2) acc.push(i)
      return acc
    }, [])

    let prediction: TrendInsight['prediction']
    if (trend === 'volatile') {
      prediction = 'uncertain'
    } else if (trend === 'flat') {
      prediction = 'stable'
    } else if (trend === 'rising') {
      prediction = 'likely up'
    } else {
      prediction = 'likely down'
    }

    const directionLabel =
      trend === 'rising'
        ? 'upward'
        : trend === 'falling'
          ? 'downward'
          : trend === 'volatile'
            ? 'volatile'
            : 'flat'

    const summary =
      `Data shows a ${trendStrength} ${directionLabel} trend. ` +
      `Average ${average.toFixed(1)}, ` +
      `change ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}% from start to end.` +
      (anomalies.length > 0
        ? ` ${anomalies.length} anomaly point(s) detected.`
        : ' No anomalies detected.')

    const recommendation =
      trend === 'rising'
        ? 'Trend is positive. Monitor for plateauing or sudden drops.'
        : trend === 'falling'
          ? 'Declining trend. Investigate root cause before it worsens.'
          : trend === 'volatile'
            ? 'High variability detected. Consider stabilizing the data source.'
            : 'Stable data. Good baseline for benchmarking.'

    return {
      trend,
      trendStrength,
      changePercent,
      average,
      peak: { value: max, index: peakIdx },
      trough: { value: min, index: troughIdx },
      prediction,
      anomalies,
      summary,
      recommendation,
    }
  }

  private static linearSlope(values: number[]): number {
    const n = values.length
    const xMean = (n - 1) / 2
    const yMean = values.reduce((a, b) => a + b, 0) / n
    const num = values.reduce((sum, y, x) => sum + (x - xMean) * (y - yMean), 0)
    const den = values.reduce((sum, _, x) => sum + (x - xMean) ** 2, 0)
    return den === 0 ? 0 : num / den
  }
}
