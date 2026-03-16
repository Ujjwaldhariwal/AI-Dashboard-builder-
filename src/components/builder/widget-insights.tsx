'use client'

import type { TrendInsight } from '@/lib/ai/trend-analyzer'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Target,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
} from 'lucide-react'

interface WidgetInsightsProps {
  insights: TrendInsight
  xLabel: string
  yLabel: string
  data: { x: string; y: number }[]
}

const trendConfig = {
  rising: {
    icon: TrendingUp,
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    label: 'Rising',
  },
  falling: {
    icon: TrendingDown,
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    label: 'Falling',
  },
  flat: {
    icon: Minus,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    label: 'Stable',
  },
  volatile: {
    icon: Zap,
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
    label: 'Volatile',
  },
}

const predictionConfig = {
  'likely up': { color: 'text-green-600', arrow: 'up' },
  'likely down': { color: 'text-red-600', arrow: 'down' },
  stable: { color: 'text-blue-600', arrow: 'steady' },
  uncertain: { color: 'text-amber-600', arrow: '?' },
}

export function WidgetInsights({ insights, xLabel, yLabel, data }: WidgetInsightsProps) {
  const cfg = trendConfig[insights.trend]
  const TrendIcon = cfg.icon
  const predCfg = predictionConfig[insights.prediction]

  return (
    <div className="space-y-3 pt-2 border-t">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        AI Insights
      </p>
      <p className="text-[10px] text-muted-foreground">
        Based on {xLabel || 'x-axis'} vs {yLabel || 'y-axis'}
      </p>

      <div className={`flex items-center gap-3 p-3 rounded-lg border ${cfg.bg} ${cfg.border}`}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/60 dark:bg-black/20">
          <TrendIcon className={`w-5 h-5 ${cfg.color}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label} Trend</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
              {insights.trendStrength.toUpperCase()}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {insights.changePercent >= 0 ? '+' : ''}
            {insights.changePercent.toFixed(1)}% change overall
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-muted/50 border text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Average</p>
          <p className="text-sm font-bold">{insights.average.toFixed(1)}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Peak</p>
          <p className="text-sm font-bold text-green-600">{insights.peak.value.toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground">at {data[insights.peak.index]?.x ?? 'N/A'}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Trough</p>
          <p className="text-sm font-bold text-red-600">{insights.trough.value.toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground">at {data[insights.trough.index]?.x ?? 'N/A'}</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 border">
        <Target className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1">
          <p className="text-[11px] font-medium">
            Prediction:{' '}
            <span className={`font-bold ${predCfg.color}`}>
              {predCfg.arrow} {insights.prediction}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground">Based on current trajectory</p>
        </div>
      </div>

      {insights.anomalies.length > 0 && (
        <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">
              {insights.anomalies.length} anomaly{insights.anomalies.length > 1 ? 'ies' : ''} detected
            </p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              At: {insights.anomalies.map(i => data[i]?.x ?? `#${i}`).join(', ')}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40 border">
        <Lightbulb className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">{insights.summary}</p>
      </div>

      <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20">
        <ArrowRight className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-medium text-purple-800 dark:text-purple-200">Recommendation</p>
          <p className="text-[11px] text-purple-700 dark:text-purple-300 mt-0.5">{insights.recommendation}</p>
        </div>
      </div>
    </div>
  )
}
