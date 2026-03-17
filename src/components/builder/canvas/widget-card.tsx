'use client'

// src/components/builder/canvas/widget-card.tsx

import { useEffect, useState, useCallback, useMemo } from 'react'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Trash2, RefreshCw, Loader2, AlertCircle,
  BarChart3, LineChart, PieChart, AreaChart,
  Table2, Pencil, GripVertical, Gauge, TrendingUp,
  AlignLeft, Clock, Wifi, WifiOff, Circle,
  Maximize2, Shrink,
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
import { WidgetInsights } from '@/components/builder/widget-insights'
import { TrendAnalyzer } from '@/lib/ai/trend-analyzer'
import {
  DASHBOARD_WIDGET_REFRESH_EVENT,
  type DashboardWidgetRefreshDetail,
} from '@/lib/builder/widget-refresh-events'
import {
  fetchEndpointPayloadWithCache,
  getEndpointFetchErrorDetails,
  getEndpointSessionScope,
} from '@/lib/api/endpoint-runtime-cache'
import {
  getWidgetCardHeightClass,
  getWidgetSizeFromPreset,
  getWidgetSizePreset,
  WIDGET_SIZE_LABEL,
  type WidgetSizePreset,
} from '@/lib/builder/widget-size'

import { ModernBarChart }           from '@/components/charts/modern-bar-chart'
import { ModernLineChart }          from '@/components/charts/modern-line-chart'
import { ModernAreaChart }          from '@/components/charts/modern-area-chart'
import { ModernPieChart }           from '@/components/charts/modern-pie-chart'
import { ModernGaugeChartFromData } from '@/components/charts/modern-gauge-chart'
import { ModernHorizontalBarChart } from '@/components/charts/modern-horizontal-bar-chart'
import { ModernHorizontalStackedBarChart } from '@/components/charts/modern-horizontal-stacked-bar-chart'
import { ModernGroupedBarChart } from '@/components/charts/modern-grouped-bar-chart'
import { ModernDrilldownBarChart } from '@/components/charts/modern-drilldown-bar-chart'
import { ModernRingGaugeChartFromData } from '@/components/charts/modern-ring-gauge-chart'
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
  donut:            Circle,
  'horizontal-bar': AlignLeft,
  'horizontal-stacked-bar': AlignLeft,
  'grouped-bar':    BarChart3,
  'drilldown-bar':  BarChart3,
  gauge:            Gauge,
  'ring-gauge':     Gauge,
  'status-card':    TrendingUp,
  table:            Table2,
}

function applyAliasesToRow(
  row: Record<string, unknown>,
  aliases: Record<string, string>,
): Record<string, unknown> {
  if (!Object.keys(aliases).length) return row
  const renamed: Record<string, unknown> = {}
  Object.entries(row).forEach(([key, value]) => {
    const mapped = aliases[key]
    renamed[mapped ?? key] = value
  })
  return renamed
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

function DataTableView({
  rows,
  limit = 50,
  maxHeight = 'max-h-[320px]',
}: {
  rows: Record<string, unknown>[]
  limit?: number
  maxHeight?: string
}) {
  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-[220px] text-xs text-muted-foreground">
        No tabular rows available
      </div>
    )
  }

  const cols = Object.keys(rows[0]).slice(0, 8)
  return (
    <div className={`overflow-auto ${maxHeight} rounded-lg border bg-background/80`}>
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
          {rows.slice(0, limit).map((row, index) => (
            <tr key={index} className="border-b hover:bg-muted/40 transition-colors">
              {cols.map(col => (
                <td key={col} className="p-2 text-[11px] max-w-[220px] truncate">
                  {String(row[col] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function WidgetCard({ widget, viewMode = false }: WidgetCardProps) {
  const { endpoints, removeWidget, updateWidget } = useDashboardStore()
  const { addLog, updateEndpointHealth } = useMonitoringStore()

  const [rawData, setRawData]         = useState<Record<string, unknown>[] | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [editOpen, setEditOpen]       = useState(false)
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [latency, setLatency]         = useState<number | null>(null)
  const [expandedOpen, setExpandedOpen] = useState(false)
  const [activeView, setActiveView] = useState<'chart' | 'table'>(
    widget.type === 'table' ? 'table' : 'chart',
  )
  const [cacheInfo, setCacheInfo] = useState<{ fromCache: boolean; cacheAgeMs: number }>({
    fromCache: false,
    cacheAgeMs: 0,
  })

  useEffect(() => {
    if (widget.type === 'table') {
      setActiveView('table')
    }
  }, [widget.type])

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id })

  const dragStyle: React.CSSProperties = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.4 : 1,
    position:   'relative',
    ...(isDragging && { zIndex: 50 }),
  }

  const fetchData = useCallback(async (options: { force?: boolean } = {}) => {
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

    if (endpoint.status !== 'active') {
      setError(`Endpoint "${endpoint.name}" is inactive`)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const t0 = performance.now()

    try {
      const { value, fromCache, cacheAgeMs } = await fetchEndpointPayloadWithCache(
        {
          id: endpoint.id,
          name: endpoint.name,
          url: endpoint.url,
          method: endpoint.method,
          headers: endpoint.headers,
          body: endpoint.body,
          status: endpoint.status,
        },
        {
          force: options.force ?? false,
          sessionScope: getEndpointSessionScope(),
        },
      )

      const ms = Math.round(performance.now() - t0)
      setLatency(ms)
      setCacheInfo({ fromCache, cacheAgeMs })

      const result = value.payload
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
        message: fromCache
          ? `Loaded ${arr.length} rows from cache (${Math.round(cacheAgeMs / 1000)}s old)`
          : ms > 2000
            ? `Slow response: ${ms}ms - ${arr.length} rows`
            : `Fetched ${arr.length} rows in ${ms}ms`,
        latencyMs:  ms,
        statusCode: value.statusCode,
      })

      updateEndpointHealth(endpoint.id, {
        endpointName: endpoint.name,
        url:          endpoint.url,
        status:       ms > 3000 ? 'degraded' : 'healthy',
        latencyMs:    ms,
        successCount: (useMonitoringStore.getState().endpointHealth[endpoint.id]?.successCount ?? 0) + 1,
      })
    } catch (err) {
      const ms = Math.round(performance.now() - t0)
      const message = err instanceof Error ? err.message : String(err)
      const details = getEndpointFetchErrorDetails(err)

      setError(message)
      setCacheInfo({ fromCache: details?.fromCache === true, cacheAgeMs: details?.cacheAgeMs ?? 0 })

      addLog({
        widgetId:    widget.id,
        widgetTitle: widget.title,
        endpointId:  endpoint.id,
        endpointUrl: endpoint.url,
        level:       'error',
        message,
        latencyMs:   ms,
        statusCode:  details?.statusCode,
      })

      updateEndpointHealth(endpoint.id, {
        endpointName: endpoint.name,
        url:          endpoint.url,
        status:       'down',
        lastError:    message,
        errorCount:   (useMonitoringStore.getState().endpointHealth[endpoint.id]?.errorCount ?? 0) + 1,
      })
    } finally {
      setLoading(false)
    }
  }, [
    widget.id,
    widget.title,
    widget.endpointId,
    endpoints,
    addLog,
    updateEndpointHealth,
  ])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<DashboardWidgetRefreshDetail>).detail
      if (!detail) return

      const matchesAll = detail.scope === 'all'
      const matchesEndpoint = detail.scope === 'endpoint' && detail.endpointId === widget.endpointId
      if (!matchesAll && !matchesEndpoint) return

      void fetchData({ force: detail.force ?? false })
    }

    window.addEventListener(DASHBOARD_WIDGET_REFRESH_EVENT, handleRefresh as EventListener)
    return () => {
      window.removeEventListener(DASHBOARD_WIDGET_REFRESH_EVENT, handleRefresh as EventListener)
    }
  }, [fetchData, widget.endpointId])

  const endpoint = endpoints.find(e => e.id === widget.endpointId)
  const Icon = chartTypeIcon[widget.type] ?? BarChart3
  const style = { ...DEFAULT_STYLE, ...widget.style }
  const cardHeightClass = getWidgetCardHeightClass(widget.position)

  const aliases = useMemo(() => {
    const entries = Object.entries(widget.dataMapping.aliases ?? {})
      .filter(([field, alias]) => field.trim().length > 0 && alias.trim().length > 0)
      .map(([field, alias]) => [field.trim(), alias.trim()] as const)
    return Object.fromEntries(entries) as Record<string, string>
  }, [widget.dataMapping.aliases])

  const resolveField = useCallback(
    (field?: string) => (field ? (aliases[field] ?? field) : ''),
    [aliases],
  )

  const aliasedData = useMemo(
    () => rawData?.map(row => applyAliasesToRow(row, aliases)) ?? null,
    [aliases, rawData],
  )

  const xField = resolveField(widget.dataMapping.xAxis)
  const yField = resolveField(widget.dataMapping.yAxis)
  const yFields = useMemo(
    () => (widget.dataMapping.yAxes ?? []).map(axisCfg => resolveField(axisCfg.key)).filter(Boolean),
    [resolveField, widget.dataMapping.yAxes],
  )

  const insightData = useMemo(() => {
    if (!aliasedData?.length || !xField || !yField) return null
    const points = aliasedData
      .map(row => {
        const rawY = row[yField]
        const yNum = typeof rawY === 'number' ? rawY : Number(rawY)
        return {
          x: String(row[xField] ?? ''),
          y: yNum,
        }
      })
      .filter(point => Number.isFinite(point.y))
    return points.length >= 2 ? points : null
  }, [aliasedData, xField, yField])

  const insightSummary = useMemo(
    () => (insightData ? TrendAnalyzer.analyze(insightData) : null),
    [insightData],
  )

  const shouldShowInsights = !['table', 'gauge', 'ring-gauge', 'status-card'].includes(widget.type)

  const fieldWarning = useMemo(() => {
    if (!aliasedData?.length) return null
    const needsXAxis = !['gauge', 'ring-gauge', 'status-card'].includes(widget.type)
    const keys = Object.keys(aliasedData[0])
    if (needsXAxis && xField && !keys.includes(xField)) {
      return `xAxis field "${xField}" not found in data. Available: ${keys.slice(0, 5).join(', ')}`
    }
    if (yField && !keys.includes(yField)) {
      return `yAxis field "${yField}" not found in data. Available: ${keys.slice(0, 5).join(', ')}`
    }
    return null
  }, [aliasedData, widget.type, xField, yField])

  const handleSizeChange = (preset: WidgetSizePreset) => {
    if (viewMode) return
    const nextSize = getWidgetSizeFromPreset(preset)
    const currentPosition = widget.position ?? { x: 0, y: 0, w: 6, h: 5 }
    updateWidget(widget.id, {
      position: {
        ...currentPosition,
        w: nextSize.w,
        h: nextSize.h,
      },
    })
    toast.success(`Widget size set to ${WIDGET_SIZE_LABEL[preset]}`)
  }

  const renderChart = () => {
    if (!aliasedData?.length) return null
    const x = xField
    const y = yField

    switch (widget.type) {
      case 'bar':
        return <ModernBarChart data={aliasedData} xField={x} yField={y} style={style} />
      case 'line':
        return <ModernLineChart data={aliasedData} xField={x} yField={y} style={style} />
      case 'area':
        return <ModernAreaChart data={aliasedData} xField={x} yField={y} style={style} />
      case 'pie':
        return <ModernPieChart data={aliasedData} nameField={x} valueField={y} style={style} />
      case 'donut':
        return <ModernPieChart data={aliasedData} nameField={x} valueField={y} donut style={style} />
      case 'horizontal-bar':
        return <ModernHorizontalBarChart data={aliasedData} xField={x} yField={y} style={style} />
      case 'horizontal-stacked-bar':
        return <ModernHorizontalStackedBarChart data={aliasedData} xField={x} yField={y} yFields={yFields} style={style} />
      case 'grouped-bar':
        return <ModernGroupedBarChart data={aliasedData} xField={x} yField={y} yFields={yFields} style={style} />
      case 'drilldown-bar':
        return <ModernDrilldownBarChart data={aliasedData} xField={x} yField={y} style={style} />
      case 'gauge':
        return <ModernGaugeChartFromData data={aliasedData} yField={y} label={widget.title} style={style} />
      case 'ring-gauge':
        return <ModernRingGaugeChartFromData data={aliasedData} yField={y} label={widget.title} style={style} />
      case 'status-card':
        return <ModernStatusCard data={aliasedData} yField={y} label={widget.title} style={style} />
      case 'table':
        return <DataTableView rows={aliasedData} maxHeight="max-h-[340px]" />
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

  const currentSizePreset = getWidgetSizePreset(widget.position)

  const RefreshButton = (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={() => void fetchData({ force: true })}
      disabled={loading}
      title="Refresh this chart"
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
        className={`flex flex-col transition-all duration-200 ${cardHeightClass} ${
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
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
              <CardTitle className="text-sm truncate">{widget.title}</CardTitle>
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 mr-1">
                {widget.type.toUpperCase()}
              </Badge>

              {widget.type !== 'table' && (
                <div className="hidden sm:flex items-center rounded-md border mr-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className={`h-6 rounded-r-none px-2 text-[10px] ${activeView === 'chart' ? 'bg-muted font-medium' : ''}`}
                    onClick={() => setActiveView('chart')}
                  >
                    Chart
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className={`h-6 rounded-l-none px-2 text-[10px] ${activeView === 'table' ? 'bg-muted font-medium' : ''}`}
                    onClick={() => setActiveView('table')}
                  >
                    Table
                  </Button>
                </div>
              )}

              {error
                ? <WifiOff className={`w-3 h-3 ${healthColor} mr-1`} />
                : <Wifi className={`w-3 h-3 ${healthColor} mr-1`} />
              }

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setExpandedOpen(true)}
                title="Expand view"
              >
                <Maximize2 className="w-3 h-3" />
              </Button>

              {!viewMode && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Widget size">
                        <Shrink className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      {(['small', 'medium', 'large', 'full'] as WidgetSizePreset[]).map(preset => (
                        <DropdownMenuItem
                          key={preset}
                          onClick={() => handleSizeChange(preset)}
                          className="text-xs"
                        >
                          {WIDGET_SIZE_LABEL[preset]}
                          {currentSizePreset === preset ? '  (current)' : ''}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setEditOpen(true)}
                    title="Edit widget"
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>

                  {RefreshButton}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500 hover:text-red-700"
                    onClick={() => setDeleteOpen(true)}
                    title="Delete widget"
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
              {endpoint?.name ?? 'Unknown'}
              {xField ? ` - ${xField}` : ''}
              {yField ? ` -> ${yField}` : ''}
            </p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {latency !== null && (
                <span className={`text-[10px] font-mono ${latency > 2000 ? 'text-amber-500' : 'text-green-600'}`}>
                  {latency}ms
                </span>
              )}
              {cacheInfo.fromCache && (
                <span className="text-[10px] text-cyan-600 font-medium">
                  cache {Math.round(cacheInfo.cacheAgeMs / 1000)}s
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
                variant="outline"
                size="sm"
                className="h-6 text-[11px] border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => void fetchData({ force: true })}
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

          {fieldWarning && !error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 mb-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400">{fieldWarning}</p>
            </div>
          )}

          {!loading && !error && rawData && (
            <div className="w-full min-h-[280px]">
              {activeView === 'table' && aliasedData
                ? <DataTableView rows={aliasedData} />
                : renderChart()}
            </div>
          )}

          {!loading && !error && insightSummary && insightData && shouldShowInsights && activeView === 'chart' && (
            <WidgetInsights
              insights={insightSummary}
              xLabel={xField}
              yLabel={yField}
              data={insightData}
            />
          )}

          {!loading && !error && aliasedData?.length === 0 && (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-xs text-muted-foreground">No data returned</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={expandedOpen} onOpenChange={setExpandedOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="truncate">{widget.title}</span>
              <Badge variant="outline" className="text-[10px]">Expanded View</Badge>
            </DialogTitle>
          </DialogHeader>

          {widget.type !== 'table' && (
            <div className="flex items-center rounded-md border w-fit">
              <Button
                type="button"
                variant="ghost"
                className={`h-8 rounded-r-none px-3 text-xs ${activeView === 'chart' ? 'bg-muted font-medium' : ''}`}
                onClick={() => setActiveView('chart')}
              >
                Chart
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={`h-8 rounded-l-none px-3 text-xs ${activeView === 'table' ? 'bg-muted font-medium' : ''}`}
                onClick={() => setActiveView('table')}
              >
                Table
              </Button>
            </div>
          )}

          <div className="rounded-xl border bg-gradient-to-b from-muted/20 to-background p-4 min-h-[460px]">
            {loading && !rawData && <WidgetSkeleton />}
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            {!loading && !error && aliasedData && (
              activeView === 'table'
                ? <DataTableView rows={aliasedData} limit={100} maxHeight="max-h-[520px]" />
                : renderChart()
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(v: boolean) => !v && setDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{widget.title}"?</AlertDialogTitle>
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
