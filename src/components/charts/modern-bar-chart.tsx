// Module: Modern Bar Chart — style-layer aware
// src/components/charts/modern-bar-chart.tsx
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { getChartHeight, getTickInterval, getBottomMargin } from './chart-registry'
import { WidgetStyle, DEFAULT_STYLE } from '@/types/widget'

interface ModernBarChartProps {
  data: any[]
  xField: string
  yField: string
  title?: string
  style?: WidgetStyle  // ← Layer 3 injected here
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
        <p key={i} style={{ color: e.fill }}>
          {e.name}: <span className="font-semibold">{e.value?.toLocaleString()}</span>
        </p>
      ))}
    </div>
  )
}

export function ModernBarChart({ data, xField, yField, style }: ModernBarChartProps) {
  const s = { ...DEFAULT_STYLE, ...style }  // merge with defaults
  const colors = s.colors

  const isNumeric = data.length > 0 && !isNaN(Number(data[0][yField]))

  const chartData = isNumeric
    ? data.slice(0, 30).map((item, i) => ({
        name: String(item[xField] ?? `#${i + 1}`).slice(0, 18),
        value: parseFloat(item[yField]) || 0,
      }))
    : (() => {
        const counts: Record<string, number> = {}
        data.forEach(item => {
          const k = String(item[xField] ?? 'Unknown').slice(0, 18)
          counts[k] = (counts[k] ?? 0) + 1
        })
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([name, value]) => ({ name, value }))
      })()

  const h            = getChartHeight(chartData.length)
  const interval     = getTickInterval(chartData.length)
  const bottomMargin = getBottomMargin(chartData.length)
  const rotate       = chartData.length > 8

  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 12, left: 0, bottom: bottomMargin }}
          barCategoryGap="30%"
        >
          {s.showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.4}
              vertical={false}
            />
          )}
          <XAxis
            dataKey="name"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: chartData.length > 15 ? 10 : 11 }}
            tickLine={false}
            axisLine={false}
            angle={rotate ? -35 : 0}
            textAnchor={rotate ? 'end' : 'middle'}
            interval={interval}
            tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 12) + '…' : v}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
          />
          <Tooltip
            content={<CustomTooltip style={s} />}
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
          />
          {s.showLegend && (
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="square" iconSize={8} />
          )}
          <Bar dataKey="value" name={yField} radius={[s.barRadius ?? 5, s.barRadius ?? 5, 0, 0]} maxBarSize={48}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
