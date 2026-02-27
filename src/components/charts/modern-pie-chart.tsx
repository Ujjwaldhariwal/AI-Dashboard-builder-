'use client'

// Component: ModernPieChart

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ModernPieChartProps {
  data: any[]
  nameField: string
  valueField: string
  title?: string
}

const COLORS = [
  'hsl(221.2 83.2% 53.3%)',
  'hsl(262.1 83.3% 57.8%)',
  'hsl(142.1 76.2% 36.3%)',
  'hsl(346.8 77.2% 49.8%)',
  'hsl(24.6 95% 53.1%)',
  'hsl(199.9 89.2% 48.4%)',
]

export function ModernPieChart({ data, nameField, valueField, title }: ModernPieChartProps) {
  // Group data and get top 6
  const groupedData = data.reduce((acc, item) => {
    const name = String(item[nameField] || 'Unknown')
    const value = parseFloat(item[valueField]) || 1
    
    if (!acc[name]) {
      acc[name] = 0
    }
    acc[name] += value
    return acc
  }, {} as Record<string, number>)

  const chartData = (Object.entries(groupedData) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({
      name: name.slice(0, 20),
      value,
    }))

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '12px' }}
            iconType="circle"
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
