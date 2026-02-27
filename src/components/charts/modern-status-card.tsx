'use client'
// Component: ModernStatusCard — KPI / stat card

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ModernStatusCardProps {
  data: any[]
  yField: string
  label?: string
}

export function ModernStatusCard({ data, yField, label }: ModernStatusCardProps) {
  const values = data
    .map(d => parseFloat(d[yField]))
    .filter(v => !isNaN(v))

  if (!values.length) {
    return (
      <div className="flex items-center justify-center h-[120px]">
        <p className="text-xs text-muted-foreground">No numeric data</p>
      </div>
    )
  }

  const latest = values[values.length - 1]
  const prev = values[values.length - 2] ?? latest
  const change = prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : 0
  const total = values.reduce((a, b) => a + b, 0)
  const avg = total / values.length
  const max = Math.max(...values)
  const min = Math.min(...values)

  const TrendIcon =
    change > 1 ? TrendingUp : change < -1 ? TrendingDown : Minus
  const trendColor =
    change > 1 ? 'text-green-500' : change < -1 ? 'text-red-500' : 'text-muted-foreground'

  return (
    <div className="grid grid-cols-2 gap-3 p-1">
      {/* Latest */}
      <div className="col-span-2 flex items-end justify-between p-3 rounded-xl bg-gradient-to-br from-blue-600/10 to-purple-600/10 border">
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
      {[
        { label: 'Avg', value: avg.toFixed(1) },
        { label: 'Max', value: max.toLocaleString() },
        { label: 'Min', value: min.toLocaleString() },
        { label: 'Total', value: total.toLocaleString() },
      ].map(stat => (
        <div
          key={stat.label}
          className="p-2.5 rounded-lg bg-muted/50 border text-center"
        >
          <p className="text-[10px] text-muted-foreground">{stat.label}</p>
          <p className="text-sm font-semibold mt-0.5">{stat.value}</p>
        </div>
      ))}
    </div>
  )
}
