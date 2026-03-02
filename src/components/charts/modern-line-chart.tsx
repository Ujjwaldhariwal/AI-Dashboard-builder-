'use client'

// Module: Modern Line Chart — style-layer aware
// src/components/charts/modern-line-chart.tsx

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { getChartHeight, getTickInterval, getBottomMargin } from './chart-registry'
import { WidgetStyle, DEFAULT_STYLE } from '@/types/widget'

interface ModernLineChartProps {
  data: any[]
  xField: string
  yField: string
  title?: string
  style?: WidgetStyle
}

const CustomTooltip = ({ active, payload, label, style }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="border rounded-lg shadow-lg p-2.5 text-xs max-w-[200px]"
      style={{
        background: style?.tooltipBg ?? 'hsl(var(--card))',
        borderColor: style?.tooltipBorder ?? 'hsl(var(--border))',
      }}
    >
      <p className="font-medium mb-1 text-foreground truncate">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} style={{ color: e.stroke }}>
          {e.name}: <span className="font-semibold">{e.value?.toLocaleString()}</span>
        </p>
      ))}
    </div>
  )
}

export function ModernLineChart({ data, xField, yField, style }: ModernLineChartProps) {
  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors

  const chartData = data.map((item, i) => ({
    name:  String(item[xField] ?? `#${i + 1}`).slice(0, 18),
    value: parseFloat(item[yField]) || 0,
  }))

  const avg          = chartData.reduce((sum, d) => sum + d.value, 0) / (chartData.length || 1)
  const h            = getChartHeight(chartData.length)
  const interval     = getTickInterval(chartData.length)
  const bottomMargin = getBottomMargin(chartData.length)
  const rotate       = chartData.length > 8

  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: bottomMargin }}>
          {s.showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
          )}
          <XAxis
            dataKey="name"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: chartData.length > 15 ? 10 : 11 }}
            tickLine={false} axisLine={false}
            angle={rotate ? -35 : 0}
            textAnchor={rotate ? 'end' : 'middle'}
            interval={interval}
            tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 12) + '…' : v}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false} axisLine={false} width={40}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
          />
          <Tooltip content={<CustomTooltip style={s} />} />
          {s.showLegend && (
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" iconSize={16} />
          )}
          <ReferenceLine
            y={avg}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4" opacity={0.4}
            label={{ value: 'avg', fill: 'hsl(var(--muted-foreground))', fontSize: 9, position: 'right' }}
          />
          <Line
            type="monotone" dataKey="value" name={yField}
            stroke={colors[0]} strokeWidth={2.5}
            dot={chartData.length < 25 ? { r: 3, fill: colors[0], strokeWidth: 0 } : false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
