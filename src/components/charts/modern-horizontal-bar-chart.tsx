'use client'
// Component: ModernHorizontalBarChart

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { CHART_COLORS, getChartHeight } from './chart-registry'

interface Props {
  data: any[]
  xField: string
  yField: string
  stacked?: boolean
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-medium mb-1 text-foreground">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} style={{ color: e.fill }}>
          {e.name}: <span className="font-semibold">{e.value}</span>
        </p>
      ))}
    </div>
  )
}

export function ModernHorizontalBarChart({ data, xField, yField, stacked = false }: Props) {
  const isNumeric = data.length > 0 && !isNaN(Number(data[0][yField]))

  const chartData = isNumeric
    ? data.slice(0, 25).map((item, i) => ({
        name: String(item[xField] ?? `#${i}`).slice(0, 24),
        value: parseFloat(item[yField]) || 0,
      }))
    : (() => {
        const counts: Record<string, number> = {}
        data.forEach(item => {
          const k = String(item[xField] ?? 'Unknown').slice(0, 24)
          counts[k] = (counts[k] ?? 0) + 1
        })
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([name, value]) => ({ name, value }))
      })()

  const h = getChartHeight(chartData.length)

  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            type="number"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" name={yField} radius={[0, 6, 6, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
