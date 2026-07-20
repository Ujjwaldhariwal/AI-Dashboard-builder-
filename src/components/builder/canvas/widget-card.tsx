// src/components/builder/canvas/widget-card.tsx
// ──────────────────────────────────────────────
// FIXES APPLIED:
//  P7  — Chart content div: min-h-[280px] → h-full min-h-0
//  P8  — CardContent: added min-h-0 overflow-hidden, pb-4 → pb-2
//  P9  — isDragClone prop to skip data fetching in DragOverlay
//  P10 — pb-4 → pb-2 (less bottom padding)
//  P11 — GripVertical: <button> → <div> (avoids double role="button")
//  P12 — ChartWrapper wraps every Recharts return in renderChart()
'use client'

/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

import { useEffect, useState, useCallback, useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  RefreshCw, Loader2, AlertCircle,
  BarChart3, LineChart, PieChart, AreaChart,
  Table2, Pencil, GripVertical, Gauge, TrendingUp,
  AlignLeft, Wifi, WifiOff, Circle,
  Sparkles, MoreHorizontal,
} from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { useMonitoringStore } from '@/store/monitoring-store'
import type { Widget, YAxisConfig } from '@/types/widget'
import type { StatusLevel } from '@/components/ui/status-icon'
import { DEFAULT_STYLE } from '@/types/widget'
import { WidgetEditDialog } from '@/components/builder/widget-edit-dialog'
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
  getWidgetSizePreset,
} from '@/lib/builder/widget-size'
import { applyTransforms } from '@/lib/builder/data-transformer'
import { sortRowsByField } from '@/lib/charts/domain-order'

// ── FIX P12: Import ChartWrapper ──
import { ChartWrapper } from '@/components/charts/chart-wrapper'

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

// ── FIX P9: isDragClone prop added ──
interface WidgetCardProps {
  widget:       Widget
  viewMode?:    boolean
  isDragClone?: boolean
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

function parseNumberSafe(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function inferNumericField(rows: Record<string, unknown>[], keys: string[]): string {
  if (keys.length === 0) return ''
  if (keys.includes('value')) return 'value'

  const scores = new Map<string, number>()
  keys.forEach(key => scores.set(key, 0))

  rows.slice(0, 120).forEach(row => {
    keys.forEach(key => {
      if (parseNumberSafe(row[key]) !== null) {
        scores.set(key, (scores.get(key) ?? 0) + 1)
      }
    })
  })

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  const [bestKey, bestScore] = ranked[0] ?? ['', 0]
  return bestScore > 0 ? bestKey : ''
}

function inferCategoryField(rows: Record<string, unknown>[], keys: string[]): string {
  if (keys.length === 0) return ''
  if (keys.includes('name')) return 'name'

  const preferred = ['label', 'category', 'type', 'title']
  for (const key of preferred) {
    if (keys.includes(key)) return key
  }

  const numericField = inferNumericField(rows, keys)
  const nonNumeric = keys.filter(key => key !== numericField)
  return nonNumeric[0] ?? keys[0] ?? ''
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
  sortField,
  limit = 50,
  maxHeight = 'max-h-[320px]',
}: {
  rows: Record<string, unknown>[]
  sortField?: string
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
  const orderingField = sortField && cols.includes(sortField) ? sortField : (cols[0] ?? '')
  const orderedRows = orderingField ? sortRowsByField(rows, orderingField) : rows
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
          {orderedRows.slice(0, limit).map((row, index) => (
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

interface WidgetHeaderProps {
  widget: Widget
  sizePreset: ReturnType<typeof getWidgetSizePreset>
  isLoading: boolean
  latencyMs?: number
  cacheAgeText?: string
  lastFetched?: Date
  healthStatus: StatusLevel
  isDataValid: boolean
  activeView: 'chart' | 'table'
  canToggleView: boolean
  isDragMode: boolean
  viewOnly: boolean
  dragHandleAttributes?: React.HTMLAttributes<HTMLDivElement>
  dragHandleListeners?: React.HTMLAttributes<HTMLDivElement>
  onRefresh: () => void
  onSetChartView: () => void
  onSetTableView: () => void
  onOpenInsights?: () => void
  onEditWidget: () => void
  onDeleteWidget: () => void
}

function WidgetHeader({
  widget,
  sizePreset,
  isLoading,
  latencyMs,
  cacheAgeText,
  lastFetched,
  healthStatus,
  isDataValid,
  activeView,
  canToggleView,
  isDragMode,
  viewOnly,
  dragHandleAttributes,
  dragHandleListeners,
  onRefresh,
  onSetChartView,
  onSetTableView,
  onOpenInsights,
  onEditWidget,
  onDeleteWidget,
}: WidgetHeaderProps) {
  const Icon = chartTypeIcon[widget.type] ?? BarChart3

  const isSmall = sizePreset === 'small'
  const isLargeUp = sizePreset === 'large' || sizePreset === 'full'

  const showDragHandle = isDragMode
  const showToggle = !isSmall && canToggleView
  const showHealth = !isSmall
  const showInsights = isDataValid && Boolean(onOpenInsights)
  const showRuntimeRow = !isSmall
  const showActionMenu = !viewOnly
  const showLatency = !isSmall
  const showCache = isLargeUp && Boolean(cacheAgeText)
  const showLastFetched = isLargeUp && Boolean(lastFetched)

  const healthColorClass: Record<StatusLevel, string> = {
    healthy: 'text-green-500',
    degraded: 'text-amber-500',
    down: 'text-red-500',
    unknown: 'text-muted-foreground',
  }
  const HealthIcon = healthStatus === 'down' ? WifiOff : Wifi

  return (
    <CardHeader className="pb-2 px-4 pt-3 flex-shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showDragHandle && (
            <div
              {...dragHandleAttributes}
              {...dragHandleListeners}
              className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0 touch-none"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          )}

          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border bg-muted text-foreground">
            <Icon className="h-3.5 w-3.5" />
          </div>

          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm truncate" title={widget.title}>
              {widget.title}
            </CardTitle>
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {showToggle && (
            <div className="hidden sm:flex items-center rounded-md border mr-1">
              <Button
                type="button"
                variant="ghost"
                className={`h-8 rounded-r-none px-2 text-xs ${activeView === 'chart' ? 'bg-muted font-medium' : ''}`}
                onClick={onSetChartView}
                aria-pressed={activeView === 'chart'}
              >
                Chart
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={`h-8 rounded-l-none px-2 text-xs ${activeView === 'table' ? 'bg-muted font-medium' : ''}`}
                onClick={onSetTableView}
                aria-pressed={activeView === 'table'}
              >
                Table
              </Button>
            </div>
          )}

          {showHealth && (
            <span className="mr-1 inline-flex" title={`Data status: ${healthStatus}`} aria-label={`Data status: ${healthStatus}`}>
              <HealthIcon className={`h-3.5 w-3.5 ${healthColorClass[healthStatus]}`} />
            </span>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh this chart"
          >
            {isLoading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />
            }
          </Button>

          {showActionMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Widget actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onEditWidget}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit widget
                </DropdownMenuItem>
                {showInsights && onOpenInsights && (
                  <DropdownMenuItem onClick={onOpenInsights}>
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                    View AI insights
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={onDeleteWidget}
                  className="text-destructive focus:text-destructive"
                >
                  Delete widget
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

        </div>
      </div>

      {showRuntimeRow && (
        <div className="flex items-center gap-2 mt-0.5">
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {showLatency && (
              <span className="font-mono tabular-nums text-xs text-muted-foreground min-w-[4.5rem] text-right inline-block">
                {latencyMs != null ? `${latencyMs} ms` : '— ms'}
              </span>
            )}
            {showCache && (
              <span className="text-xs text-cyan-600 font-medium">
                {cacheAgeText}
              </span>
            )}
            {showLastFetched && (
              <span className="font-mono tabular-nums text-xs text-muted-foreground min-w-[5rem] text-right inline-block">
                {lastFetched?.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </CardHeader>
  )
}

export function WidgetCard({ widget, viewMode = false, isDragClone = false }: WidgetCardProps) {
  const { endpoints, removeWidget } = useDashboardStore()
  const { addLog, updateEndpointHealth } = useMonitoringStore()

  const [rawData, setRawData]         = useState<Record<string, unknown>[] | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [editOpen, setEditOpen]       = useState(false)
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [latency, setLatency]         = useState<number | null>(null)
  const [insightsOpen, setInsightsOpen] = useState(false)
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

  useEffect(() => {
    setInsightsOpen(false)
  }, [widget.id, widget.type])

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

  // ── FIX P9: Skip data fetching for drag overlay clones ──
  useEffect(() => {
    if (isDragClone) return
    void fetchData()
  }, [fetchData, isDragClone])

  // ── FIX P9: Skip refresh listener for drag overlay clones ──
  useEffect(() => {
    if (isDragClone) return

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
  }, [fetchData, widget.endpointId, isDragClone])

  const endpoint = endpoints.find(e => e.id === widget.endpointId)
  const style = { ...DEFAULT_STYLE, ...widget.style }
  const cardHeightClass = getWidgetCardHeightClass(widget.position)
  const endpointTransforms = useMemo(() => endpoint?.transforms ?? [], [endpoint?.transforms])

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

  const endpointPreparedData = useMemo(() => {
    if (!rawData) return null
    if (endpointTransforms.length === 0) return rawData
    return applyTransforms(rawData, endpointTransforms)
  }, [endpointTransforms, rawData])

  const aliasedData = useMemo(
    () => endpointPreparedData?.map(row => applyAliasesToRow(row, aliases)) ?? null,
    [aliases, endpointPreparedData],
  )

  const transformedData = aliasedData

  const configuredXField = resolveField(widget.dataMapping.xAxis)
  const configuredYField = resolveField(widget.dataMapping.yAxis)
  const configuredYAxisConfig = useMemo<YAxisConfig[]>(
    () =>
      (widget.dataMapping.yAxes ?? []).flatMap(axisCfg => {
        const key = resolveField(axisCfg.key)
        if (!key) return []
        return [{
          ...axisCfg,
          key,
          label: axisCfg.label ?? key,
        } satisfies YAxisConfig]
      }),
    [resolveField, widget.dataMapping.yAxes],
  )

  const resolvedFieldState = useMemo(() => {
    const keys = transformedData?.length ? Object.keys(transformedData[0]) : []
    const canUseXAxis = !['gauge', 'ring-gauge', 'status-card'].includes(widget.type)

    const hasConfiguredX = Boolean(configuredXField && keys.includes(configuredXField))
    const hasConfiguredY = Boolean(configuredYField && keys.includes(configuredYField))

    const inferredX = canUseXAxis ? inferCategoryField(transformedData ?? [], keys) : ''
    const inferredY = inferNumericField(transformedData ?? [], keys)

    const xField = canUseXAxis
      ? (hasConfiguredX ? configuredXField : inferredX)
      : ''
    const yField = hasConfiguredY ? configuredYField : inferredY

    const yAxisConfig = configuredYAxisConfig.filter(axisCfg => keys.includes(axisCfg.key))
    const yFields = yAxisConfig.map(axis => axis.key)

    const fallbackHint = (
      transformedData?.length
      && (
        (canUseXAxis && configuredXField && !hasConfiguredX && xField)
        || (configuredYField && !hasConfiguredY && yField)
      )
    )
      ? `Configured field mapping not found after transforms; using "${xField || '-'} -> ${yField || '-'}"`
      : null

    return {
      keys,
      xField,
      yField,
      yAxisConfig,
      yFields,
      fallbackHint,
    }
  }, [
    configuredXField,
    configuredYField,
    configuredYAxisConfig,
    transformedData,
    widget.type,
  ])

  const xField = resolvedFieldState.xField
  const yField = resolvedFieldState.yField
  const yAxisConfig = resolvedFieldState.yAxisConfig
  const yFields = resolvedFieldState.yFields

  const insightData = useMemo(() => {
    if (!transformedData?.length || !xField || !yField) return null
    const points = transformedData
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
  }, [transformedData, xField, yField])

  const insightSummary = useMemo(
    () => (insightData ? TrendAnalyzer.analyze(insightData) : null),
    [insightData],
  )

  const shouldShowInsights = !['table', 'gauge', 'ring-gauge', 'status-card'].includes(widget.type)

  const fieldWarning = useMemo(() => {
    if (!transformedData?.length) return null
    if (resolvedFieldState.fallbackHint) {
      if (
        (widget.type === 'pie' || widget.type === 'donut')
        && xField === 'name'
        && yField === 'value'
      ) {
        return null
      }
      return resolvedFieldState.fallbackHint
    }

    const needsXAxis = !['gauge', 'ring-gauge', 'status-card'].includes(widget.type)
    const keys = resolvedFieldState.keys

    if (needsXAxis && !xField) {
      return `No valid xAxis field found in transformed data. Available: ${keys.slice(0, 5).join(', ')}`
    }
    if (!yField) {
      return `No numeric yAxis field found in transformed data. Available: ${keys.slice(0, 5).join(', ')}`
    }

    return null
  }, [resolvedFieldState, transformedData, widget.type, xField, yField])
  // ── FIX P12: Every Recharts chart wrapped in <ChartWrapper> ──
  const renderChart = () => {
    if (!transformedData?.length) return null
    const x = xField
    const y = yField

    switch (widget.type) {
      case 'bar':
        return (
          <ChartWrapper>
            <ModernBarChart data={transformedData} xField={x} yField={y} style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      case 'line':
        return (
          <ChartWrapper>
            <ModernLineChart data={transformedData} xField={x} yField={y} style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      case 'area':
        return (
          <ChartWrapper>
            <ModernAreaChart data={transformedData} xField={x} yField={y} style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      case 'pie':
        return (
          <ChartWrapper>
            <ModernPieChart data={transformedData} nameField={x} valueField={y} style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      case 'donut':
        return (
          <ChartWrapper>
            <ModernPieChart data={transformedData} nameField={x} valueField={y} donut style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      case 'horizontal-bar':
        return (
          <ChartWrapper>
            <ModernHorizontalBarChart data={transformedData} xField={x} yField={y} style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      case 'horizontal-stacked-bar':
        return (
          <ChartWrapper>
            <ModernHorizontalStackedBarChart
              data={transformedData}
              xField={x}
              yField={y}
              yFields={yFields}
              yAxisConfig={yAxisConfig}
              style={style}
              sizePreset={currentSizePreset}
            />
          </ChartWrapper>
        )
      case 'grouped-bar':
        return (
          <ChartWrapper>
            <ModernGroupedBarChart
              data={transformedData}
              xField={x}
              yField={y}
              yFields={yFields}
              yAxisConfig={yAxisConfig}
              style={style}
              sizePreset={currentSizePreset}
            />
          </ChartWrapper>
        )
      case 'drilldown-bar':
        return (
          <ChartWrapper>
            <ModernDrilldownBarChart data={transformedData} xField={x} yField={y} style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      case 'gauge':
        return (
          <ChartWrapper>
            <ModernGaugeChartFromData data={transformedData} yField={y} label={widget.title} style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      case 'ring-gauge':
        return (
          <ChartWrapper>
            <ModernRingGaugeChartFromData data={transformedData} yField={y} label={widget.title} style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      // status-card and table are NOT Recharts — no ChartWrapper needed
      case 'status-card':
        return (
          <ChartWrapper>
            <ModernStatusCard data={transformedData} yField={y} label={widget.title} style={style} sizePreset={currentSizePreset} />
          </ChartWrapper>
        )
      case 'table':
        return <DataTableView rows={transformedData} sortField={x} maxHeight="max-h-[340px]" />
      default:
        return (
          <p className="text-xs text-muted-foreground">
            Unknown chart type: {widget.type}
          </p>
        )
    }
  }

  const currentSizePreset = getWidgetSizePreset(widget.position)
  const healthStatus: StatusLevel =
    error
      ? 'down'
      : latency == null
        ? 'unknown'
        : latency > 2000
          ? 'degraded'
          : 'healthy'
  const cacheAgeText = cacheInfo.fromCache
    ? `cache ${Math.round(cacheInfo.cacheAgeMs / 1000)}s`
    : undefined
  const isDataValid = shouldShowInsights && Boolean(insightSummary) && !loading && !error

  return (
    <>
      <Card
        ref={setNodeRef}
        style={dragStyle}
        className={`flex flex-col overflow-hidden rounded-lg ${cardHeightClass} ${
          isDragging
            ? 'border-primary shadow-lg ring-1 ring-primary/40'
            : 'shadow-sm hover:border-primary/30'
        }`}
      >
        <WidgetHeader
          widget={widget}
          sizePreset={currentSizePreset}
          isLoading={loading}
          latencyMs={latency ?? undefined}
          cacheAgeText={cacheAgeText}
          lastFetched={lastFetched ?? undefined}
          healthStatus={healthStatus}
          isDataValid={isDataValid}
          activeView={activeView}
          canToggleView={widget.type !== 'table'}
          isDragMode={!viewMode}
          viewOnly={viewMode}
          dragHandleAttributes={!viewMode ? attributes : undefined}
          dragHandleListeners={!viewMode ? listeners : undefined}
          onRefresh={() => void fetchData({ force: true })}
          onSetChartView={() => setActiveView('chart')}
          onSetTableView={() => setActiveView('table')}
          onOpenInsights={shouldShowInsights ? () => setInsightsOpen(true) : undefined}
          onEditWidget={() => setEditOpen(true)}
          onDeleteWidget={() => setDeleteOpen(true)}
        />

        {/* ── FIX P8/P10: flex-1 min-h-0 overflow-hidden, pb-4 → pb-2 ── */}
        <CardContent className="px-4 pb-2 flex-1 min-h-0 overflow-hidden">
          {loading && !rawData && <WidgetSkeleton />}

          {error && (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                <p className="text-[11px] text-destructive">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-destructive/30 text-[11px] text-destructive hover:bg-destructive/5"
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

          {/* ── FIX P7: min-h-[280px] → h-full min-h-0 ── */}
          {!loading && !error && rawData && (
            <div className="w-full h-full min-h-0">
              {activeView === 'table' && transformedData
                ? <DataTableView rows={transformedData} sortField={xField} />
                : renderChart()}
            </div>
          )}

          {!loading && !error && transformedData?.length === 0 && (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-xs text-muted-foreground">No data returned</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={insightsOpen} onOpenChange={setInsightsOpen}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="border-b bg-muted/25 px-5 pb-3 pt-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-cyan-600" />
              AI Insights
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {widget.title}
            </p>
          </DialogHeader>
          <div className="p-4 md:p-5 max-h-[72vh] overflow-auto">
            {loading && !rawData && <WidgetSkeleton />}
            {!loading && error && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            {!loading && !error && insightSummary && insightData && (
              <WidgetInsights
                insights={insightSummary}
                xLabel={xField}
                yLabel={yField}
                data={insightData}
              />
            )}
            {!loading && !error && (!insightSummary || !insightData) && (
              <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                Insights are unavailable for this chart. Ensure x/y mappings are valid and at least two numeric points are returned.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(v: boolean) => !v && setDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{widget.title}&rdquo;?</AlertDialogTitle>
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



