'use client'

import {
  PieChart, Pie, Cell, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { CHART_COLORS } from './chart-registry'

interface ModernPieChartProps {
  data: any[]
  nameField: string
  valueField: string
  title?: string
  donut?: boolean
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-medium text-foreground truncate max-w-[160px]">
        {payload[0].name}
      </p>
      <p style={{ color: payload[0].payload.fill }}>
        Value:{' '}
        <span className="font-semibold">
          {payload[0].value?.toLocaleString()}
        </span>
      </p>
      <p className="text-muted-foreground">
        {(payload[0].payload.percent * 100).toFixed(1)}%
      </p>
    </div>
  )
}

// ✅ Custom legend — truncates long names, wraps cleanly
const renderLegend = (props: any) => {
  const { payload } = props
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1 px-2">
      {(payload ?? []).map((entry: any, i: number) => (
        <div
          key={i}
          className="flex items-center gap-1 text-[10px] text-muted-foreground"
        >
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="max-w-[90px] truncate" title={entry.value}>
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ModernPieChart({
  data,
  nameField,
  valueField,
  donut = false,
}: ModernPieChartProps) {
  const isNumericValue =
    data.length > 0 && !isNaN(Number(data[0][valueField]))

  const chartData = isNumericValue
    ? (() => {
        const grouped: Record<string, number> = {}
        data.forEach(item => {
          const k = String(item[nameField] ?? 'Unknown').slice(0, 22)
          grouped[k] = (grouped[k] ?? 0) + (parseFloat(item[valueField]) || 0)
        })
        return Object.entries(grouped)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, value]) => ({ name, value }))
      })()
    : (() => {
        const counts: Record<string, number> = {}
        data.forEach(item => {
          const k = String(item[nameField] ?? 'Unknown').slice(0, 22)
          counts[k] = (counts[k] ?? 0) + 1
        })
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, value]) => ({ name, value }))
      })()

  // Only show % label on slices > 8% to avoid overlap
  const renderLabel = ({ percent }: any) => {
    if (percent < 0.08) return null
    return `${(percent * 100).toFixed(0)}%`
  }

  return (
    <div className="w-full" style={{ height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={chartData}
            cx="50%"
            cy="40%"
            outerRadius="52%"
            innerRadius={donut ? '26%' : 0}
            paddingAngle={donut ? 3 : 1}
            dataKey="value"
            nameKey="name"
            label={renderLabel}
            labelLine={false}
            stroke="hsl(var(--background))"
            strokeWidth={2}
          >
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={renderLegend} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
