'use client'

import { useMemo, useState } from 'react'
import { Bot, CheckCircle2, Eye, Loader2, SlidersHorizontal, Sparkles, TriangleAlert, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { ChartAiPatch } from '@/lib/ai/chart-ai-contract'
import type { DashboardChartConfig } from '@/types/dashboard-chart'

export interface AiFieldDescriptor {
  id: string
  label: string
  semanticKey: string
  role: string
  classification: string
}

export interface AiMetricDescriptor {
  id: string
  label: string
  semanticKey: string
  aggregation: string
  classification: string
}

export interface AiChartContext {
  contractVersion: string
  dataset: {
    id: string
    name: string
    status: string
  }
  chart: DashboardChartConfig | null
  allowedFields: AiFieldDescriptor[]
  allowedMetrics: AiMetricDescriptor[]
  blockedFieldCount?: number
  blockedMetricCount?: number
  preview?: {
    rows: Record<string, unknown>[]
    fields: string[]
    rowCount: number
    elapsedMs: number
    warnings: string[]
  } | null
}

interface RefineResponse {
  patch: ChartAiPatch | null
  chart: DashboardChartConfig | null
  validation: {
    state: string
    issues: Array<{ severity: string; code: string; message: string }>
  } | null
  errorCode?: 'restricted_field_request' | 'unsupported_chart_edit' | 'invalid_model_patch' | 'chart_validation_failed'
  error?: string
}

interface AiChartRefinementDialogProps {
  chart: DashboardChartConfig
  tenantId: string
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplied: (chart: DashboardChartConfig) => void
}

function errorToText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
  }
  return 'Request failed'
}

function refinementErrorMessage(payload: RefineResponse | { error?: unknown; errorCode?: unknown } | null) {
  if (payload?.errorCode === 'restricted_field_request') {
    return 'That request uses data that is restricted from AI refinement. Try a governed dimension or aggregated metric instead.'
  }
  if (payload?.errorCode === 'invalid_model_patch') {
    return 'The model returned a patch that did not match the approved chart schema. The current chart was left unchanged.'
  }
  if (payload?.errorCode === 'chart_validation_failed') {
    return 'The proposed edit did not pass chart validation. Try a smaller change or pick one of the suggested actions.'
  }
  if (payload?.errorCode === 'unsupported_chart_edit') {
    return 'That edit is not supported by the governed chart refinement workflow yet.'
  }
  return errorToText(payload)
}

function labelById(chart: DashboardChartConfig, context: AiChartContext | null) {
  const labels = new Map<string, string>()
  for (const field of context?.allowedFields ?? []) labels.set(field.id, field.label)
  for (const metric of context?.allowedMetrics ?? []) labels.set(metric.id, metric.label)
  Object.entries(chart.encoding.labelById ?? {}).forEach(([id, label]) => labels.set(id, label))
  return labels
}

function metricLabels(ids: string[] | undefined, labels: Map<string, string>) {
  const values = (ids ?? []).map(id => labels.get(id) ?? id)
  return values.length ? values.join(', ') : 'None'
}

function filterLabels(filters: DashboardChartConfig['encoding']['filters'], labels: Map<string, string>) {
  if (!filters?.length) return 'None'
  return filters.map(filter => {
    const value = Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)
    return `${labels.get(filter.fieldId) ?? filter.fieldId} ${filter.operator} ${value}`
  }).join('; ')
}

export function describeAiChartDiff({
  before,
  after,
  context,
}: {
  before: DashboardChartConfig
  after: DashboardChartConfig
  context: AiChartContext | null
}) {
  const labels = labelById(before, context)
  const changes: Array<{ label: string; before: string; after: string }> = []

  if (before.name !== after.name) changes.push({ label: 'Title', before: before.name, after: after.name })
  if (before.templateId !== after.templateId) changes.push({ label: 'Chart type', before: before.templateId, after: after.templateId })

  const beforeXAxis = before.encoding.xAxisFieldId ? labels.get(before.encoding.xAxisFieldId) ?? before.encoding.xAxisFieldId : 'None'
  const afterXAxis = after.encoding.xAxisFieldId ? labels.get(after.encoding.xAxisFieldId) ?? after.encoding.xAxisFieldId : 'None'
  if (beforeXAxis !== afterXAxis) changes.push({ label: 'X axis', before: beforeXAxis, after: afterXAxis })

  const beforeMetrics = metricLabels(before.encoding.yMetricIds, labels)
  const afterMetrics = metricLabels(after.encoding.yMetricIds, labels)
  if (beforeMetrics !== afterMetrics) changes.push({ label: 'Metrics', before: beforeMetrics, after: afterMetrics })

  if ((before.encoding.seriesFieldId ?? '') !== (after.encoding.seriesFieldId ?? '')) {
    changes.push({
      label: 'Grouping',
      before: before.encoding.seriesFieldId ? labels.get(before.encoding.seriesFieldId) ?? before.encoding.seriesFieldId : 'None',
      after: after.encoding.seriesFieldId ? labels.get(after.encoding.seriesFieldId) ?? after.encoding.seriesFieldId : 'None',
    })
  }

  if ((before.encoding.limit ?? null) !== (after.encoding.limit ?? null)) {
    changes.push({
      label: 'Row limit',
      before: String(before.encoding.limit ?? 'None'),
      after: String(after.encoding.limit ?? 'None'),
    })
  }

  const beforeFilters = filterLabels(before.encoding.filters, labels)
  const afterFilters = filterLabels(after.encoding.filters, labels)
  if (beforeFilters !== afterFilters) changes.push({ label: 'Filters', before: beforeFilters, after: afterFilters })

  if (before.presentation.size !== after.presentation.size) {
    changes.push({ label: 'Card size', before: before.presentation.size, after: after.presentation.size })
  }

  return changes
}

export function buildAiChartExamplePrompts(chart: DashboardChartConfig, context: AiChartContext | null) {
  const fields = context?.allowedFields ?? []
  const metrics = context?.allowedMetrics ?? []
  const dateField = fields.find(field => /month|date|day|year/i.test(`${field.label} ${field.semanticKey}`))
  const cityField = fields.find(field => /city/i.test(`${field.label} ${field.semanticKey}`))
  const firstMetric = metrics[0]
  const secondMetric = metrics[1]

  return [
    chart.templateId !== 'line' && dateField ? 'Make this a line chart' : 'Make this a bar chart',
    cityField ? `Group by ${cityField.label}` : fields[0] ? `Group by ${fields[0].label}` : '',
    firstMetric && secondMetric ? `Compare ${firstMetric.label} vs ${secondMetric.label}` : firstMetric ? `Focus on ${firstMetric.label}` : '',
    'Sort by highest value and show the top 10',
    dateField ? `Filter ${dateField.label} to the latest period` : '',
    `Rename this to ${dateField ? 'Monthly Billing Trend' : 'Executive Operations Trend'}`,
  ].filter(Boolean).slice(0, 6)
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function previewBindings(chart: DashboardChartConfig, context: AiChartContext | null) {
  const labels = labelById(chart, context)
  const xField = chart.encoding.xAxisFieldId ? labels.get(chart.encoding.xAxisFieldId) ?? '' : ''
  const yField = chart.encoding.yMetricIds[0] ? labels.get(chart.encoding.yMetricIds[0]) ?? '' : ''
  return { xField, yField }
}

export function canRenderAiChartPreview(chart: DashboardChartConfig, context: AiChartContext | null) {
  const rows = context?.preview?.rows ?? []
  const { xField, yField } = previewBindings(chart, context)
  return rows.length > 0
    && Boolean(xField)
    && Boolean(yField)
    && rows.some(row => Object.prototype.hasOwnProperty.call(row, xField) && Object.prototype.hasOwnProperty.call(row, yField))
    && ['bar', 'horizontal-bar', 'line', 'trend-composed', 'pie', 'ring-gauge'].includes(chart.templateId)
}

function MiniChartPreview({ chart, context }: { chart: DashboardChartConfig; context: AiChartContext | null }) {
  const rows = (context?.preview?.rows ?? []).slice(0, chart.encoding.limit ?? 8)
  const { xField, yField } = previewBindings(chart, context)
  const colors = [
    'var(--dos-chart-info)',
    'var(--dos-chart-success)',
    'var(--dos-chart-warning)',
    'var(--dos-chart-risk)',
    'var(--dos-accent-primary)',
  ]

  if (!canRenderAiChartPreview(chart, context)) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-6 text-center">
        <Eye className="h-5 w-5 text-[color:var(--dos-text-muted)]" />
        <p className="mt-3 text-sm font-semibold text-[color:var(--dos-text-primary)]">Visual preview unavailable</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-[color:var(--dos-text-muted)]">
          This patch is still validated, but the sanitized preview rows do not include the required axis/metric labels for a rendered preview.
        </p>
      </div>
    )
  }

  const values = rows.map(row => toNumber(row[yField]))
  const max = Math.max(...values, 1)

  if (chart.templateId === 'line' || chart.templateId === 'trend-composed') {
    const points = values.map((value, index) => {
      const x = rows.length <= 1 ? 10 : 10 + (index / (rows.length - 1)) * 280
      const y = 130 - (value / max) * 105
      return `${x},${y}`
    }).join(' ')
    return (
      <div className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4">
        <svg viewBox="0 0 300 150" className="h-56 w-full overflow-visible">
          <polyline points={points} fill="none" stroke={colors[0]} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {values.map((value, index) => {
            const x = rows.length <= 1 ? 10 : 10 + (index / (rows.length - 1)) * 280
            const y = 130 - (value / max) * 105
            return <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill={colors[1]} />
          })}
        </svg>
        <p className="text-xs text-[color:var(--dos-text-muted)]">{xField} / {yField}</p>
      </div>
    )
  }

  if (chart.templateId === 'pie' || chart.templateId === 'ring-gauge') {
    const total = values.reduce((sum, value) => sum + value, 0) || 1
    return (
      <div className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4">
        <div className="grid gap-3">
          {rows.slice(0, 6).map((row, index) => {
            const pct = Math.round((toNumber(row[yField]) / total) * 100)
            return (
              <div key={`${String(row[xField])}-${index}`} className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="min-w-0 flex-1 truncate text-xs text-[color:var(--dos-text-secondary)]">{String(row[xField] ?? `#${index + 1}`)}</span>
                <span className="text-xs font-semibold text-[color:var(--dos-text-primary)]">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4">
      <div className="space-y-3">
        {rows.slice(0, 8).map((row, index) => {
          const value = toNumber(row[yField])
          const width = Math.max(4, Math.round((value / max) * 100))
          return (
            <div key={`${String(row[xField])}-${index}`} className={chart.templateId === 'horizontal-bar' ? 'space-y-1' : 'grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3'}>
              <span className="truncate text-xs text-[color:var(--dos-text-muted)]">{String(row[xField] ?? `#${index + 1}`)}</span>
              <div className="h-7 overflow-hidden rounded-md bg-[var(--dos-surface-muted)]">
                <div className="flex h-full items-center justify-end rounded-md px-2 text-[10px] font-semibold text-white" style={{ width: `${width}%`, backgroundColor: colors[index % colors.length] }}>
                  {value.toLocaleString('en')}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AiChartRefinementDialog({
  chart,
  tenantId,
  projectId,
  open,
  onOpenChange,
  onApplied,
}: AiChartRefinementDialogProps) {
  const [context, setContext] = useState<AiChartContext | null>(null)
  const [prompt, setPrompt] = useState('')
  const [loadingContext, setLoadingContext] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [result, setResult] = useState<RefineResponse | null>(null)
  const [error, setError] = useState('')

  const examples = useMemo(() => buildAiChartExamplePrompts(chart, context), [chart, context])
  const quickActions = useMemo(() => {
    const prompts = buildAiChartExamplePrompts(chart, context)
    return [
      { label: 'Rename', prompt: prompts.find(item => item.toLowerCase().startsWith('rename')) ?? `Rename this to ${chart.name}` },
      { label: 'Type', prompt: prompts.find(item => item.toLowerCase().includes('chart')) ?? 'Make this a bar chart' },
      { label: 'Group', prompt: prompts.find(item => item.toLowerCase().startsWith('group')) ?? '' },
      { label: 'Compare', prompt: prompts.find(item => item.toLowerCase().startsWith('compare')) ?? '' },
      { label: 'Sort/Limit', prompt: prompts.find(item => item.toLowerCase().includes('top 10')) ?? 'Sort by highest value and show the top 10' },
    ].filter(action => action.prompt)
  }, [chart, context])
  const diff = useMemo(() => (
    result?.chart ? describeAiChartDiff({ before: chart, after: result.chart, context }) : []
  ), [chart, context, result?.chart])

  async function fetchContext() {
    setLoadingContext(true)
    setError('')
    try {
      const response = await fetch('/api/ai/chart-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          projectId,
          chartId: chart.id,
          purpose: 'chart_refinement',
          includePreview: true,
        }),
      })
      const payload = await response.json().catch(() => null) as { context?: AiChartContext; error?: string } | null
      if (!response.ok || !payload?.context) throw new Error(errorToText(payload))
      setContext(payload.context)
    } catch (caught) {
      setError(errorToText(caught))
    } finally {
      setLoadingContext(false)
    }
  }

  async function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (nextOpen && !context && !loadingContext) void fetchContext()
    if (!nextOpen) {
      setPrompt('')
      setResult(null)
      setError('')
    }
  }

  async function submitPrompt() {
    if (!prompt.trim()) {
      setError('Describe the chart change first.')
      return
    }
    setGenerating(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/ai/chart-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          projectId,
          chartId: chart.id,
          instruction: prompt.trim(),
          includePreview: true,
          apply: false,
        }),
      })
      const payload = await response.json().catch(() => null) as RefineResponse | null
      if (!response.ok || !payload) {
        setError(refinementErrorMessage(payload))
        return
      }
      setResult(payload)
    } catch (caught) {
      setError(errorToText(caught))
    } finally {
      setGenerating(false)
    }
  }

  async function acceptPatch() {
    if (!result?.patch) return
    setApplying(true)
    setError('')
    try {
      const response = await fetch('/api/ai/chart-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          projectId,
          chartId: chart.id,
          instruction: prompt.trim() || 'Apply reviewed AI chart patch',
          patch: result.patch,
          apply: true,
        }),
      })
      const payload = await response.json().catch(() => null) as RefineResponse | null
      if (!response.ok || !payload?.chart) {
        setError(refinementErrorMessage(payload))
        return
      }
      onApplied(payload.chart)
      setResult(payload)
      toast.success('AI refinement applied')
    } catch (caught) {
      setError(errorToText(caught))
    } finally {
      setApplying(false)
    }
  }

  async function rejectPatch() {
    setRejecting(true)
    setError('')
    try {
      await fetch('/api/ai/chart-refine/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          projectId,
          chartId: chart.id,
          reason: 'Reviewer rejected AI refinement preview',
        }),
      })
      setResult(null)
      setPrompt('')
      toast.success('AI refinement rejected')
    } catch (caught) {
      setError(errorToText(caught))
    } finally {
      setRejecting(false)
    }
  }

  const status = generating ? 'generating' : result?.chart ? 'preview ready' : error ? 'validation failed' : 'idle'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-0 text-[color:var(--dos-text-primary)]">
        <DialogHeader className="border-b border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--dos-accent-primary-soft)] text-[color:var(--dos-accent-primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg text-[color:var(--dos-text-primary)]">Refine with AI</DialogTitle>
              <DialogDescription className="mt-1 text-[color:var(--dos-text-muted)]">
                Propose a validated chart-config patch from governed semantic context. The chart stays unchanged until you accept.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-5 p-6">
            <div className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dos-chart-success)]">Current chart</p>
                  <h3 className="mt-1 text-base font-semibold">{chart.name}</h3>
                  <p className="mt-1 text-xs text-[color:var(--dos-text-muted)]">{chart.templateId} / {chart.validationState} / dataset {context?.dataset.name ?? chart.datasetId}</p>
                </div>
                <Badge variant="outline" className="border-[color:var(--dos-chart-info)] bg-[var(--dos-info-soft)] text-[color:var(--dos-chart-info)]">
                  {status}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[color:var(--dos-text-secondary)]" htmlFor={`ai-refine-${chart.id}`}>
                Natural-language refinement
              </label>
              <Textarea
                id={`ai-refine-${chart.id}`}
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="Example: make this a line chart and rename it to Monthly Billing Trend"
                className="min-h-28 border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[color:var(--dos-text-primary)] placeholder:text-[color:var(--dos-text-muted)]"
              />
              <div className="flex flex-wrap gap-2">
                {quickActions.map(action => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => setPrompt(action.prompt)}
                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] px-3 py-1 text-xs font-medium text-[color:var(--dos-accent-primary)] transition hover:bg-[var(--dos-surface)]"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    {action.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {examples.map(example => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="rounded-full border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] px-3 py-1 text-xs text-[color:var(--dos-text-secondary)] transition hover:border-[color:var(--dos-accent-primary)] hover:text-[color:var(--dos-accent-primary)]"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] p-3 text-sm text-[color:var(--dos-chart-warning)]">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {result?.chart ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
                <div className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dos-chart-info)]">Before / After</p>
                      <h3 className="mt-1 text-sm font-semibold">Structured patch preview</h3>
                    </div>
                    <Badge variant="outline" className={result.validation?.state === 'valid'
                      ? 'border-[color:var(--dos-chart-success)] text-[color:var(--dos-chart-success)]'
                      : 'border-[color:var(--dos-chart-warning)] text-[color:var(--dos-chart-warning)]'}
                    >
                      {result.validation?.state ?? 'validated'}
                    </Badge>
                  </div>
                  <div className="mt-4 space-y-2">
                    {diff.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[color:var(--dos-border-soft)] p-4 text-sm text-[color:var(--dos-text-muted)]">
                        The proposed patch is valid but does not change visible chart settings.
                      </div>
                    ) : diff.map(change => (
                      <div key={change.label} className="grid gap-2 rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-3 text-sm md:grid-cols-[110px_minmax(0,1fr)]">
                        <span className="font-semibold text-[color:var(--dos-text-primary)]">{change.label}</span>
                        <div className="grid gap-2">
                          <span className="rounded-md bg-[var(--dos-surface-muted)] px-2 py-1 text-[color:var(--dos-text-muted)]">{change.before}</span>
                          <span className="rounded-md bg-[var(--dos-success-soft)] px-2 py-1 text-[color:var(--dos-chart-success)]">{change.after}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {result.validation?.issues?.length ? (
                    <div className="mt-3 rounded-lg border border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] p-3 text-xs text-[color:var(--dos-chart-warning)]">
                      {result.validation.issues[0]?.message}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dos-chart-success)]">Rendered preview</p>
                      <h3 className="mt-1 text-sm font-semibold">{result.chart.name}</h3>
                    </div>
                    <Eye className="h-4 w-4 text-[color:var(--dos-text-muted)]" />
                  </div>
                  <MiniChartPreview chart={result.chart} context={context} />
                </div>
              </div>
            ) : !generating ? (
              <div className="rounded-xl border border-dashed border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--dos-info-soft)] text-[color:var(--dos-chart-info)]">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[color:var(--dos-text-primary)]">Describe a safe chart edit</h3>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--dos-text-muted)]">
                      Try a rename, compatible type change, metric comparison, grouping swap, sort, row limit, or a narrow literal filter. The patch will be validated before anything changes.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="border-t border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-6 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[color:var(--dos-chart-success)]" />
                  <p className="text-sm font-semibold">AI-safe context</p>
                </div>
                {loadingContext ? (
                  <div className="mt-4 flex items-center gap-2 text-xs text-[color:var(--dos-text-muted)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading governed fields
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 text-xs text-[color:var(--dos-text-muted)]">
                    <p>{context?.allowedFields.length ?? 0} allowed dimensions</p>
                    <p>{context?.allowedMetrics.length ?? 0} allowed metrics</p>
                    <p>{(context?.blockedFieldCount ?? 0) + (context?.blockedMetricCount ?? 0)} restricted fields hidden</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
                <p className="text-sm font-semibold">Guardrails</p>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-[color:var(--dos-text-muted)]">
                  <li>No SQL or code generation</li>
                  <li>Only semantic IDs can change</li>
                  <li>Patch must pass chart validation</li>
                  <li>Blocked fields stay hidden</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>

        <DialogFooter className="border-t border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] px-6 py-4">
          {result?.patch ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void rejectPatch()}
              disabled={rejecting || applying}
              className="border-[color:var(--dos-border-soft)] bg-transparent text-[color:var(--dos-text-secondary)] hover:bg-[var(--dos-surface-muted)]"
            >
              {rejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Reject
            </Button>
          ) : null}
          {result?.patch ? (
            <Button
              type="button"
              onClick={() => void acceptPatch()}
              disabled={applying || generating}
              className="bg-[var(--dos-chart-success)] text-[color:var(--dos-background-deep)] hover:bg-[var(--dos-chart-success)]"
            >
              {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Accept patch
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void submitPrompt()}
              disabled={generating || loadingContext || !prompt.trim()}
              className="bg-[var(--dos-accent-primary)] text-[color:var(--dos-background-deep)] hover:bg-[var(--dos-accent-primary-hover)]"
            >
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate preview
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
