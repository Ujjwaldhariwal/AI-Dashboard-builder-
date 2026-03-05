'use client'

// Module: Widget Card — renders 3-layer chart with style injection
// src/components/builder/canvas/widget-card.tsx

import { useEffect, useState, useCallback } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Trash2, RefreshCw, Loader2, AlertCircle,
  BarChart3, LineChart, PieChart, AreaChart,
  Table2, Pencil, GripVertical, Gauge, TrendingUp,
  AlignLeft, Clock, Wifi, WifiOff, Circle,        // ✅ Circle added
} from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { useMonitoringStore } from '@/store/monitoring-store'
import type { Widget } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { WidgetEditDialog } from '@/components/builder/widget-edit-dialog'
import { toast } from 'sonner'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'

import { ModernBarChart }           from '@/components/charts/modern-bar-chart'
import { ModernLineChart }          from '@/components/charts/modern-line-chart'
import { ModernAreaChart }          from '@/components/charts/modern-area-chart'
import { ModernPieChart }           from '@/components/charts/modern-pie-chart'
import { ModernGaugeChartFromData } from '@/components/charts/modern-gauge-chart'
import { ModernHorizontalBarChart } from '@/components/charts/modern-horizontal-bar-chart'
import { ModernStatusCard }         from '@/components/charts/modern-status-card'

interface WidgetCardProps {
  widget:    Widget
  viewMode?: boolean
}

const chartTypeIcon: Record<string, LucideIcon> = {
  bar:              BarChart3,
  line:             LineChart,
  area:             AreaChart,
  pie:              PieChart,
  donut:            Circle,           // ✅ was PieChart
  'horizontal-bar': AlignLeft,
  gauge:            Gauge,
  'status-card':    TrendingUp,
  table:            Table2,
}

function WidgetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-muted" />
        <div className="h-4 bg-muted rounded w-32" />
        <div className="ml-auto h-4 bg-muted rounded w-12" />
      </div>
      <div className="h-3 bg-muted rounded w-48" />
      <div className="h-[220px] bg-muted rounded-lg mt-2" />
    </div>
  )
}

export function WidgetCard({ widget, viewMode = false }: WidgetCardProps) {
  const { endpoints, removeWidget } = useDashboardStore()
  const { addLog, updateEndpointHealth } = useMonitoringStore()

  const [rawData, setRawData]         = useState<Record<string, unknown>[] | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [editOpen, setEditOpen]       = useState(false)
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [latency, setLatency]         = useState<number | null>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id })

  // ✅ Clean zIndex pattern — no undefined property
  const dragStyle: React.CSSProperties = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.4 : 1,
    position:   'relative',
    ...(isDragging && { zIndex: 50 }),
  }

  // ✅ endpoint resolved INSIDE callback — no stale closure, no refetch loop
  const fetchData = useCallback(async () => {
    const endpoint = endpoints.find(e => e.id === widget.endpointId)

    if (!endpoint) {
      setError('Endpoint not found')
      setLoading(false)
      addLog({
        widgetId:    widget.id,
        widgetTitle: widget.title,
        endpointId:  widget.endpointId,
        endpointUrl: '',
        level:       'error',
        message:     'Endpoint not found in store',
      })
      return
    }

    // ✅ S2-1 — inactive guard
    if (endpoint.status !== 'active') {
      setError(`Endpoint "${endpoint.name}" is inactive`)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const t0 = performance.now()

    try {
      // ✅ S2-1 — auth headers passed
      const res = await fetch(endpoint.url, {
        method:  endpoint.method,
        headers: endpoint.headers ?? {},
      })
      const ms = Math.round(performance.now() - t0)
      setLatency(ms)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const result = await res.json()
      const arr: Record<string, unknown>[] =
        DataAnalyzer.extractDataArray(result) ??
        (Array.isArray(result) ? result : [result])

      setRawData(arr)
      setLastFetched(new Date())

      addLog({
        widgetId:    widget.id,
        widgetTitle: widget.title,
        endpointId:  endpoint.id,
        endpointUrl: endpoint.url,
        level:       ms > 2000 ? 'warn' : 'success',
        message:     ms > 2000
          ? `Slow response: ${ms}ms — ${arr.length} rows`
          : `Fetched ${arr.length} rows in ${ms}ms`,
        latencyMs:  ms,
        statusCode: res.status,
      })

      updateEndpointHealth(endpoint.id, {
        endpointName: endpoint.name,
        url:          endpoint.url,
        status:       ms > 3000 ? 'degraded' : 'healthy',
        latencyMs:    ms,
        successCount: (useMonitoringStore.getState().endpointHealth[endpoint.id]?.successCount ?? 0) + 1,
      })
    } catch (err) {
      const ms      = Math.round(performance.now() - t0)
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      addLog({
        widgetId:    widget.id,
        widgetTitle: widget.title,
        endpointId:  endpoint.id,
        endpointUrl: endpoint.url,
        level:       'error',
        message,
        latencyMs:   ms,
      })
      updateEndpointHealth(endpoint.id, {
        endpointName: endpoint.name,
        url:          endpoint.url,
        status:       'down',
        lastError:    message,
        errorCount:   (useMonitoringStore.getState().endpointHealth[endpoint.id]?.errorCount ?? 0) + 1,
      })
      toast.error(`"${widget.title}": ${message}`)
    } finally {
      setLoading(false)
    }
  }, [
    widget.id, widget.title, widget.endpointId,
    endpoints,                     // ✅ array ref — stable unless store changes
    addLog, updateEndpointHealth,
  ])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const endpoint = endpoints.find(e => e.id === widget.endpointId)
    if (!endpoint?.refreshInterval || endpoint.refreshInterval <= 0) return
    const id = setInterval(fetchData, endpoint.refreshInterval * 1000)
    return () => clearInterval(id)
  }, [endpoints, widget.endpointId, fetchData])

  // ── UI-only endpoint resolution (display name, mapping label) ─
  const endpoint = endpoints.find(e => e.id === widget.endpointId)
  const Icon     = chartTypeIcon[widget.type] ?? BarChart3
  const style    = { ...DEFAULT_STYLE, ...widget.style }

  const renderChart = () => {
    if (!rawData?.length) return null
    const x = widget.dataMapping.xAxis
    const y = widget.dataMapping.yAxis ?? ''

    switch (widget.type) {
      case 'bar':
        return <ModernBarChart data={rawData} xField={x} yField={y} style={style} />
      case 'line':
        return <ModernLineChart data={rawData} xField={x} yField={y} style={style} />
      case 'area':
        return <ModernAreaChart data={rawData} xField={x} yField={y} style={style} />
      case 'pie':
        return <ModernPieChart data={rawData} nameField={x} valueField={y} style={style} />
      case 'donut':
        return <ModernPieChart data={rawData} nameField={x} valueField={y} donut style={style} />
      case 'horizontal-bar':
        return <ModernHorizontalBarChart data={rawData} xField={x} yField={y} style={style} />
      case 'gauge':
        return <ModernGaugeChartFromData data={rawData} yField={y} label={widget.title} style={style} />
      case 'status-card':
        return <ModernStatusCard data={rawData} yField={y} label={widget.title} style={style} />
      case 'table': {
        const cols = Object.keys(rawData[0]).slice(0, 6)
        return (
          <div className="overflow-auto max-h-[300px] rounded-lg border">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted z-10">
                <tr>
                  {cols.map(col => (
                    <th
                      key={col}
                      className="text-left p-2 font-medium border-b text-[11px] whitespace-nowrap"
                    >
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
        return (
          <p className="text-xs text-muted-foreground">
            Unknown chart type: {widget.type}
          </p>
        )
    }
  }

  const healthColor =
    error                        ? 'text-red-500'
    : latency && latency > 2000  ? 'text-amber-500'
    : 'text-green-500'

  const RefreshButton = (
    <Button
      variant="ghost" size="icon" className="h-6 w-6"
      onClick={fetchData} disabled={loading}
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <RefreshCw className="w-3 h-3" />
      }
    </Button>
  )

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
                  {...attributes} {...listeners}
                  className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0 touch-none"
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
              {error
                ? <WifiOff className={`w-3 h-3 ${healthColor} mr-1`} />
                : <Wifi    className={`w-3 h-3 ${healthColor} mr-1`} />
              }
              {!viewMode && (
                <>
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  {RefreshButton}
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 text-red-500 hover:text-red-700"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </>
              )}
              {viewMode && RefreshButton}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] text-muted-foreground truncate flex-1">
              {endpoint?.name ?? 'Unknown'} · {widget.dataMapping.xAxis}
              {widget.dataMapping.yAxis ? ` → ${widget.dataMapping.yAxis}` : ''}
            </p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {latency !== null && (
                <span className={`text-[10px] font-mono ${latency > 2000 ? 'text-amber-500' : 'text-green-600'}`}>
                  {latency}ms
                </span>
              )}
              {lastFetched && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {lastFetched.toLocaleTimeString([], {
                    hour:   '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-4 flex-1">
          {loading && !rawData && <WidgetSkeleton />}

          {error && (
            <div className="flex flex-col items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700 dark:text-red-400">{error}</p>
              </div>
              <Button
                variant="outline" size="sm"
                className="h-6 text-[11px] border-red-300 text-red-600 hover:bg-red-50"
                onClick={fetchData}
                disabled={loading}
              >
                {loading
                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  : <RefreshCw className="w-3 h-3 mr-1" />
                }
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && rawData && renderChart()}

          {!loading && !error && rawData?.length === 0 && (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-xs text-muted-foreground">No data returned</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={(v: boolean) => !v && setDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{widget.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This widget will be permanently removed from the dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                removeWidget(widget.id)
                toast.success('Widget removed')
                setDeleteOpen(false)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!viewMode && (
        <WidgetEditDialog widget={widget} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </>
  )
}
