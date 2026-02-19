'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ModernBarChartProps {
  data: any[]
  xField: string
  yField: string
  title?: string
}

export function ModernBarChart({ data, xField, yField, title }: ModernBarChartProps) {
  const chartData = data.slice(0, 15).map((item, index) => ({
    name: String(item[xField] || `Item ${index + 1}`).slice(0, 20),
    value: parseFloat(item[yField]) || 0,
  }))

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
            iconType="square"
          />
          <Bar
            dataKey="value"
            fill="hsl(221.2 83.2% 53.3%)"
            radius={[8, 8, 0, 0]}
            name={yField}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
