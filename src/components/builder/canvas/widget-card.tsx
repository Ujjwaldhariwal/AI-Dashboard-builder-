'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Trash2, RefreshCw, AlertCircle, Copy, Maximize2, Minimize2,
  BarChart3, LineChart, PieChart, AreaChart, Table2, Pencil,
} from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { Widget } from '@/types/widget'
import { WidgetEditDialog } from '@/components/builder/widget-edit-dialog'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import {
  BarChart, Bar,
  LineChart as ReLineChart, Line,
  AreaChart as ReAreaChart, Area,
  PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'

interface WidgetCardProps {
  widget: Widget
  viewMode?: boolean
}

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']

const chartTypeIcon: Record<string, any> = {
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  table: Table2,
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

export function WidgetCard({ widget, viewMode = false }: WidgetCardProps) {
  const { endpoints, removeWidget, duplicateWidget } = useDashboardStore()
  const [data, setData] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const endpoint = endpoints.find(e => e.id === widget.endpointId)
  const Icon = chartTypeIcon[widget.type] ?? BarChart3

  const fetchData = async () => {
    if (!endpoint) { setError('Endpoint not found'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(endpoint.url, { method: endpoint.method })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      const result = await res.json()
      const dataArray = Array.isArray(result)
        ? result
        : result.data || result.results || [result]

      setData(
        dataArray.slice(0, 50).map((row: any) => ({
          x: String(row[widget.dataMapping.xAxis] ?? 'N/A'),
          y: Number(row[widget.dataMapping.yAxis]) || 0,
          ...row,
        }))
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [widget.endpointId, widget.dataMapping])

  const renderChart = (height: number | string = 200) => {
    if (!data?.length) return null
    const common = { data, margin: { top: 5, right: 10, left: -20, bottom: 0 } }

    switch (widget.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart {...common}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="y" name={widget.dataMapping.yAxis} fill={COLORS[0]} radius={[4, 4, 0, 0]}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ReLineChart {...common}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="y" stroke={COLORS[0]} strokeWidth={3} dot={{ r: 3, fill: COLORS[0] }} />
            </ReLineChart>
          </ResponsiveContainer>
        )
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ReAreaChart {...common}>
              <defs>
                <linearGradient id={`g-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="y" stroke={COLORS[0]} fill={`url(#g-${widget.id})`} />
            </ReAreaChart>
          </ResponsiveContainer>
        )
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <RePieChart>
              <Pie
                data={data} dataKey="y" nameKey="x"
                cx="50%" cy="50%" outerRadius={height === '100%' ? 120 : 70} innerRadius={height === '100%' ? 60 : 30}
                paddingAngle={3}
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
              >
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend />
            </RePieChart>
          </ResponsiveContainer>
        )
      case 'table':
        return (
          <div className="overflow-auto border rounded-lg w-full" style={{ height: height === '100%' ? '100%' : 200 }}>
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left font-medium">{widget.dataMapping.xAxis}</th>
                  <th className="p-2 text-left font-medium">{widget.dataMapping.yAxis}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/50">
                    <td className="p-2">{String(row.x)}</td>
                    <td className="p-2 font-mono">{String(row.y)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      default: return null
    }
  }

  // ── Fullscreen Modal Content ───────────────────────────────────────────────
  if (fullscreen) {
    return (
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[90vw] h-[80vh] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><Icon className="w-5 h-5 text-primary" /></div>
              <h2 className="text-xl font-bold">{widget.title}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setFullscreen(false)}>
              <Minimize2 className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 w-full">
            {renderChart('100%')}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ── Normal Card ────────────────────────────────────────────────────────────
  return (
    <>
      <Card className="flex flex-col hover:shadow-lg transition-all duration-300 group">
        <CardHeader className="pb-2 px-4 pt-4 flex flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center flex-shrink-0 text-blue-600">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold truncate leading-none mb-1.5">{widget.title}</CardTitle>
              <p className="text-[10px] text-muted-foreground truncate font-mono">
                {endpoint?.name ?? 'No Source'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullscreen(true)}>
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>

            {!viewMode && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateWidget(widget.id)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditOpen(true)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => removeWidget(widget.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-4 flex-1 min-h-[220px] flex flex-col">
          {error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-red-500 gap-2 bg-red-50/50 rounded-xl m-2 border border-red-100">
              <AlertCircle className="w-6 h-6" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          ) : loading ? (
            <div className="space-y-3 pt-4">
              <Skeleton className="h-[140px] w-full rounded-xl" />
              <div className="flex justify-between px-2">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          ) : (
            <div className="flex-1 w-full pt-2">
              {renderChart(200)}
            </div>
          )}
        </CardContent>
      </Card>

      {!viewMode && <WidgetEditDialog widget={widget} open={editOpen} onOpenChange={setEditOpen} />}
    </>
  )
}
