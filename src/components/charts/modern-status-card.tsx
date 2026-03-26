'use client'

// Module: Modern Status Card — style-layer aware
// src/components/charts/modern-status-card.tsx

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'

interface ModernStatusCardProps {
  data:   Record<string, unknown>[]  // ← Fix #5
  yField: string
  label?: string
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
}

export function ModernStatusCard({ data, yField, label, style }: ModernStatusCardProps) {
  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors

  // ← Fix #5 — safe string coerce before parseFloat
  const values = data
    .map(d => parseFloat(String(d[yField])))
    .filter(v => !isNaN(v))

  if (!values.length) {
    return (
      <div className="flex items-center justify-center h-full min-h-0">
        <p className="text-xs text-muted-foreground">No numeric data</p>
      </div>
    )
  }

  const latest = values[values.length - 1]
  const prev   = values[values.length - 2] ?? latest
  const change = prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : 0
  const total  = values.reduce((a, b) => a + b, 0)
  const avg    = total / values.length
  const max    = Math.max(...values)
  const min    = Math.min(...values)

  const TrendIcon  = change > 1 ? TrendingUp : change < -1 ? TrendingDown : Minus
  const trendColor = change > 1
    ? 'text-green-500'
    : change < -1
    ? 'text-red-500'
    : 'text-muted-foreground'

  const stats = [
    { label: 'Avg',   value: avg.toFixed(1)        },
    { label: 'Max',   value: max.toLocaleString()   },
    { label: 'Min',   value: min.toLocaleString()   },
    { label: 'Total', value: total.toLocaleString() },
  ]

  return (
    <div className="h-full min-h-0 grid grid-cols-2 gap-3 p-1">
      {/* Latest value */}
      <div
        className="col-span-2 flex items-end justify-between p-3 rounded-xl border"
        style={{ background: `linear-gradient(135deg, ${colors[0]}18, ${colors[1]}18)` }}
      >
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{label ?? yField}</p>
          <p className="text-3xl font-bold">{latest.toLocaleString()}</p>
        </div>
        <div className={`flex items-center gap-1 text-sm font-semibold ${trendColor}`}>
          <TrendIcon className="w-4 h-4" />
          {Math.abs(change).toFixed(1)}%
        </div>
      </div>

      {/* Stats row */}
      {stats.map(stat => (
        <div key={stat.label} className="p-2.5 rounded-lg bg-muted/50 border text-center">
          <p className="text-[10px] text-muted-foreground">{stat.label}</p>
          <p className="text-sm font-semibold mt-0.5">{stat.value}</p>
        </div>
      ))}
    </div>
  )
}
