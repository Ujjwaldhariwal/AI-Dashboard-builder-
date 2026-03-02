'use client'

// Module: Modern Gauge Chart — style-layer aware
// src/components/charts/modern-gauge-chart.tsx

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { WidgetStyle, DEFAULT_STYLE } from '@/types/widget'

interface ModernGaugeChartProps {
  value: number
  label?: string
  thresholds?: { warn: number; danger: number }
  style?: WidgetStyle
}

export function ModernGaugeChart({
  value,
  label = 'Score',
  thresholds = { warn: 60, danger: 80 },
  style,
}: ModernGaugeChartProps) {
  const s       = { ...DEFAULT_STYLE, ...style }
  const clamped = Math.min(100, Math.max(0, value))

  // Use style colors for thresholds if provided, else semantic defaults
  const color =
    clamped >= thresholds.danger ? (s.colors[5] ?? '#ef4444')
    : clamped >= thresholds.warn  ? (s.colors[4] ?? '#f59e0b')
    : (s.colors[2] ?? '#10b981')

  const gaugeData = [
    { value: clamped },
    { value: 100 - clamped },
    { value: 100 }, // hidden lower half
  ]

  return (
    <div className="w-full flex flex-col items-center" style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={gaugeData}
            startAngle={180} endAngle={0}
            cx="50%" cy="80%"
            outerRadius={120} innerRadius={78}
            dataKey="value" strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="hsl(var(--muted))" />
            <Cell fill="transparent" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="-mt-12 flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>{clamped.toFixed(0)}%</span>
        <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
      </div>
    </div>
  )
}

export function ModernGaugeChartFromData({
  data, yField, label, style,
}: {
  data: any[]
  yField: string
  label?: string
  style?: WidgetStyle
}) {
  const values     = data.map(d => parseFloat(d[yField])).filter(v => !isNaN(v))
  const avg        = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const max        = Math.max(...values, 1)
  const normalised = (avg / max) * 100

  return <ModernGaugeChart value={normalised} label={label ?? yField} style={style} />
}
