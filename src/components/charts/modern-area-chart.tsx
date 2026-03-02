'use client'

// Module: Modern Area Chart — style-layer aware
// src/components/charts/modern-area-chart.tsx

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { getChartHeight, getTickInterval, getBottomMargin } from './chart-registry'
import { WidgetStyle, DEFAULT_STYLE } from '@/types/widget'

interface ModernAreaChartProps {
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

export function ModernAreaChart({ data, xField, yField, style }: ModernAreaChartProps) {
  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors
  const gradId = `area-grad-${yField.replace(/\W/g, '')}`

  const chartData = data.map((item, i) => ({
    name:  String(item[xField] ?? `#${i + 1}`).slice(0, 18),
    value: parseFloat(item[yField]) || 0,
  }))

  const h            = getChartHeight(chartData.length)
  const interval     = getTickInterval(chartData.length)
  const bottomMargin = getBottomMargin(chartData.length)
  const rotate       = chartData.length > 8

  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: bottomMargin }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={colors[0]} stopOpacity={0.4} />
              <stop offset="95%" stopColor={colors[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
          <Area
            type="monotone" dataKey="value" name={yField}
            stroke={colors[0]} strokeWidth={2.5}
            fill={`url(#${gradId})`}
            dot={chartData.length < 25 ? { r: 2.5, fill: colors[0], strokeWidth: 0 } : false}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
