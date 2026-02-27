'use client'
// Component: ModernAreaChart

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { CHART_COLORS, getChartHeight } from './chart-registry'

interface ModernAreaChartProps {
  data: any[]
  xField: string
  yField: string
  title?: string
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-medium mb-1 text-foreground">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} style={{ color: e.color }}>
          {e.name}: <span className="font-semibold">{e.value}</span>
        </p>
      ))}
    </div>
  )
}

export function ModernAreaChart({ data, xField, yField }: ModernAreaChartProps) {
  const chartData = data.map((item, i) => ({
    name: String(item[xField] ?? `#${i + 1}`).slice(0, 20),
    value: parseFloat(item[yField]) || 0,
  }))

  const h = getChartHeight(chartData.length)
  const gradId = `area-grad-${yField.replace(/\W/g, '')}`

  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 16, left: -8, bottom: chartData.length > 10 ? 60 : 30 }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.4} />
              <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="name"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            angle={chartData.length > 8 ? -40 : 0}
            textAnchor={chartData.length > 8 ? 'end' : 'middle'}
            interval={chartData.length > 20 ? Math.floor(chartData.length / 10) : 0}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            name={yField}
            stroke={CHART_COLORS[0]}
            strokeWidth={2.5}
            fill={`url(#${gradId})`}
            dot={chartData.length < 30 ? { r: 2.5, fill: CHART_COLORS[0] } : false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
