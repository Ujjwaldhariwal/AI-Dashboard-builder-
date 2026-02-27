'use client'
// Component: ModernPieChart — supports both pie and donut

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CHART_COLORS } from './chart-registry'

interface ModernPieChartProps {
  data: any[]
  nameField: string
  valueField: string
  title?: string
  donut?: boolean // ✅ reuse as donut
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-medium text-foreground">{payload[0].name}</p>
      <p style={{ color: payload[0].payload.fill }}>
        Value: <span className="font-semibold">{payload[0].value}</span>
      </p>
      <p className="text-muted-foreground">
        {(payload[0].payload.percent * 100).toFixed(1)}%
      </p>
    </div>
  )
}

export function ModernPieChart({
  data, nameField, valueField, donut = false,
}: ModernPieChartProps) {
  const isNumericValue =
    data.length > 0 && !isNaN(Number(data[0][valueField]))

  // ✅ If value field isn't numeric, count category frequencies
  const chartData = isNumericValue
    ? (() => {
        const grouped: Record<string, number> = {}
        data.forEach(item => {
          const k = String(item[nameField] ?? 'Unknown').slice(0, 24)
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
          const k = String(item[nameField] ?? 'Unknown').slice(0, 24)
          counts[k] = (counts[k] ?? 0) + 1
        })
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, value]) => ({ name, value }))
      })()

  const outerR = 110
  const innerR = donut ? 55 : 0

  return (
    <div className="w-full" style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            outerRadius={outerR}
            innerRadius={innerR}
            paddingAngle={donut ? 3 : 1}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }) =>
              percent > 0.05 ? `${name.slice(0, 10)} ${(percent * 100).toFixed(0)}%` : ''
            }
            labelLine={chartData.length < 6}
          >
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
