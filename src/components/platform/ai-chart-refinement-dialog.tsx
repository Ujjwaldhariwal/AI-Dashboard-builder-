'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Bot, CheckCircle2, Eye, Loader2, SlidersHorizontal, Sparkles, TriangleAlert, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { ModernBarChart } from '@/components/charts/modern-bar-chart'
import { ModernGroupedBarChart } from '@/components/charts/modern-grouped-bar-chart'
import { ModernHorizontalBarChart } from '@/components/charts/modern-horizontal-bar-chart'
import { ModernHorizontalStackedBarChart } from '@/components/charts/modern-horizontal-stacked-bar-chart'
import { ModernLineChart } from '@/components/charts/modern-line-chart'
import { ModernPieChart } from '@/components/charts/modern-pie-chart'
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
import type { ChartAiPatch, ChartRefinementMode } from '@/lib/ai/chart-ai-contract'
import { dashboardChartPresentationToWidgetStyle } from '@/lib/charts/dashboard-chart-presentation'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'
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
  proposalId?: string
  baseUpdatedAt?: string
  proposalStatus?: 'validated' | 'needs_review' | 'applied' | 'rejected'
  validation: {
    state: string
    issues: Array<{ severity: string; code: string; message: string }>
  } | null
  errorCode?: 'feature_gated' | 'restricted_field_request' | 'unsupported_chart_edit' | 'invalid_model_patch' | 'schema_version_mismatch' | 'chart_validation_failed'
    | 'model_parse_failure' | 'stale_chart_revision' | 'invalid_chart_proposal'
    | 'proposal_regeneration_required' | 'chart_refinement_migration_required' | 'chart_refinement_apply_failed'
  resolution?: 'reviewed' | 'deterministic' | 'model'
  error?: string
}

interface AiChartRefinementDialogProps {
  chart: DashboardChartConfig
  tenantId: string
  projectId: string
  open: boolean
  mode?: ChartRefinementMode
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
  if (payload?.errorCode === 'model_parse_failure') {
    return 'The model response could not be parsed as a chart patch. The current chart was left unchanged.'
  }
  if (payload?.errorCode === 'schema_version_mismatch') {
    return 'The patch used a schema version this environment does not support. The current chart was left unchanged.'
  }
  if (payload?.errorCode === 'chart_validation_failed') {
    return 'The proposed edit did not pass chart validation. Try a smaller change or pick one of the suggested actions.'
  }
  if (payload?.errorCode === 'unsupported_chart_edit') {
    return 'That edit is not supported by the governed chart refinement workflow yet.'
  }
  if (payload?.errorCode === 'feature_gated') {
    return 'AI chart refinement is gated for this tenant, project, or user. No chart changes were made.'
  }
  if (payload?.errorCode === 'stale_chart_revision') {
    return 'This chart changed after the preview was generated. Review the latest chart and generate a new proposal.'
  }
  if (payload?.errorCode === 'invalid_chart_proposal') {
    return 'This saved proposal is no longer available or does not match the current chart. Generate a new proposal.'
  }
  if (payload?.errorCode === 'proposal_regeneration_required') {
    return 'This proposal was created before transactional apply support. Generate a replacement proposal before accepting it.'
  }
  if (payload?.errorCode === 'chart_refinement_migration_required') {
    return 'Chart refinement review is temporarily unavailable because the required database migration has not been deployed.'
  }
  if (payload?.errorCode === 'chart_refinement_apply_failed') {
    return 'The database could not apply this proposal. The source chart was rolled back and the proposal was closed safely.'
  }
  return errorToText(payload)
}

type AiRefinementVisualState =
  | 'idle'
  | 'context unavailable'
  | 'generating'
  | 'preview ready'
  | 'restricted request'
  | 'validation failed'
  | 'applied'

type AiContextLoadState = 'idle' | 'loading' | 'ready' | 'error'
type ProposalLifecycle = RefineResponse['proposalStatus'] | 'regeneration_required'

const DASHBOARDOS_THEME_VARIABLES = [
  '--dos-background-deep',
  '--dos-background-base',
  '--dos-surface',
  '--dos-surface-raised',
  '--dos-surface-muted',
  '--dos-text-primary',
  '--dos-text-secondary',
  '--dos-text-muted',
  '--dos-border-soft',
  '--dos-border-mid',
  '--dos-card-overlay',
  '--dos-accent-primary',
  '--dos-accent-primary-hover',
  '--dos-accent-primary-soft',
  '--dos-success',
  '--dos-success-text',
  '--dos-success-soft',
  '--dos-warning',
  '--dos-warning-text',
  '--dos-warning-soft',
  '--dos-danger',
  '--dos-danger-text',
  '--dos-danger-soft',
  '--dos-info',
  '--dos-info-text',
  '--dos-info-soft',
  '--dos-chart-success',
  '--dos-chart-risk',
  '--dos-chart-warning',
  '--dos-chart-info',
] as const

function refinementStatusClass(status: AiRefinementVisualState) {
  if (status === 'applied') return 'border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] text-[color:var(--dos-chart-success)]'
  if (status === 'preview ready') return 'border-[color:var(--dos-chart-info)] bg-[var(--dos-info-soft)] text-[color:var(--dos-chart-info)]'
  if (status === 'context unavailable') return 'border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[color:var(--dos-chart-warning)]'
  if (status === 'restricted request') return 'border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[color:var(--dos-chart-warning)]'
  if (status === 'validation failed') return 'border-[color:var(--dos-chart-risk)] bg-[var(--dos-danger-soft)] text-[color:var(--dos-chart-risk)]'
  if (status === 'generating') return 'border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] text-[color:var(--dos-accent-primary)]'
  return 'border-[color:var(--dos-border-soft)] text-[color:var(--dos-text-muted)]'
}

function refinementErrorClass(errorCode: RefineResponse['errorCode'] | null) {
  if (errorCode === 'restricted_field_request') {
    return 'border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[color:var(--dos-chart-warning)]'
  }
  if (errorCode === 'feature_gated') {
    return 'border-[color:var(--dos-chart-info)] bg-[var(--dos-info-soft)] text-[color:var(--dos-chart-info)]'
  }
  return 'border-[color:var(--dos-chart-risk)] bg-[var(--dos-danger-soft)] text-[color:var(--dos-chart-risk)]'
}

function proposalLifecycleClass(status: ProposalLifecycle) {
  if (status === 'applied') return 'border-[color:var(--dos-chart-success)] text-[color:var(--dos-chart-success)]'
  if (status === 'rejected' || status === 'regeneration_required') return 'border-[color:var(--dos-chart-warning)] text-[color:var(--dos-chart-warning)]'
  return 'border-[color:var(--dos-chart-info)] text-[color:var(--dos-chart-info)]'
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

function presentationSummary(value: Record<string, unknown> | undefined) {
  if (!value || Object.keys(value).length === 0) return 'Theme default'
  return Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(', ')
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

  const beforeTooltips = metricLabels(before.encoding.tooltipFieldIds, labels)
  const afterTooltips = metricLabels(after.encoding.tooltipFieldIds, labels)
  if (beforeTooltips !== afterTooltips) {
    changes.push({ label: 'Tooltip fields', before: beforeTooltips, after: afterTooltips })
  }

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

  const presentationChanges: Array<[string, string, string]> = [
    [
      'Palette',
      before.presentation.colors?.join(', ') ?? 'Theme default',
      after.presentation.colors?.join(', ') ?? 'Theme default',
    ],
    ['Legend', `${before.presentation.showLegend ? 'shown' : 'hidden'} / ${before.presentation.legendPosition ?? 'auto'}`, `${after.presentation.showLegend ? 'shown' : 'hidden'} / ${after.presentation.legendPosition ?? 'auto'}`],
    ['Value labels', `${before.presentation.showLabels ? 'shown' : 'hidden'} / ${presentationSummary(before.presentation.labels)}`, `${after.presentation.showLabels ? 'shown' : 'hidden'} / ${presentationSummary(after.presentation.labels)}`],
    ['Grid', before.presentation.showGrid === false ? 'hidden' : 'shown', after.presentation.showGrid === false ? 'hidden' : 'shown'],
    ['X axis style', presentationSummary(before.presentation.xAxis), presentationSummary(after.presentation.xAxis)],
    ['Y axis style', presentationSummary(before.presentation.yAxis), presentationSummary(after.presentation.yAxis)],
    ['Tooltip style', presentationSummary(before.presentation.tooltip), presentationSummary(after.presentation.tooltip)],
    ['Margins', presentationSummary(before.presentation.margins), presentationSummary(after.presentation.margins)],
    ['Line style', presentationSummary(before.presentation.line), presentationSummary(after.presentation.line)],
    ['Bar style', presentationSummary(before.presentation.bar), presentationSummary(after.presentation.bar)],
  ]
  presentationChanges.forEach(([label, beforeValue, afterValue]) => {
    if (beforeValue !== afterValue) changes.push({ label, before: beforeValue, after: afterValue })
  })

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
    'Use a pink palette, show bold value labels, and keep the card compact',
    dateField ? 'Show only the date on the bottom axis, hide the time, and make those labels slightly bold' : '',
    'Add clear axis titles, rotate X labels 30 degrees, and use 14px bold axis labels',
    'Move the legend to the bottom, use 24px margins, and enable a dark tooltip',
  ].filter(Boolean).slice(0, 9)
}

function previewBindings(chart: DashboardChartConfig, context: AiChartContext | null) {
  const labels = labelById(chart, context)
  const xField = chart.encoding.xAxisFieldId ? labels.get(chart.encoding.xAxisFieldId) ?? '' : ''
  const yFields = chart.encoding.yMetricIds.map(metricId => labels.get(metricId) ?? '').filter(Boolean)
  const tooltipFields = chart.encoding.tooltipFieldIds.map(fieldId => labels.get(fieldId) ?? '').filter(Boolean)
  return { xField, yField: yFields[0] ?? '', yFields, tooltipFields }
}

export function canRenderAiChartPreview(chart: DashboardChartConfig, context: AiChartContext | null) {
  const rows = context?.preview?.rows ?? []
  const { xField, yField } = previewBindings(chart, context)
  return rows.length > 0
    && Boolean(xField)
    && Boolean(yField)
    && rows.some(row => Object.prototype.hasOwnProperty.call(row, xField) && Object.prototype.hasOwnProperty.call(row, yField))
    && [
      'bar',
      'horizontal-bar',
      'grouped-bar',
      'horizontal-stacked-bar',
      'line',
      'trend-composed',
      'pie',
      'ring-gauge',
    ].includes(chart.templateId)
}

function MiniChartPreview({ chart, context }: { chart: DashboardChartConfig; context: AiChartContext | null }) {
  const rows = (context?.preview?.rows ?? []).slice(0, chart.encoding.limit ?? 8)
  const { xField, yField, yFields, tooltipFields } = previewBindings(chart, context)

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

  const style = dashboardChartPresentationToWidgetStyle(chart.presentation, [
    '#4F46E5',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#06B6D4',
  ], {
    templateId: chart.templateId,
    labelById: chart.encoding.labelById,
  })
  const sizePreset: WidgetSizePreset = chart.presentation.size === 'compact'
    ? 'small'
    : chart.presentation.size === 'wide'
      ? 'large'
      : chart.presentation.size === 'full'
        ? 'full'
        : 'medium'

  let preview: ReactNode
  if (chart.templateId === 'line' || chart.templateId === 'trend-composed') {
    preview = <ModernLineChart data={rows} xField={xField} yField={yField} tooltipFields={tooltipFields} style={style} sizePreset={sizePreset} />
  } else if (chart.templateId === 'pie' || chart.templateId === 'ring-gauge') {
    preview = <ModernPieChart data={rows} nameField={xField} valueField={yField} donut={chart.templateId === 'ring-gauge'} style={style} sizePreset={sizePreset} />
  } else if (chart.templateId === 'horizontal-bar') {
    preview = <ModernHorizontalBarChart data={rows} xField={xField} yField={yField} tooltipFields={tooltipFields} style={style} sizePreset={sizePreset} />
  } else if (chart.templateId === 'grouped-bar') {
    preview = <ModernGroupedBarChart data={rows} xField={xField} yFields={yFields} tooltipFields={tooltipFields} style={style} sizePreset={sizePreset} />
  } else if (chart.templateId === 'horizontal-stacked-bar') {
    preview = <ModernHorizontalStackedBarChart data={rows} xField={xField} yFields={yFields} tooltipFields={tooltipFields} style={style} sizePreset={sizePreset} />
  } else {
    preview = <ModernBarChart data={rows} xField={xField} yField={yField} tooltipFields={tooltipFields} style={style} sizePreset={sizePreset} />
  }

  return (
    <div className="h-72 rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-2">
      {preview}
    </div>
  )
}

export function AiChartRefinementDialog({
  chart,
  tenantId,
  projectId,
  open,
  mode = 'general',
  onOpenChange,
  onApplied,
}: AiChartRefinementDialogProps) {
  const [context, setContext] = useState<AiChartContext | null>(null)
  const [prompt, setPrompt] = useState('')
  const [contextLoadState, setContextLoadState] = useState<AiContextLoadState>('idle')
  const [generating, setGenerating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [result, setResult] = useState<RefineResponse | null>(null)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState<RefineResponse['errorCode'] | null>(null)
  const [applied, setApplied] = useState(false)
  const [proposalLifecycle, setProposalLifecycle] = useState<ProposalLifecycle>()
  const [dialogThemeStyle, setDialogThemeStyle] = useState<CSSProperties>()
  const scrollRegionRef = useRef<HTMLDivElement>(null)

  const examples = useMemo(() => buildAiChartExamplePrompts(chart, context), [chart, context])
  const quickActions = useMemo(() => {
    const prompts = buildAiChartExamplePrompts(chart, context)
    const actions = [
      { label: 'Rename', prompt: prompts.find(item => item.toLowerCase().startsWith('rename')) ?? `Rename this to ${chart.name}` },
      { label: 'Type', prompt: prompts.find(item => item.toLowerCase().includes('chart')) ?? 'Make this a bar chart' },
      { label: 'Group', prompt: prompts.find(item => item.toLowerCase().startsWith('group')) ?? '' },
      { label: 'Compare', prompt: prompts.find(item => item.toLowerCase().startsWith('compare')) ?? '' },
      { label: 'Sort/Limit', prompt: prompts.find(item => item.toLowerCase().includes('top 10')) ?? 'Sort by highest value and show the top 10' },
      { label: 'Style', prompt: prompts.find(item => item.toLowerCase().includes('pink palette')) ?? 'Use a pink palette and bold value labels' },
      { label: 'Axes', prompt: prompts.find(item => item.toLowerCase().includes('bottom axis')) ?? prompts.find(item => item.toLowerCase().includes('axis titles')) ?? 'Add clear axis titles and bold axis labels' },
    ].filter(action => action.prompt)
    return mode === 'presentation_only'
      ? actions.filter(action => action.label === 'Style' || action.label === 'Axes')
      : actions
  }, [chart, context, mode])
  const diff = useMemo(() => (
    result?.chart ? describeAiChartDiff({ before: chart, after: result.chart, context }) : []
  ), [chart, context, result?.chart])
  const previewAvailable = useMemo(() => (
    result?.chart ? canRenderAiChartPreview(result.chart, context) : null
  ), [context, result?.chart])
  const hasRuntimeFilters = Boolean(result?.chart?.encoding.filters?.length)

  useEffect(() => {
    if (previewAvailable === null || !result?.chart) return
    void fetch('/api/ai/chart-refine/preview-observed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        projectId,
        chartId: chart.id,
        previewAvailable,
      }),
    }).catch(() => undefined)
  }, [chart.id, previewAvailable, projectId, result?.chart, tenantId])

  const fetchContext = useCallback(async () => {
    setContextLoadState('loading')
    setError('')
    setErrorCode(null)
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
      const payload = await response.json().catch(() => null) as {
        context?: AiChartContext
        error?: string
        errorCode?: RefineResponse['errorCode']
      } | null
      if (!response.ok || !payload?.context) {
        setError(refinementErrorMessage(payload))
        setErrorCode(payload?.errorCode ?? null)
        setContextLoadState('error')
        return
      }
      setContext(payload.context)
      setContextLoadState('ready')
    } catch (caught) {
      setError(errorToText(caught))
      setErrorCode(null)
      setContextLoadState('error')
    }
  }, [chart.id, projectId, tenantId])

  useEffect(() => {
    if (open && contextLoadState === 'idle') void fetchContext()
  }, [contextLoadState, fetchContext, open])

  useEffect(() => {
    setContext(null)
    setContextLoadState('idle')
    setError('')
    setErrorCode(null)
    setProposalLifecycle(undefined)
  }, [chart.id, projectId, tenantId])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => scrollRegionRef.current?.scrollTo({ top: 0, left: 0 }))
    const themeSources = document.querySelectorAll<HTMLElement>('[data-dashboardos-theme]')
    const themeSource = themeSources.item(themeSources.length - 1)
    if (!themeSource) return

    const computedStyle = window.getComputedStyle(themeSource)
    const themeVariables = Object.fromEntries(
      DASHBOARDOS_THEME_VARIABLES
        .map(variable => [variable, computedStyle.getPropertyValue(variable).trim()])
        .filter(([, value]) => Boolean(value)),
    ) as CSSProperties
    setDialogThemeStyle(themeVariables)
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  async function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setPrompt('')
      setResult(null)
      setError('')
      setErrorCode(null)
      setApplied(false)
      setProposalLifecycle(undefined)
      if (contextLoadState === 'error') setContextLoadState('idle')
    }
  }

  async function submitPrompt() {
    if (contextLoadState !== 'ready' || !context) {
      setError('Governed chart context is not ready. Retry loading the AI-safe context before generating a preview.')
      setErrorCode(null)
      return
    }
    if (!prompt.trim()) {
      setError('Describe the chart change first.')
      setErrorCode(null)
      return
    }
    setGenerating(true)
    setError('')
    setErrorCode(null)
    setResult(null)
    setApplied(false)
    setProposalLifecycle(undefined)
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
          mode,
        }),
      })
      const payload = await response.json().catch(() => null) as RefineResponse | null
      if (!response.ok || !payload) {
        setError(refinementErrorMessage(payload))
        setErrorCode(payload?.errorCode ?? null)
        return
      }
      setResult(payload)
      setProposalLifecycle(payload.proposalStatus ?? 'needs_review')
    } catch (caught) {
      setError(errorToText(caught))
    } finally {
      setGenerating(false)
    }
  }

  async function acceptPatch() {
    if (!result?.patch) return
    if (!result.baseUpdatedAt) {
      setError('The proposal is missing its source chart revision. Generate a new proposal before applying it.')
      setErrorCode(null)
      return
    }
    if (!result.proposalId) {
      setError('The proposal was not saved durably. Generate a new proposal before applying it.')
      setErrorCode(null)
      return
    }
    setApplying(true)
    setError('')
    setErrorCode(null)
    try {
      const response = await fetch('/api/ai/chart-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          projectId,
          chartId: chart.id,
          instruction: prompt.trim() || 'Apply reviewed AI chart patch',
          proposalId: result.proposalId,
          apply: true,
          mode,
          baseUpdatedAt: result.baseUpdatedAt,
        }),
      })
      const payload = await response.json().catch(() => null) as RefineResponse | null
      if (!response.ok || !payload?.chart) {
        if (payload?.proposalStatus) setProposalLifecycle(payload.proposalStatus)
        if (response.status === 409 && payload?.errorCode === 'stale_chart_revision' && payload.chart) {
          setResult(null)
          onApplied(payload.chart)
        }
        if (payload?.errorCode === 'proposal_regeneration_required') {
          setResult(null)
          setProposalLifecycle('regeneration_required')
        }
        setError(refinementErrorMessage(payload))
        setErrorCode(payload?.errorCode ?? null)
        return
      }
      onApplied(payload.chart)
      setResult(null)
      setPrompt('')
      setApplied(true)
      setProposalLifecycle(payload.proposalStatus ?? 'applied')
      toast.success('Source chart updated. Existing releases are unchanged; publish a new release to promote this edit.')
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
      const response = await fetch('/api/ai/chart-refine/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          projectId,
          chartId: chart.id,
          proposalId: result?.proposalId,
          reason: 'Reviewer rejected AI refinement preview',
        }),
      })
      const payload = await response.json().catch(() => null) as RefineResponse | null
      if (!response.ok) {
        setError(refinementErrorMessage(payload))
        setErrorCode(payload?.errorCode ?? null)
        return
      }
      setResult(null)
      setPrompt('')
      setApplied(false)
      setErrorCode(null)
      setProposalLifecycle(payload?.proposalStatus ?? 'rejected')
      toast.success('AI refinement rejected')
    } catch (caught) {
      setError(errorToText(caught))
    } finally {
      setRejecting(false)
    }
  }

  const status: AiRefinementVisualState = generating
    ? 'generating'
    : applied
      ? 'applied'
      : result?.chart
        ? 'preview ready'
        : contextLoadState === 'error'
          ? 'context unavailable'
        : errorCode === 'restricted_field_request'
          ? 'restricted request'
          : error
            ? 'validation failed'
            : 'idle'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="ai-refinement-dialog"
        className="dashboardos-admin flex h-[calc(100dvh-1rem)] max-h-[48rem] w-[calc(100%-1rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-[var(--radius-surface)] border-[color:var(--dos-border-mid)] bg-[var(--dos-surface-raised)] p-0 text-[color:var(--dos-text-primary)] sm:h-[min(48rem,calc(100dvh-2rem))] sm:w-[calc(100%-2rem)] [&>button]:z-20"
        style={dialogThemeStyle}
      >
        <DialogHeader className="shrink-0 border-b border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3 pr-9">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[color:var(--dos-accent-primary)]/20 bg-[var(--dos-accent-primary-soft)] text-[color:var(--dos-accent-primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <DialogTitle className="text-lg font-semibold tracking-tight text-[color:var(--dos-text-primary)]">AI chart refinement</DialogTitle>
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--dos-text-muted)]">Review workspace</span>
              </div>
              <DialogDescription className="mt-1 max-w-3xl text-sm leading-5 text-[color:var(--dos-text-muted)]">
                Propose a governed chart change, review the result, then save it to the source chart. Published viewers are not changed until release.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div ref={scrollRegionRef} data-testid="ai-refinement-scroll-region" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="grid min-h-full gap-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="min-w-0 space-y-5 overflow-x-hidden p-5 sm:p-6">
            <div className="rounded-[var(--radius-surface)] border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--dos-text-muted)]">Current chart</p>
                  <h3 className="mt-1 text-base font-semibold tracking-tight">{chart.name}</h3>
                  <p className="mt-1 text-xs text-[color:var(--dos-text-muted)]">{chart.templateId.replace(/-/g, ' ')} · {chart.validationState} · {context?.dataset.name ?? chart.datasetId}</p>
                </div>
                <Badge variant="outline" data-testid="ai-refinement-status" className={refinementStatusClass(status)}>
                  {status}
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-sm font-semibold text-[color:var(--dos-text-primary)]" htmlFor={`ai-refine-${chart.id}`}>
                  Describe the change
                </label>
                <span className="text-xs text-[color:var(--dos-text-muted)]">Nothing is saved until you accept</span>
              </div>
              <Textarea
                id={`ai-refine-${chart.id}`}
                aria-label="Natural-language refinement"
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="For example: use a pink palette, show bold labels, and keep this card compact."
                className="min-h-32 resize-y rounded-md border-[color:var(--dos-border-mid)] bg-[var(--dos-surface)] px-3 py-3 text-sm leading-6 text-[color:var(--dos-text-primary)] shadow-none placeholder:text-[color:var(--dos-text-muted)] focus-visible:ring-[var(--dos-accent-primary)]"
              />
              <div className="flex flex-wrap gap-2" aria-label="Refinement categories">
                {quickActions.map(action => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => setPrompt(action.prompt)}
                    className="inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-md border border-[color:var(--dos-border-mid)] bg-[var(--dos-surface)] px-2.5 text-xs font-semibold text-[color:var(--dos-text-secondary)] transition-colors duration-150 hover:border-[color:var(--dos-accent-primary)] hover:text-[color:var(--dos-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)] active:bg-[var(--dos-accent-primary-soft)]"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {action.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2" aria-label="Suggested refinements">
                {examples.map(example => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="min-h-10 min-w-0 truncate rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] px-3 py-2 text-left text-xs leading-5 text-[color:var(--dos-text-secondary)] transition-colors duration-150 hover:border-[color:var(--dos-accent-primary)] hover:bg-[var(--dos-surface)] hover:text-[color:var(--dos-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)] active:bg-[var(--dos-accent-primary-soft)]"
                    title={example}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div data-testid="ai-refinement-error" className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${refinementErrorClass(errorCode)}`}>
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {applied ? (
              <div data-testid="ai-refinement-applied" className="flex items-start gap-2 rounded-lg border border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] p-3 text-sm text-[color:var(--dos-chart-success)]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Reviewed patch applied. The updated chart remains available for normal validation and publishing checks.</span>
              </div>
            ) : null}

            {generating ? (
              <div data-testid="ai-refinement-generating" className="flex items-start gap-2 rounded-lg border border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] p-3 text-sm text-[color:var(--dos-accent-primary)]">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                <span>Preparing a governed preview. The current chart stays unchanged until you review and accept a validated patch.</span>
              </div>
            ) : null}

            {result?.chart ? (
              <div className="grid items-start gap-4">
                <div data-testid="ai-refinement-preview-diff" className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dos-chart-info)]">Before / After</p>
                      <h3 className="mt-1 text-sm font-semibold">Structured patch preview</h3>
                      {result.resolution ? (
                        <p className="mt-1 text-[11px] text-[color:var(--dos-text-muted)]">
                          {result.resolution === 'deterministic' ? 'Resolved from governed chart rules' : result.resolution === 'model' ? 'Resolved with governed AI context' : 'Revalidated reviewed patch'}
                        </p>
                      ) : null}
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
                  {hasRuntimeFilters ? (
                    <div className="mt-3 rounded-lg border border-[color:var(--dos-chart-info)] bg-[var(--dos-info-soft)] p-3 text-xs leading-5 text-[color:var(--dos-chart-info)]">
                      Narrow filters run in the published chart runtime after validation. This mini preview uses sanitized sample rows and does not re-run filter predicates.
                    </div>
                  ) : null}
                </div>
                <div data-testid="ai-refinement-mini-preview" className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
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
            ) : !generating && !applied ? (
              <div className="rounded-xl border border-dashed border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--dos-info-soft)] text-[color:var(--dos-chart-info)]">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[color:var(--dos-text-primary)]">Describe a safe chart edit</h3>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--dos-text-muted)]">
                      Try a rename, compatible type change, metric comparison, grouping swap, sort, row limit, or narrow governed filter. Filter previews are sample-based; published runtime applies the validated predicates.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="border-t border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div className="rounded-[var(--radius-surface)] border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[color:var(--dos-chart-success)]" />
                  <p className="text-sm font-semibold">AI-safe context</p>
                </div>
                {contextLoadState === 'loading' || contextLoadState === 'idle' ? (
                  <div className="mt-4 flex items-center gap-2 text-xs text-[color:var(--dos-text-muted)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading governed fields
                  </div>
                ) : contextLoadState === 'error' ? (
                  <div data-testid="ai-context-load-error" className="mt-4 space-y-3 text-xs text-[color:var(--dos-text-muted)]">
                    <p>Governed fields could not be loaded. No chart changes were made.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchContext()}
                      className="border-[color:var(--dos-border-soft)] bg-transparent"
                    >
                      Retry context
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 text-xs text-[color:var(--dos-text-muted)]">
                    <p>{context?.allowedFields.length ?? 0} allowed dimensions</p>
                    <p>{context?.allowedMetrics.length ?? 0} allowed metrics</p>
                    <p>{(context?.blockedFieldCount ?? 0) + (context?.blockedMetricCount ?? 0)} restricted fields hidden</p>
                  </div>
                )}
              </div>

              <div data-testid="ai-refinement-proposal-lifecycle" className="rounded-[var(--radius-surface)] border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Proposal lifecycle</p>
                  {proposalLifecycle ? (
                    <Badge variant="outline" className={proposalLifecycleClass(proposalLifecycle)}>
                      {proposalLifecycle.replace(/_/g, ' ')}
                    </Badge>
                  ) : (
                    <Badge variant="outline">not generated</Badge>
                  )}
                </div>
                <p className="mt-3 text-xs leading-5 text-[color:var(--dos-text-muted)]">
                  {proposalLifecycle === 'applied'
                    ? 'Applied atomically to the mutable source chart. Published releases remain unchanged.'
                    : proposalLifecycle === 'rejected'
                      ? 'Closed without changing the source chart.'
                      : proposalLifecycle === 'regeneration_required'
                        ? 'This legacy proposal cannot be applied. Generate a replacement using the current chart revision.'
                        : proposalLifecycle
                          ? 'Stored durably and waiting for an explicit accept or reject decision.'
                          : 'Generate a preview to create a durable, reviewable proposal.'}
                </p>
                {result?.proposalId ? (
                  <p className="mt-2 truncate font-mono text-[10px] text-[color:var(--dos-text-muted)]" title={result.proposalId}>
                    {result.proposalId}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[var(--radius-surface)] border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4">
                <p className="text-sm font-semibold">Governance</p>
                <ul className="mt-3 space-y-2 border-l border-[color:var(--dos-border-mid)] pl-3 text-xs leading-5 text-[color:var(--dos-text-muted)]">
                  <li>Only governed fields and semantic IDs are available.</li>
                  <li>Sensitive fields stay hidden.</li>
                  <li>No SQL, source schema, or raw record generation.</li>
                  <li>Every patch is validated before it can be saved.</li>
                  <li>Published releases stay immutable until promotion.</li>
                </ul>
              </div>
            </div>
          </aside>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] px-5 py-4 sm:px-6 sm:space-x-0">
          {applied ? (
            <Button
              type="button"
              onClick={() => void handleOpenChange(false)}
              className="bg-[var(--dos-chart-success)] text-[color:var(--dos-background-deep)] hover:bg-[var(--dos-chart-success)]"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Done
            </Button>
          ) : result?.patch ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => void rejectPatch()}
                disabled={rejecting || applying}
                className="border-[color:var(--dos-border-soft)] bg-transparent text-slate-300 hover:bg-[var(--dos-surface-muted)]"
              >
                {rejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Reject
              </Button>
              <Button
                type="button"
                onClick={() => void acceptPatch()}
                disabled={applying || generating}
                className="bg-[var(--dos-chart-success)] text-[color:var(--dos-background-deep)] hover:bg-[var(--dos-chart-success)]"
              >
                {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Accept patch
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={() => void submitPrompt()}
              disabled={generating || contextLoadState !== 'ready' || !prompt.trim()}
              className="bg-[var(--dos-accent-primary)] text-[color:var(--dos-background-deep)] hover:bg-[var(--dos-accent-primary-hover)]"
            >
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {proposalLifecycle === 'regeneration_required' ? 'Generate replacement' : 'Generate preview'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
