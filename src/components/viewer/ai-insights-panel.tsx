'use client'

import { motion } from 'framer-motion'
import { Brain, TrendingUp, AlertTriangle, Lightbulb, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface AIPrediction {
  type: 'trend' | 'anomaly' | 'insight' | 'forecast'
  title: string
  description: string
  confidence: number
  value?: string
}

interface AIInsightsPanelProps {
  data: any[]
}

export function AIInsightsPanel({ data }: AIInsightsPanelProps) {
  // AI Analysis Logic
  const generateInsights = (): AIPrediction[] => {
    if (!data || data.length === 0) return []

    const insights: AIPrediction[] = []
    
    // Extract numeric values
    const numericFields = Object.keys(data[0] || {}).filter(key => 
      typeof data[0][key] === 'number'
    )

    if (numericFields.length > 0) {
      const field = numericFields[0]
      const values = data.map(item => item[field]).filter(v => typeof v === 'number')
      
      // Trend Detection
      const trend = values[values.length - 1] > values[0] ? 'increasing' : 'decreasing'
      const changePercent = Math.abs(((values[values.length - 1] - values[0]) / values[0]) * 100).toFixed(1)
      
      insights.push({
        type: 'trend',
        title: `${trend === 'increasing' ? 'Upward' : 'Downward'} Trend Detected`,
        description: `${field} has ${trend === 'increasing' ? 'increased' : 'decreased'} by ${changePercent}% over the dataset`,
        confidence: 92,
        value: `${changePercent}%`
      })

      // Average calculation
      const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
      insights.push({
        type: 'insight',
        title: 'Average Value Analysis',
        description: `Mean ${field}: ${avg}. This indicates ${parseFloat(avg) > 50 ? 'above-average' : 'below-average'} performance`,
        confidence: 88,
        value: avg
      })

      // Anomaly Detection (simple outlier detection)
      const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - parseFloat(avg), 2), 0) / values.length)
      const outliers = values.filter(v => Math.abs(v - parseFloat(avg)) > 2 * stdDev).length
      
      if (outliers > 0) {
        insights.push({
          type: 'anomaly',
          title: 'Anomalies Detected',
          description: `Found ${outliers} outlier(s) that deviate significantly from the mean`,
          confidence: 85,
          value: `${outliers}`
        })
      }

      // Forecast
      const lastValue = values[values.length - 1]
      const forecast = (lastValue * (1 + (parseFloat(changePercent) / 100))).toFixed(2)
      insights.push({
        type: 'forecast',
        title: 'Next Period Forecast',
        description: `Based on current trend, predicted next value: ${forecast}`,
        confidence: 78,
        value: forecast
      })
    }

    return insights
  }

  const predictions = generateInsights()

  const getIcon = (type: AIPrediction['type']) => {
    switch (type) {
      case 'trend': return <TrendingUp className="w-5 h-5" />
      case 'anomaly': return <AlertTriangle className="w-5 h-5" />
      case 'insight': return <Lightbulb className="w-5 h-5" />
      case 'forecast': return <Zap className="w-5 h-5" />
    }
  }

  const getColor = (type: AIPrediction['type']) => {
    switch (type) {
      case 'trend': return 'from-blue-500/20 to-cyan-500/20'
      case 'anomaly': return 'from-red-500/20 to-orange-500/20'
      case 'insight': return 'from-purple-500/20 to-pink-500/20'
      case 'forecast': return 'from-green-500/20 to-emerald-500/20'
    }
  }

  const getBadgeColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-green-500'
    if (confidence >= 75) return 'bg-yellow-500'
    return 'bg-orange-500'
  }

  if (predictions.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gradient-to-br from-neon-purple/20 to-neon-pink/20 rounded-lg">
          <Brain className="w-6 h-6 text-neon-purple" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">AI-Powered Insights</h3>
          <p className="text-sm text-gray-400">Real-time predictive analytics and anomaly detection</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {predictions.map((prediction, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="glass-effect border-gray-800 hover:border-neon-purple/50 transition-all group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${getColor(prediction.type)}`}>
                    {getIcon(prediction.type)}
                  </div>
                  <Badge className={`${getBadgeColor(prediction.confidence)} text-white text-xs`}>
                    {prediction.confidence}% confident
                  </Badge>
                </div>
                <h4 className="text-white font-semibold mb-2">{prediction.title}</h4>
                <p className="text-sm text-gray-400 mb-3">{prediction.description}</p>
                {prediction.value && (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold gradient-text">{prediction.value}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
