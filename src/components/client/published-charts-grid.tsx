'use client'

/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

import { AlertTriangle, ChartNoAxesCombined, Loader2, RotateCcw, Table2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { ModernBarChart } from '@/components/charts/modern-bar-chart'
import { ModernGroupedBarChart } from '@/components/charts/modern-grouped-bar-chart'
import { ModernHorizontalBarChart } from '@/components/charts/modern-horizontal-bar-chart'
import { ModernHorizontalStackedBarChart } from '@/components/charts/modern-horizontal-stacked-bar-chart'
import { ModernLineChart } from '@/components/charts/modern-line-chart'
import { ModernPieChart } from '@/components/charts/modern-pie-chart'
import { DASHBOARDOS_THEME_CHANGE_EVENT } from '@/components/client/client-theme-shell'
import { resolvePublishedChartFields } from '@/lib/client/published-chart-runtime'
import { DASHBOARDOS_THEME_STORAGE_KEY } from '@/lib/dashboardos/theme'
import { getDemoChartElapsedMs, getDemoChartFields, getDemoChartRows } from '@/lib/dashboardos/demo-data'
import { isDashboardOsDemoMode } from '@/lib/dashboardos/demo-mode'
import { getEnterpriseChartColors } from '@/lib/echarts/theme'
import type { ChartTemplateId } from '@/types/chart-template'
import type { DashboardChartConfig } from '@/types/dashboard-chart'

interface PublishedChartsGridProps {
  tenantSlug: string
  charts: DashboardChartConfig[]
}

interface ChartRunPayload {
  result?: {
    rows?: Record<string, unknown>[]
    fields?: Array<string | { name?: string }>
    rowCount?: number
    elapsedMs?: number
    warnings?: string[]
    chart?: {
      resolved?: {
        xField?: string
        yFields?: string[]
        tooltipFields?: string[]
        sortField?: string
      }
    }
  } | null
  error?: string
}

interface ChartRunState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  rows: Record<string, unknown>[]
  fieldNames: string[]
  resolved: {
    xField: string
    yFields: string[]
    tooltipFields: string[]
    sortField: string
  }
  rowCount: number
  elapsedMs: number
  error?: string
}

type DatasetRunField = string | { name?: string }

const EMPTY_STATE: ChartRunState = {
  status: 'idle',
  rows: [],
  fieldNames: [],
  resolved: {
    xField: '',
    yFields: [],
    tooltipFields: [],
    sortField: '',
  },
  rowCount: 0,
  elapsedMs: 0,
}

function fieldNameFromId(chart: DashboardChartConfig, id?: string) {
  if (!id) return ''
  return chart.encoding.labelById[id] ?? id
}

function fieldNamesFromResult(fields?: DatasetRunField[]) {
  return (fields ?? []).map(field => (
    typeof field === 'string' ? field : String(field?.name ?? '')
  )).filter(Boolean)
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function applyChartLimit(rows: Record<string, unknown>[], chart: DashboardChartConfig, state: ChartRunState) {
  const limit = chart.encoding.limit ?? 25
  const sorted = [...rows]
  if (chart.encoding.sort?.byId && state.resolved.sortField) {
    const sortField = state.resolved.sortField
    const direction = chart.encoding.sort.direction === 'asc' ? 1 : -1
    sorted.sort((left, right) => (toNumber(left[sortField]) - toNumber(right[sortField])) * direction)
  }
  return sorted.slice(0, Math.max(1, Math.min(500, limit)))
}

function sizeClass(chart: DashboardChartConfig) {
  if (chart.layout.gridSpan >= 4 || chart.presentation.size === 'full') return 'lg:col-span-4'
  if (chart.layout.gridSpan >= 3 || chart.presentation.size === 'wide') return 'lg:col-span-3'
  if (chart.layout.gridSpan >= 2 || chart.presentation.size === 'standard') return 'lg:col-span-2'
  return 'lg:col-span-1'
}

function chartHeight(chart: DashboardChartConfig) {
  if (chart.presentation.size === 'compact') return 'h-64'
  if (chart.presentation.size === 'full') return 'h-[420px]'
  if (chart.layout.gridSpan >= 3) return 'h-96'
  return 'h-80'
}

function resolveInitialDarkMode() {
  if (typeof window === 'undefined') return false
  const stored = window.localStorage.getItem(DASHBOARDOS_THEME_STORAGE_KEY)
  if (stored === 'dark') return true
  if (stored === 'light') return false
  if (document.querySelector('[data-dashboardos-theme="dark"]')) return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function useDashboardChartDarkMode() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setDark(resolveInitialDarkMode())
    update()
    media.addEventListener('change', update)
    window.addEventListener('storage', update)
    window.addEventListener(DASHBOARDOS_THEME_CHANGE_EVENT, update)
    return () => {
      media.removeEventListener('change', update)
      window.removeEventListener('storage', update)
      window.removeEventListener(DASHBOARDOS_THEME_CHANGE_EVENT, update)
    }
  }, [])

  return dark
}

function chartStyle(chart: DashboardChartConfig, dark: boolean) {
  const colors = Object.values(chart.encoding.colorById).filter(Boolean)
  return {
    colors: colors.length > 0 ? colors : getEnterpriseChartColors(dark),
    showLegend: chart.presentation.showLegend,
    showGrid: true,
    labelFormat: chart.presentation.valueFormat === 'currency' ? 'currency' as const : undefined,
  }
}

function isChartTemplate(templateId: ChartTemplateId, supported: ChartTemplateId[]) {
  return supported.includes(templateId)
}

function DataTable({
  rows,
  fieldNames,
}: {
  rows: Record<string, unknown>[]
  fieldNames: string[]
}) {
  const columns = fieldNames.length > 0 ? fieldNames.slice(0, 8) : Object.keys(rows[0] ?? {}).slice(0, 8)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] table-fixed text-left text-xs">
        <thead className="bg-[var(--dos-surface-muted)] text-[11px] uppercase text-[var(--dos-text-muted)]">
          <tr>
            {columns.map(column => (
              <th key={column} className="w-40 truncate px-3 py-2 font-medium">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--dos-border-soft)]">
          {rows.slice(0, 10).map((row, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td key={column} className="truncate px-3 py-2 text-[var(--dos-text-secondary)]">
                  {String(row[column] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KpiView({
  chart,
  rows,
  labels,
}: {
  chart: DashboardChartConfig
  rows: Record<string, unknown>[]
  labels: string[]
}) {
  const metrics = chart.encoding.yMetricIds.slice(0, chart.templateId === 'kpi-card' ? 1 : 6)
  const firstRow = rows[0] ?? {}
  return (
    <div className="grid border-y border-[color:var(--dos-border-soft)] sm:grid-cols-2">
      {metrics.map((metricId, index) => {
        const label = labels[index] || fieldNameFromId(chart, metricId)
        return (
          <div key={metricId} className="border-b border-[color:var(--dos-border-soft)] p-4 last:border-b-0 sm:border-r sm:even:border-r-0">
            <p className="text-xs font-medium text-[var(--dos-text-muted)]">{label}</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[var(--dos-text-primary)]">
              {toNumber(firstRow[label]).toLocaleString('en')}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ChartBody({
  chart,
  state,
  dark,
  onRetry,
}: {
  chart: DashboardChartConfig
  state: ChartRunState
  dark: boolean
  onRetry: () => void
}) {
  if (state.status === 'loading') {
    return (
      <div className="flex h-64 flex-col items-center justify-center bg-[var(--dos-surface-muted)]/40 px-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--dos-chart-info)]" />
        <p className="mt-3 text-sm font-semibold text-[var(--dos-text-primary)]">Loading governed data</p>
        <p className="mt-1 max-w-xs text-xs text-[var(--dos-text-muted)]">Running the published semantic query with read-only access.</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center bg-[var(--dos-surface-muted)]/35 px-6 text-center">
        <AlertTriangle className="h-5 w-5 text-[var(--dos-chart-warning)]" />
        <p className="mt-3 text-sm font-semibold text-[var(--dos-text-primary)]">Chart data could not load</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--dos-text-muted)]">{state.error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border border-[color:var(--dos-border-mid)] px-3 text-xs font-semibold text-[var(--dos-text-secondary)] hover:border-[color:var(--dos-accent-primary)] hover:text-[var(--dos-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)] focus-visible:ring-offset-2 active:bg-[var(--dos-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry chart
        </button>
      </div>
    )
  }

  const rows = applyChartLimit(state.rows, chart, state)
  const xField = state.resolved.xField || state.fieldNames[0] || 'name'
  const yFields = state.resolved.yFields.length > 0
    ? state.resolved.yFields
    : chart.encoding.yMetricIds.map(metricId => fieldNameFromId(chart, metricId)).filter(Boolean)
  const primaryMetric = yFields[0] ?? state.fieldNames.find(field => field !== xField) ?? 'value'
  const style = chartStyle(chart, dark)
  const height = chartHeight(chart)

  if (!rows.length) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center bg-[var(--dos-surface-muted)]/30 p-6 text-center">
        <Table2 className="h-5 w-5 text-[var(--dos-text-muted)]" />
        <p className="mt-3 text-sm font-semibold text-[var(--dos-text-primary)]">No rows returned</p>
        <p className="mt-1 text-xs text-[var(--dos-text-muted)]">The chart is valid, but the current dataset filter returned no records.</p>
      </div>
    )
  }

  if (isChartTemplate(chart.templateId, ['kpi-card', 'kpi-grid'])) {
    return <KpiView chart={chart} rows={rows} labels={yFields} />
  }

  if (chart.templateId === 'bar') {
    return <div className={height}><ModernBarChart data={rows} xField={xField} yField={primaryMetric} style={style} /></div>
  }

  if (chart.templateId === 'horizontal-bar') {
    return <div className={height}><ModernHorizontalBarChart data={rows} xField={xField} yField={primaryMetric} style={style} /></div>
  }

  if (chart.templateId === 'grouped-bar') {
    return <div className={height}><ModernGroupedBarChart data={rows} xField={xField} yFields={yFields} style={style} /></div>
  }

  if (chart.templateId === 'horizontal-stacked-bar') {
    return <div className={height}><ModernHorizontalStackedBarChart data={rows} xField={xField} yFields={yFields} style={style} /></div>
  }

  if (chart.templateId === 'line' || chart.templateId === 'trend-composed') {
    return <div className={height}><ModernLineChart data={rows} xField={xField} yField={primaryMetric} style={style} /></div>
  }

  if (chart.templateId === 'pie' || chart.templateId === 'gauge' || chart.templateId === 'ring-gauge') {
    return <div className={height}><ModernPieChart data={rows} nameField={xField} valueField={primaryMetric} donut={chart.templateId !== 'pie'} style={style} /></div>
  }

  return <DataTable rows={rows} fieldNames={state.fieldNames} />
}

export function PublishedChartsGrid({ tenantSlug, charts }: PublishedChartsGridProps) {
  const [chartRuns, setChartRuns] = useState<Record<string, ChartRunState>>({})
  const [selectedChartId, setSelectedChartId] = useState('all')
  const [reloadToken, setReloadToken] = useState(0)
  const dark = useDashboardChartDarkMode()
  const demoMode = isDashboardOsDemoMode()
  const chartIds = useMemo(() => charts.map(chart => chart.id), [charts])
  const chartById = useMemo(() => new Map(charts.map(chart => [chart.id, chart])), [charts])

  const chartKey = useMemo(() => chartIds.join('|'), [chartIds])
  const visibleCharts = selectedChartId === 'all'
    ? charts
    : charts.filter(chart => chart.id === selectedChartId)

  useEffect(() => {
    if (selectedChartId !== 'all' && !chartById.has(selectedChartId)) {
      setSelectedChartId('all')
    }
  }, [chartById, selectedChartId])

  useEffect(() => {
    const controller = new AbortController()
    const ids = chartKey ? chartKey.split('|') : []

    async function loadCharts() {
      if (demoMode && tenantSlug === 'demo') {
        setChartRuns(Object.fromEntries(ids.map(id => [id, {
          status: 'ready' as const,
          rows: getDemoChartRows(id),
          fieldNames: getDemoChartFields(id),
          resolved: {
            xField: fieldNameFromId(chartById.get(id) ?? charts[0], chartById.get(id)?.encoding.xAxisFieldId) || getDemoChartFields(id)[0] || 'Month',
            yFields: (chartById.get(id)?.encoding.yMetricIds ?? []).map(metricId => fieldNameFromId(chartById.get(id) ?? charts[0], metricId)).filter(Boolean),
            tooltipFields: (chartById.get(id)?.encoding.tooltipFieldIds ?? []).map(fieldId => fieldNameFromId(chartById.get(id) ?? charts[0], fieldId)).filter(Boolean),
            sortField: fieldNameFromId(chartById.get(id) ?? charts[0], chartById.get(id)?.encoding.sort?.byId) || '',
          },
          rowCount: getDemoChartRows(id).length,
          elapsedMs: getDemoChartElapsedMs(id),
        }])))
        return
      }
      setChartRuns(Object.fromEntries(ids.map(id => [id, { ...EMPTY_STATE, status: 'loading' as const }])))
      const entries = await Promise.all(ids.map(async chartId => {
        try {
          const response = await fetch(`/api/client/${encodeURIComponent(tenantSlug)}/charts/${encodeURIComponent(chartId)}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            signal: controller.signal,
          })
          const payload = await response.json() as ChartRunPayload
          if (!response.ok) throw new Error(payload.error || 'Chart query failed')
          const rows = payload.result?.rows ?? []
          const fieldNames = fieldNamesFromResult(payload.result?.fields)
          const resolved = resolvePublishedChartFields({
            fieldNames,
            rows,
            requestedXField: payload.result?.chart?.resolved?.xField,
            requestedYFields: payload.result?.chart?.resolved?.yFields,
            requestedTooltipFields: payload.result?.chart?.resolved?.tooltipFields,
            requestedSortField: payload.result?.chart?.resolved?.sortField,
          })
          return [chartId, {
            status: 'ready' as const,
            rows,
            fieldNames,
            resolved,
            rowCount: payload.result?.rowCount ?? payload.result?.rows?.length ?? 0,
            elapsedMs: payload.result?.elapsedMs ?? 0,
          }] as const
        } catch (error) {
          if (controller.signal.aborted) return [chartId, { ...EMPTY_STATE }] as const
          return [chartId, {
            ...EMPTY_STATE,
            status: 'error' as const,
            error: error instanceof Error ? error.message : String(error),
          }] as const
        }
      }))
      if (!controller.signal.aborted) setChartRuns(Object.fromEntries(entries))
    }

    if (ids.length > 0) void loadCharts()
    return () => controller.abort()
  }, [chartById, chartKey, charts, demoMode, reloadToken, tenantSlug])

  if (charts.length === 0) return null

  return (
    <section className="space-y-5" aria-label="Dashboard charts">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <ChartNoAxesCombined className="h-4 w-4 shrink-0 text-[var(--dos-accent-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--dos-text-secondary)]">Chart view</h2>
        </div>
        <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-[var(--dos-text-muted)]">
          <span className="shrink-0">Show</span>
          <select
            value={selectedChartId}
            onChange={event => setSelectedChartId(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-[color:var(--dos-border-mid)] bg-[var(--dos-surface)] px-3 text-sm font-medium text-[var(--dos-text-primary)] outline-none hover:border-[color:var(--dos-accent-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)] active:border-[color:var(--dos-accent-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-72 sm:flex-none"
          >
            <option value="all">All charts ({charts.length})</option>
            {charts.map(chart => <option key={chart.id} value={chart.id}>{chart.name}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {visibleCharts.map(chart => {
          const state = chartRuns[chart.id] ?? EMPTY_STATE
          const statusLabel = state.status === 'ready' ? 'Live' : state.status === 'loading' ? 'Loading' : state.status === 'error' ? 'Unavailable' : 'Queued'
          return (
            <article key={chart.id} className={`${selectedChartId === 'all' ? sizeClass(chart) : 'lg:col-span-4'} min-w-0 rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4 sm:p-5`}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold tracking-tight">{chart.name}</h3>
                  {chart.description ? <p className="mt-1 line-clamp-2 text-xs text-[var(--dos-text-muted)]">{chart.description}</p> : null}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-[var(--dos-text-muted)]">
                  <span className={`h-1.5 w-1.5 rounded-full ${state.status === 'ready' ? 'bg-[var(--dos-chart-success)]' : state.status === 'error' ? 'bg-[var(--dos-chart-risk)]' : 'bg-[var(--dos-chart-warning)]'}`} />
                  {statusLabel}
                </span>
              </div>
              <ChartBody chart={chart} state={state} dark={dark} onRetry={() => setReloadToken(token => token + 1)} />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--dos-border-soft)] pt-3 text-[11px] text-[var(--dos-text-muted)]">
                <span>{chart.templateId.replace(/-/g, ' ')}</span>
                <span className="font-mono tabular-nums">{state.rowCount} rows{state.elapsedMs ? ` / ${state.elapsedMs}ms` : ''}</span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
