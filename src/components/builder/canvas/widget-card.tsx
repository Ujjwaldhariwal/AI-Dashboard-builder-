'use client'
// Component: WidgetCard

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Trash2, RefreshCw, Loader2, AlertCircle,
  BarChart3, LineChart, PieChart, AreaChart,
  Table2, Pencil, GripVertical, Gauge, TrendingUp,
  AlignLeft,
} from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { Widget } from '@/types/widget'
import { WidgetEditDialog } from '@/components/builder/widget-edit-dialog'
import { toast } from 'sonner'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'

// ── Chart imports ─────────────────────────────────────────────────────────────
import { ModernBarChart } from '@/components/charts/modern-bar-chart'
import { ModernLineChart } from '@/components/charts/modern-line-chart'
import { ModernAreaChart } from '@/components/charts/modern-area-chart'
import { ModernPieChart } from '@/components/charts/modern-pie-chart'
import { ModernGaugeChartFromData } from '@/components/charts/modern-gauge-chart'
import { ModernHorizontalBarChart } from '@/components/charts/modern-horizontal-bar-chart'
import { ModernStatusCard } from '@/components/charts/modern-status-card'

// ── Types ─────────────────────────────────────────────────────────────────────
interface WidgetCardProps {
  widget: Widget
  viewMode?: boolean
}

const chartTypeIcon: Record<string, any> = {
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  donut: PieChart,
  'horizontal-bar': AlignLeft,
  gauge: Gauge,
  'status-card': TrendingUp,
  table: Table2,
}

// ── Component ─────────────────────────────────────────────────────────────────
export function WidgetCard({ widget, viewMode = false }: WidgetCardProps) {
  const { endpoints, removeWidget } = useDashboardStore()
  const [rawData, setRawData] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // DnD
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id })

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : ('auto' as any),
    position: 'relative' as const,
  }

  const endpoint = endpoints.find(e => e.id === widget.endpointId)
  const Icon = chartTypeIcon[widget.type] ?? BarChart3

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    if (!endpoint) { setError('Endpoint not found'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(endpoint.url, { method: endpoint.method })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      const result = await res.json()

      // ✅ Use DataAnalyzer to reliably extract array
      const arr = DataAnalyzer.extractDataArray(result) ?? (Array.isArray(result) ? result : [result])
      setRawData(arr)
    } catch (err: any) {
      setError(err.message)
      toast.error(`Widget "${widget.title}": ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [widget.endpointId, widget.dataMapping.xAxis])

  // ── Self-aware chart renderer ──────────────────────────────────────────────
  const renderChart = () => {
    if (!rawData?.length) return null

    const x = widget.dataMapping.xAxis
    const y = widget.dataMapping.yAxis ?? ''

    switch (widget.type) {
      case 'bar':
        return <ModernBarChart data={rawData} xField={x} yField={y} />

      case 'line':
        return <ModernLineChart data={rawData} xField={x} yField={y} />

      case 'area':
        return <ModernAreaChart data={rawData} xField={x} yField={y} />

      case 'pie':
        return <ModernPieChart data={rawData} nameField={x} valueField={y} />

      case 'donut':
        return <ModernPieChart data={rawData} nameField={x} valueField={y} donut />

      case 'horizontal-bar':
        return <ModernHorizontalBarChart data={rawData} xField={x} yField={y} />

      case 'gauge':
        return <ModernGaugeChartFromData data={rawData} yField={y} label={widget.title} />

      case 'status-card':
        return <ModernStatusCard data={rawData} yField={y} label={widget.title} />

      case 'table': {
        const cols = rawData.length > 0 ? Object.keys(rawData[0]).slice(0, 6) : []
        return (
          <div className="overflow-auto max-h-[300px] rounded-lg border">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted z-10">
                <tr>
                  {cols.map(col => (
                    <th key={col} className="text-left p-2 font-medium border-b text-[11px] whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawData.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/40 transition-colors">
                    {cols.map(col => (
                      <td key={col} className="p-2 text-[11px] max-w-[160px] truncate">
                        {String(row[col] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      default:
        return <p className="text-xs text-muted-foreground">Unknown chart type: {widget.type}</p>
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Card
        ref={setNodeRef}
        style={dragStyle}
        className={`flex flex-col transition-all duration-200 ${
          isDragging
            ? 'shadow-2xl ring-2 ring-blue-500/50 scale-[1.02]'
            : 'hover:shadow-md'
        }`}
      >
        <CardHeader className="pb-2 px-4 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {!viewMode && (
                <button
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0 touch-none"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
              <CardTitle className="text-sm truncate">{widget.title}</CardTitle>
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 mr-1">
                {widget.type.toUpperCase()}
              </Badge>
              {!viewMode && (
                <>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchData} disabled={loading}>
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
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
              {viewMode && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchData} disabled={loading}>
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
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
          {loading && !rawData && (
            <div className="flex items-center justify-center h-[240px]">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && !error && rawData && renderChart()}
          {!loading && !error && rawData?.length === 0 && (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-xs text-muted-foreground">No data returned from endpoint</p>
            </div>
          )}
        </CardContent>
      </Card>

      {!viewMode && (
        <WidgetEditDialog widget={widget} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </>
  )
}
