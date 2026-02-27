'use client'
// Component: ModernLineChart

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { CHART_COLORS, getChartHeight } from './chart-registry'

interface ModernLineChartProps {
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

export function ModernLineChart({ data, xField, yField }: ModernLineChartProps) {
  const chartData = data.map((item, i) => ({
    name: String(item[xField] ?? `#${i + 1}`).slice(0, 20),
    value: parseFloat(item[yField]) || 0,
  }))

  const avg =
    chartData.reduce((s, d) => s + d.value, 0) / (chartData.length || 1)

  const h = getChartHeight(chartData.length)

  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 16, left: -8, bottom: chartData.length > 10 ? 60 : 30 }}
        >
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
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
          {/* ✅ Average reference line */}
          <ReferenceLine
            y={avg}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            opacity={0.5}
            label={{ value: 'avg', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={yField}
            stroke={CHART_COLORS[0]}
            strokeWidth={2.5}
            dot={chartData.length < 30 ? { r: 3, fill: CHART_COLORS[0] } : false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
