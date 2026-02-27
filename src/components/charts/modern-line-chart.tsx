'use client'

// Component: ModernLineChart

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ModernLineChartProps {
  data: any[]
  xField: string
  yField: string
  title?: string
}

export function ModernLineChart({ data, xField, yField, title }: ModernLineChartProps) {
  const chartData = data.map((item, index) => ({
    name: item[xField] || `Item ${index + 1}`,
    value: parseFloat(item[yField]) || 0,
  }))

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis 
            dataKey="name" 
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            tickLine={{ stroke: 'hsl(var(--border))' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            tickLine={{ stroke: 'hsl(var(--border))' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '12px' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(221.2 83.2% 53.3%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(221.2 83.2% 53.3%)', r: 4 }}
            activeDot={{ r: 6 }}
            name={yField}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
