'use client'

import { AlertTriangle, BarChart3, Loader2, Table2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { ModernBarChart } from '@/components/charts/modern-bar-chart'
import { ModernGroupedBarChart } from '@/components/charts/modern-grouped-bar-chart'
import { ModernHorizontalBarChart } from '@/components/charts/modern-horizontal-bar-chart'
import { ModernHorizontalStackedBarChart } from '@/components/charts/modern-horizontal-stacked-bar-chart'
import { ModernLineChart } from '@/components/charts/modern-line-chart'
import { ModernPieChart } from '@/components/charts/modern-pie-chart'
import { Badge } from '@/components/ui/badge'
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

function chartStyle(chart: DashboardChartConfig) {
  const colors = Object.values(chart.encoding.colorById).filter(Boolean)
  return {
    colors: colors.length > 0 ? colors : ['#a6e22e', '#66d9ef', '#f92672', '#fd971f', '#ae81ff', '#e6db74'],
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
    <div className="overflow-x-auto rounded-md border border-[#272822]/10 bg-white">
      <table className="w-full min-w-[520px] table-fixed text-left text-xs">
        <thead className="bg-[#f8f8f2] text-[11px] uppercase text-[#75715e]">
          <tr>
            {columns.map(column => (
              <th key={column} className="w-40 truncate px-3 py-2 font-medium">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#272822]/10">
          {rows.slice(0, 10).map((row, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td key={column} className="truncate px-3 py-2 text-[#3e3d32]">
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
    <div className="grid gap-3 sm:grid-cols-2">
      {metrics.map((metricId, index) => {
        const label = labels[index] || fieldNameFromId(chart, metricId)
        return (
          <div key={metricId} className="rounded-md border border-[#272822]/10 bg-white p-4">
            <p className="text-xs font-medium text-[#75715e]">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[#272822]">
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
}: {
  chart: DashboardChartConfig
  state: ChartRunState
}) {
  if (state.status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-[#75715e]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading dataset
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex gap-2 rounded-md border border-[#f92672]/20 bg-[#f92672]/10 p-3 text-xs text-[#8a0030]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{state.error}</span>
      </div>
    )
  }

  const rows = applyChartLimit(state.rows, chart, state)
  const xField = state.resolved.xField || state.fieldNames[0] || 'name'
  const yFields = state.resolved.yFields.length > 0
    ? state.resolved.yFields
    : chart.encoding.yMetricIds.map(metricId => fieldNameFromId(chart, metricId)).filter(Boolean)
  const primaryMetric = yFields[0] ?? state.fieldNames.find(field => field !== xField) ?? 'value'
  const style = chartStyle(chart)
  const height = chartHeight(chart)

  if (!rows.length) {
    return <div className="rounded-md border border-dashed border-[#272822]/15 p-6 text-center text-xs text-[#75715e]">No rows returned.</div>
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
  const chartIds = useMemo(() => charts.map(chart => chart.id), [charts])

  const chartKey = useMemo(() => chartIds.join('|'), [chartIds])

  useEffect(() => {
    const controller = new AbortController()
    const ids = chartKey ? chartKey.split('|') : []

    async function loadCharts() {
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
          return [chartId, {
            status: 'ready' as const,
            rows: payload.result?.rows ?? [],
            fieldNames: fieldNamesFromResult(payload.result?.fields),
            resolved: {
              xField: payload.result?.chart?.resolved?.xField ?? '',
              yFields: payload.result?.chart?.resolved?.yFields ?? [],
              tooltipFields: payload.result?.chart?.resolved?.tooltipFields ?? [],
              sortField: payload.result?.chart?.resolved?.sortField ?? '',
            },
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
  }, [chartKey, tenantSlug])

  if (charts.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Published charts</h2>
          <p className="mt-1 text-xs text-[#75715e]">Validated chart configs rendered from read-only semantic datasets.</p>
        </div>
        <Badge variant="outline" className="border-[#66d9ef]/30 bg-[#66d9ef]/10 text-[#13515e]">
          {charts.length} charts
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {charts.map(chart => {
          const state = chartRuns[chart.id] ?? EMPTY_STATE
          return (
            <article key={chart.id} className={`${sizeClass(chart)} rounded-lg border border-[#272822]/10 bg-[#f8f8f2] p-4 shadow-sm`}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#a6e22e]" />
                    <h3 className="truncate text-sm font-semibold">{chart.name}</h3>
                  </div>
                  <p className="mt-1 text-[11px] text-[#75715e]">
                    {chart.templateId} / {state.rowCount} rows / {state.elapsedMs}ms
                  </p>
                </div>
                <Table2 className="h-4 w-4 text-[#75715e]" />
              </div>
              <ChartBody chart={chart} state={state} />
            </article>
          )
        })}
      </div>
    </section>
  )
}
