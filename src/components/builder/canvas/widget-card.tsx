'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, RefreshCw, Loader2, AlertCircle, BarChart3, LineChart, PieChart, AreaChart, Table2 } from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { Widget } from '@/types/widget'
import { toast } from 'sonner'
import {
  BarChart, Bar,
  LineChart as ReLineChart, Line,
  AreaChart as ReAreaChart, Area,
  PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface WidgetCardProps {
  widget: Widget
}

const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
]

const chartTypeIcon: Record<string, any> = {
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  table: Table2,
}

export function WidgetCard({ widget }: WidgetCardProps) {
  const { endpoints, removeWidget } = useDashboardStore()
  const [data, setData] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const endpoint = endpoints.find(e => e.id === widget.endpointId)
  const Icon = chartTypeIcon[widget.type] ?? BarChart3

  const fetchData = async () => {
    if (!endpoint) {
      setError('Endpoint not found')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(endpoint.url, { method: endpoint.method })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const result = await res.json()
      const dataArray = Array.isArray(result)
        ? result
        : result.data || result.results || [result]

      // Map to xAxis/yAxis keys
      const mapped = dataArray.slice(0, 20).map((row: any) => ({
        x: row[widget.dataMapping.xAxis],
        y: Number(row[widget.dataMapping.yAxis]) || 0,
        // Keep original for table view
        ...row,
      }))

      setData(mapped)
    } catch (err: any) {
      setError(err.message)
      toast.error(`Widget "${widget.title}": ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch on mount
  useEffect(() => {
    fetchData()
  }, [widget.endpointId])

  const renderChart = () => {
    if (!data || data.length === 0) return null

    const commonProps = {
      data,
      margin: { top: 4, right: 8, left: -16, bottom: 0 },
    }

    switch (widget.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="y" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <ReLineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="y"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={false}
              />
            </ReLineChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <ReAreaChart {...commonProps}>
              <defs>
                <linearGradient id={`gradient-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="y"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                fill={`url(#gradient-${widget.id})`}
              />
            </ReAreaChart>
          </ResponsiveContainer>
        )

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <RePieChart>
              <Pie
                data={data.slice(0, 6)}
                dataKey="y"
                nameKey="x"
                cx="50%"
                cy="50%"
                outerRadius={75}
                label={({ name, percent }) =>
                  `${String(name).slice(0, 6)} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.slice(0, 6).map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} />
            </RePieChart>
          </ResponsiveContainer>
        )

      case 'table':
        return (
          <div className="overflow-auto max-h-[200px] border rounded-lg">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="text-left p-2 font-medium border-b">
                    {widget.dataMapping.xAxis}
                  </th>
                  <th className="text-left p-2 font-medium border-b">
                    {widget.dataMapping.yAxis}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="p-2 text-[11px]">{String(row.x ?? 'N/A')}</td>
                    <td className="p-2 text-[11px]">{String(row.y ?? 'N/A')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      {/* Header */}
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Icon className="w-3.5 h-3.5 text-white" />
            </div>
            <CardTitle className="text-sm truncate">{widget.title}</CardTitle>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {widget.type.toUpperCase()}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={fetchData}
              disabled={loading}
            >
              {loading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />
              }
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-red-500 hover:text-red-700"
              onClick={() => {
                if (confirm(`Delete "${widget.title}"?`)) {
                  removeWidget(widget.id)
                  toast.success('Widget removed')
                }
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        {/* Endpoint tag */}
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {endpoint?.name ?? 'Unknown source'} ·{' '}
          {widget.dataMapping.xAxis} → {widget.dataMapping.yAxis}
        </p>
      </CardHeader>

      {/* Chart / Error / Empty */}
      <CardContent className="px-4 pb-4 flex-1">
        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center h-[200px]">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && !error && data && renderChart()}

        {!loading && !error && data?.length === 0 && (
          <div className="flex items-center justify-center h-[200px]">
            <p className="text-xs text-muted-foreground">No data returned</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
