export interface TrendInsight {
  trend: 'rising' | 'falling' | 'flat' | 'volatile'
  trendStrength: 'strong' | 'moderate' | 'weak'
  changePercent: number
  average: number
  peak: { value: number; index: number }
  trough: { value: number; index: number }
  prediction: 'likely up' | 'likely down' | 'stable' | 'uncertain'
  anomalies: number[]           // indices of anomalous data points
  summary: string               // human-readable insight sentence
  recommendation: string        // what to do / watch
}

export class TrendAnalyzer {
  static analyze(data: { x: string; y: number }[]): TrendInsight | null {
    if (!data || data.length < 2) return null

    const values = data.map(d => d.y)
    const n = values.length

    // Basic stats
    const average = values.reduce((a, b) => a + b, 0) / n
    const max = Math.max(...values)
    const min = Math.min(...values)
    const peakIdx = values.indexOf(max)
    const troughIdx = values.indexOf(min)

    // Linear regression slope
    const slope = TrendAnalyzer.linearSlope(values)

    // Volatility (std deviation)
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - average, 2), 0) / n
    const stdDev = Math.sqrt(variance)
    const volatilityRatio = stdDev / (average || 1)

    // Change from first to last
    const first = values[0]
    const last = values[n - 1]
    const changePercent =
      first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0

    // Trend type
    let trend: TrendInsight['trend']
    if (volatilityRatio > 0.4) {
      trend = 'volatile'
    } else if (Math.abs(slope) < average * 0.005) {
      trend = 'flat'
    } else if (slope > 0) {
      trend = 'rising'
    } else {
      trend = 'falling'
    }

    // Trend strength
    const absChange = Math.abs(changePercent)
    const trendStrength: TrendInsight['trendStrength'] =
      absChange > 30 ? 'strong' : absChange > 10 ? 'moderate' : 'weak'

    // Anomaly detection (Z-score > 2)
    const anomalies = values.reduce<number[]>((acc, v, i) => {
      if (Math.abs((v - average) / (stdDev || 1)) > 2) acc.push(i)
      return acc
    }, [])

    // Prediction
    let prediction: TrendInsight['prediction']
    if (trend === 'volatile') {
      prediction = 'uncertain'
    } else if (trend === 'flat') {
      prediction = 'stable'
    } else if (trend === 'rising') {
      prediction = slope > average * 0.02 ? 'likely up' : 'likely up'
    } else {
      prediction = 'likely down'
    }

    // Human summary
    const dirWord =
      trend === 'rising'
        ? '📈 upward'
        : trend === 'falling'
        ? '📉 downward'
        : trend === 'volatile'
        ? '⚡ volatile'
        : '➡️ flat'

    const summary = `Data shows a ${trendStrength} ${dirWord} trend. ` +
      `Average: ${average.toFixed(1)}, changed ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}% ` +
      `from start to end.` +
      (anomalies.length > 0
        ? ` ${anomalies.length} anomalous point(s) detected.`
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

  // Simple least-squares slope
  private static linearSlope(values: number[]): number {
    const n = values.length
    const xMean = (n - 1) / 2
    const yMean = values.reduce((a, b) => a + b, 0) / n
    const num = values.reduce((sum, y, x) => sum + (x - xMean) * (y - yMean), 0)
    const den = values.reduce((sum, _, x) => sum + Math.pow(x - xMean, 2), 0)
    return den === 0 ? 0 : num / den
  }
}
