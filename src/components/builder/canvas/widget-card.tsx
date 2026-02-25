'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Trash2, RefreshCw, Loader2, AlertCircle,
  BarChart3, LineChart, PieChart, AreaChart, Table2, Pencil,
} from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { Widget } from '@/types/widget'
import { WidgetEditDialog } from '@/components/builder/widget-edit-dialog'
import { toast } from 'sonner'
import {
  BarChart, Bar,
  LineChart as ReLineChart, Line,
  AreaChart as ReAreaChart, Area,
  PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

interface WidgetCardProps {
  widget: Widget
  viewMode?: boolean  // ← true = viewer page: hides edit/delete/refresh buttons
}

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']

const chartTypeIcon: Record<string, any> = {
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  table: Table2,
}

// ── Custom tooltip ───────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

export function WidgetCard({ widget, viewMode = false }: WidgetCardProps) {
  const { endpoints, removeWidget } = useDashboardStore()
  const [data, setData] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

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
        dataArray.slice(0, 20).map((row: any) => ({
          x: String(row[widget.dataMapping.xAxis] ?? 'N/A'),
          y: Number(row[widget.dataMapping.yAxis]) || 0,
          ...row,
        }))
      )
    } catch (err: any) {
      setError(err.message)
      toast.error(`Widget "${widget.title}": ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [widget.endpointId, widget.dataMapping])

  // ── Chart renders ──────────────────────────────────────────────────────────

  const renderChart = () => {
    if (!data?.length) return null

    const common = { data, margin: { top: 4, right: 8, left: -16, bottom: 0 } }

    switch (widget.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={200}>
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
          <ResponsiveContainer width="100%" height={200}>
            <ReLineChart {...common}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone" dataKey="y"
                name={widget.dataMapping.yAxis}
                stroke={COLORS[0]} strokeWidth={2.5}
                dot={{ r: 3, fill: COLORS[0] }}
                activeDot={{ r: 5 }}
              />
            </ReLineChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <ReAreaChart {...common}>
              <defs>
                <linearGradient id={`g-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone" dataKey="y"
                name={widget.dataMapping.yAxis}
                stroke={COLORS[0]} strokeWidth={2.5}
                fill={`url(#g-${widget.id})`}
              />
            </ReAreaChart>
          </ResponsiveContainer>
        )

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={200}>
            <RePieChart>
              <Pie
                data={data.slice(0, 6)} dataKey="y" nameKey="x"
                cx="50%" cy="50%" outerRadius={70} innerRadius={30}
                paddingAngle={3}
                label={({ name, percent }) =>
                  `${String(name).slice(0, 8)} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.slice(0, 6).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            </RePieChart>
          </ResponsiveContainer>
        )

      case 'table':
        return (
          <div className="overflow-auto max-h-[200px] border rounded-lg">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted z-10">
                <tr>
                  <th className="text-left p-2 font-medium border-b text-[11px]">
                    {widget.dataMapping.xAxis}
                  </th>
                  <th className="text-left p-2 font-medium border-b text-[11px]">
                    {widget.dataMapping.yAxis}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/40 transition-colors">
                    <td className="p-2 text-[11px]">{String(row.x ?? 'N/A')}</td>
                    <td className="p-2 text-[11px] font-medium">{String(row.y ?? 'N/A')}</td>
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Card className="flex flex-col hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-2 px-4 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
              <CardTitle className="text-sm truncate">{widget.title}</CardTitle>
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 mr-1">
                {widget.type.toUpperCase()}
              </Badge>

              {/* ── Action buttons: hidden in viewMode ── */}
              {!viewMode && (
                <>
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
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
                    variant="ghost" size="icon"
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
                </>
              )}

              {/* ── viewMode: just show refresh quietly ── */}
              {viewMode && (
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={fetchData}
                  disabled={loading}
                >
                  {loading
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <RefreshCw className="w-3 h-3" />
                  }
                </Button>
              )}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {endpoint?.name ?? 'Unknown source'} · {widget.dataMapping.xAxis} → {widget.dataMapping.yAxis}
          </p>
        </CardHeader>

        <CardContent className="px-4 pb-4 flex-1">
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50/50">
              <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-700">{error}</p>
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

      {/* Edit Dialog — never rendered in viewMode */}
      {!viewMode && (
        <WidgetEditDialog
          widget={widget}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </>
  )
}
