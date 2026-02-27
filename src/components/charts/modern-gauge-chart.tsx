'use client'
// Component: ModernGaugeChart

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

interface ModernGaugeChartProps {
  value: number      // 0–100
  label?: string
  thresholds?: { warn: number; danger: number } // defaults 60/80
}

export function ModernGaugeChart({
  value,
  label = 'Score',
  thresholds = { warn: 60, danger: 80 },
}: ModernGaugeChartProps) {
  const clamped = Math.min(100, Math.max(0, value))
  const color =
    clamped >= thresholds.danger
      ? '#ef4444'
      : clamped >= thresholds.warn
      ? '#f59e0b'
      : '#10b981'

  // Half-donut trick: total=200, filled=clamped, filler=100-clamped, hidden=100
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
            startAngle={180}
            endAngle={0}
            cx="50%"
            cy="80%"
            outerRadius={120}
            innerRadius={78}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="hsl(var(--muted))" />
            <Cell fill="transparent" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="-mt-12 flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {clamped.toFixed(0)}%
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
      </div>
    </div>
  )
}

/** Wraps a raw data array into a GaugeChart by averaging the yField */
export function ModernGaugeChartFromData({
  data,
  yField,
  label,
}: {
  data: any[]
  yField: string
  label?: string
}) {
  const values = data
    .map(d => parseFloat(d[yField]))
    .filter(v => !isNaN(v))
  const avg = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0

  // Normalise to 0-100 based on max
  const max = Math.max(...values, 1)
  const normalised = (avg / max) * 100

  return <ModernGaugeChart value={normalised} label={label ?? yField} />
}
