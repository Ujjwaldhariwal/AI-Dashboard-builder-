'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Archive, CheckCircle2, Loader2, Palette, Plus, RefreshCw, Send, ShieldCheck, SlidersHorizontal, Sparkles, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { AiChartRefinementDialog } from '@/components/platform/ai-chart-refinement-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import { demoChart, demoChartAudit, demoCharts, demoDataset, demoDatasetPlan, demoProjects, DEMO_TENANT_ID, DEMO_PROJECT_ID } from '@/lib/dashboardos/demo-data'
import { isDashboardOsDemoMode } from '@/lib/dashboardos/demo-mode'
import { buildGuidedChartRecommendations } from '@/lib/dashboardos/guided-review'
import type { DashboardChartAudit, DashboardChartAuditItem } from '@/lib/semantic/chart-health-auditor'
import type { ChartCompatibilityResult, ChartTemplateId, DatasetShape } from '@/types/chart-template'
import type { DashboardChartConfig, DashboardChartEncoding } from '@/types/dashboard-chart'
import type { SemanticDataset } from '@/types/semantic-dataset'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
}
interface DatasetPlan {
  dataset: {
    id: string
    name: string
    status: string
  }
  fields: Array<{ id: string; name: string; role: string }>
  metrics: Array<{ id: string; name: string; aggregation: string }>
  chartOptions?: {
    shape: DatasetShape
    compatibility: ChartCompatibilityResult[]
  }
}

interface AiRefinementGateState {
  enabled: boolean
  source: string
  reason: string
  reasonCode?: string
  policy?: string
}

interface AiRefinementSummaryState {
  counts: {
    promptsSubmitted: number
    proposalsSucceeded: number
    blockedSensitiveRequests: number
    validationFailures: number
    applySuccesses: number
    previewUnavailableCases: number
    unsupportedSchemaVersions: number
    modelParseFailures: number
    gatedOffAccess: number
    lastEventAt: string | null
    outcomeCategories?: {
      restrictedFieldRequests: number
      unsupportedSchemaVersions: number
      modelParseFailures: number
      validationFailures: number
      gatedOffAccess: number
      previewUnavailableCases: number
    }
    buckets?: Array<{
      bucketStart: string
      totalEvents: number
      promptsSubmitted: number
      proposalsSucceeded: number
      applySuccesses: number
      validationFailures: number
      gatedOffAccess: number
      previewUnavailableCases: number
    }>
  }
  windowDays: number
  generatedAt: string
}

type AiRolloutScopeType = 'global' | 'tenant' | 'project' | 'user'

interface AiRolloutPolicyState {
  id?: string
  scopeType: AiRolloutScopeType
  scopeId: string | null
  tenantId: string | null
  projectId: string | null
  userId: string | null
  enabled: boolean
  reason: string | null
  updatedAt: string | null
  updatedBy: string | null
}

interface AiRefinementRolloutState {
  gate: AiRefinementGateState
  policies: AiRolloutPolicyState[]
  storage: {
    available: boolean
    errorCode: string | null
  }
  env: {
    policy: 'env'
    globalEnabled: boolean
    allowlistCounts: {
      tenantIds: number
      projectIds: number
      userIds: number
    }
  }
}

export function aiRolloutPolicyStateLabel(policy: Pick<AiRolloutPolicyState, 'enabled'> | null | undefined) {
  if (!policy) return 'Env fallback'
  return policy.enabled ? 'Enabled override' : 'Disabled override'
}

function aiRolloutPolicyBadgeClass(policy: Pick<AiRolloutPolicyState, 'enabled'> | null | undefined) {
  if (!policy) return 'border-[color:var(--dos-border-soft)] text-[color:var(--dos-text-muted)]'
  return policy.enabled
    ? 'border-[color:var(--dos-chart-success)] text-[color:var(--dos-chart-success)]'
    : 'border-[color:var(--dos-chart-warning)] text-[color:var(--dos-chart-warning)]'
}

function aiGateDecisionCopy(gate: AiRefinementGateState | null) {
  if (gate?.reason) return gate.reason
  if (gate?.reasonCode) return `Reason code: ${gate.reasonCode}`
  return 'Rollout decision is unavailable. Existing server gates still apply.'
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

function healthClassName(state?: DashboardChartAuditItem['healthState']) {
  if (state === 'healthy') return 'border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] text-[color:var(--dos-chart-success)]'
  if (state === 'stale') return 'border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[color:var(--dos-chart-warning)]'
  if (state === 'blocked') return 'border-[color:var(--dos-chart-risk)] bg-[var(--dos-danger-soft)] text-[color:var(--dos-chart-risk)]'
  return 'border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[color:var(--dos-text-muted)]'
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

function defaultEncoding(plan: DatasetPlan | null): DashboardChartEncoding {
  return {
    xAxisFieldId: plan?.fields[0]?.id,
    yMetricIds: plan?.metrics[0]?.id ? [plan.metrics[0].id] : [],
    stackMetricIds: [],
    tooltipFieldIds: [...(plan?.fields.slice(0, 2).map(field => field.id) ?? []), ...(plan?.metrics.slice(0, 2).map(metric => metric.id) ?? [])],
    labelById: Object.fromEntries([
      ...(plan?.fields.map(field => [field.id, field.name]) ?? []),
      ...(plan?.metrics.map(metric => [metric.id, metric.name]) ?? []),
    ]),
    colorById: {},
    sort: null,
    limit: 25,
  }
}

export function DashboardChartsAdminPanel() {
  const builderScope = useScopedBuilderStore(state => state.scope)
  const setBuilderScope = useScopedBuilderStore(state => state.setScope)
  const addBuilderChartId = useScopedBuilderStore(state => state.addChartId)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [datasets, setDatasets] = useState<SemanticDataset[]>([])
  const [charts, setCharts] = useState<DashboardChartConfig[]>([])
  const [projectId, setProjectId] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [plan, setPlan] = useState<DatasetPlan | null>(null)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState<ChartTemplateId | ''>('')
  const [encoding, setEncoding] = useState<DashboardChartEncoding>(defaultEncoding(null))
  const [gridSpan, setGridSpan] = useState('2')
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [planLoading, setPlanLoading] = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)
  const [chartAudit, setChartAudit] = useState<DashboardChartAudit | null>(null)
  const [aiRefineChartId, setAiRefineChartId] = useState<string | null>(null)
  const [aiRefinementGate, setAiRefinementGate] = useState<AiRefinementGateState | null>(null)
  const [aiRefinementSummary, setAiRefinementSummary] = useState<AiRefinementSummaryState | null>(null)
  const [aiRefinementRollout, setAiRefinementRollout] = useState<AiRefinementRolloutState | null>(null)
  const [savingRolloutScope, setSavingRolloutScope] = useState<AiRolloutScopeType | null>(null)
  const [advancedComposerOpen, setAdvancedComposerOpen] = useState(false)
  const [draftingDashboard, setDraftingDashboard] = useState(false)
  const demoMode = isDashboardOsDemoMode()

  const selectedProject = projects.find(project => project.id === projectId)
  const selectedDataset = datasets.find(dataset => dataset.id === datasetId)
  const allowedOptions = useMemo(() => (
    plan?.chartOptions?.compatibility.filter(option => option.status !== 'blocked') ?? []
  ), [plan])
  const recommendedOption = allowedOptions.find(option => option.status === 'recommended') ?? allowedOptions[0]
  const guidedChartRecommendations = useMemo(() => buildGuidedChartRecommendations({
    shape: plan?.chartOptions?.shape,
    compatibility: plan?.chartOptions?.compatibility,
    fields: plan?.fields,
    metrics: plan?.metrics,
  }), [plan])
  const auditByChartId = useMemo(() => new Map(
    chartAudit?.items.map(item => [item.chart.id, item]) ?? [],
  ), [chartAudit])
  const rolloutPolicyByScope = useMemo(() => new Map(
    aiRefinementRollout?.policies.map(policy => [policy.scopeType, policy]) ?? [],
  ), [aiRefinementRollout])

  const fetchProjects = useCallback(async () => {
    if (demoMode) {
      setProjects(demoProjects)
      setProjectId(current => current || DEMO_PROJECT_ID)
      if (!builderScope || builderScope.tenantId !== DEMO_TENANT_ID || builderScope.projectId !== DEMO_PROJECT_ID) {
        setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'charts')
      }
      return
    }
    const response = await fetch('/api/admin/projects', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload))
    const nextProjects = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
    setProjects(nextProjects)
    setProjectId(current => {
      if (current) return current
      if (builderScope && nextProjects.some(project => project.id === builderScope.projectId)) return builderScope.projectId
      return ''
    })
  }, [builderScope, demoMode, setBuilderScope])

  const fetchChartAudit = useCallback(async (nextProjectId: string) => {
    if (!nextProjectId) {
      setChartAudit(null)
      return
    }
    if (demoMode) {
      setChartAudit(demoChartAudit)
      return
    }
    setAuditLoading(true)
    try {
      const response = await fetch(`/api/admin/dashboard-charts/audit?projectId=${nextProjectId}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setChartAudit(payload?.audit as DashboardChartAudit)
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setAuditLoading(false)
    }
  }, [demoMode])

  const fetchProjectAssets = useCallback(async (nextProjectId: string) => {
    if (!nextProjectId) return
    if (demoMode) {
      setDatasets([demoDataset])
      setCharts(demoCharts)
      setDatasetId(current => current || demoDataset.id)
      setChartAudit(demoChartAudit)
      setAiRefinementGate({ enabled: false, source: 'demo', reason: 'AI refinement uses real governed chart IDs outside browser-only demo mode.' })
      setAiRefinementSummary(null)
      setAiRefinementRollout(null)
      return
    }
    const nextProject = projects.find(project => project.id === nextProjectId)
    const [datasetsResponse, chartsResponse, gateResponse, summaryResponse, rolloutResponse] = await Promise.all([
      fetch(`/api/admin/datasets?projectId=${nextProjectId}`, { cache: 'no-store' }),
      fetch(`/api/admin/dashboard-charts?projectId=${nextProjectId}`, { cache: 'no-store' }),
      nextProject
        ? fetch('/api/ai/chart-refine/gate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: nextProject.tenantId, projectId: nextProject.id }),
        })
        : Promise.resolve(null),
      nextProject
        ? fetch(`/api/admin/dashboard-charts/ai-refinement-summary?tenantId=${encodeURIComponent(nextProject.tenantId)}&projectId=${encodeURIComponent(nextProject.id)}`, { cache: 'no-store' })
        : Promise.resolve(null),
      nextProject
        ? fetch(`/api/admin/dashboard-charts/ai-refinement-rollout?tenantId=${encodeURIComponent(nextProject.tenantId)}&projectId=${encodeURIComponent(nextProject.id)}`, { cache: 'no-store' })
        : Promise.resolve(null),
    ])
    const datasetsPayload = await datasetsResponse.json().catch(() => null)
    const chartsPayload = await chartsResponse.json().catch(() => null)
    const gatePayload = gateResponse ? await gateResponse.json().catch(() => null) : null
    const summaryPayload = summaryResponse ? await summaryResponse.json().catch(() => null) : null
    const rolloutPayload = rolloutResponse ? await rolloutResponse.json().catch(() => null) : null
    if (!datasetsResponse.ok) throw new Error(errorToText(datasetsPayload))
    if (!chartsResponse.ok) throw new Error(errorToText(chartsPayload))
    const nextDatasets = Array.isArray(datasetsPayload?.datasets) ? datasetsPayload.datasets as SemanticDataset[] : []
    setDatasets(nextDatasets)
    setCharts(Array.isArray(chartsPayload?.charts) ? chartsPayload.charts as DashboardChartConfig[] : [])
    setAiRefinementRollout(rolloutResponse?.ok && rolloutPayload?.rollout
      ? rolloutPayload.rollout as AiRefinementRolloutState
      : null)
    setAiRefinementGate(rolloutPayload?.rollout?.gate && typeof rolloutPayload.rollout.gate.enabled === 'boolean'
      ? rolloutPayload.rollout.gate as AiRefinementGateState
      : gatePayload && typeof gatePayload.enabled === 'boolean'
      ? gatePayload as AiRefinementGateState
      : { enabled: false, source: 'off', reason: 'AI refinement gate status is unavailable.' })
    setAiRefinementSummary(summaryResponse?.ok && summaryPayload?.summary
      ? summaryPayload.summary as AiRefinementSummaryState
      : null)
    setDatasetId(current => nextDatasets.some(dataset => dataset.id === current) ? current : nextDatasets[0]?.id ?? '')
    void fetchChartAudit(nextProjectId)
  }, [demoMode, fetchChartAudit, projects])

  const updateAiRolloutPolicy = useCallback(async (scopeType: AiRolloutScopeType, enabled: boolean | null) => {
    if (demoMode || !selectedProject) return
    setSavingRolloutScope(scopeType)
    try {
      const response = await fetch('/api/admin/dashboard-charts/ai-refinement-rollout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          scopeType,
          enabled,
          reason: enabled === null ? null : 'Updated from DashboardOS admin rollout controls',
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      if (payload?.rollout) {
        setAiRefinementRollout(payload.rollout as AiRefinementRolloutState)
        if (payload.rollout.gate && typeof payload.rollout.gate.enabled === 'boolean') {
          setAiRefinementGate(payload.rollout.gate as AiRefinementGateState)
        }
      }
      toast.success(enabled === null ? 'Rollout override cleared' : 'Rollout policy updated')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setSavingRolloutScope(null)
    }
  }, [demoMode, selectedProject])

  const fetchPlan = useCallback(async (nextDatasetId: string) => {
    if (!nextDatasetId) {
      setPlan(null)
      return
    }
    setPlanLoading(true)
    try {
      if (demoMode) {
        const nextPlan = demoDatasetPlan
        const nextRecommendedTemplateId = nextPlan.chartOptions?.compatibility
          .find((option: ChartCompatibilityResult) => option.status === 'recommended')
          ?.template.id ?? ''
        setPlan(nextPlan)
        setName(current => current || `${nextPlan.dataset.name} chart`)
        setTemplateId(current => current || nextRecommendedTemplateId)
        setEncoding(defaultEncoding(nextPlan))
        return
      }
      const response = await fetch(`/api/admin/datasets/${nextDatasetId}/plan`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      const nextPlan = payload?.plan as DatasetPlan
      const nextRecommendedTemplateId = nextPlan.chartOptions?.compatibility
        .find((option: ChartCompatibilityResult) => option.status === 'recommended')
        ?.template.id ?? ''
      setPlan(nextPlan)
      setName(current => current || `${nextPlan.dataset.name} chart`)
      setTemplateId(current => current || nextRecommendedTemplateId)
      setEncoding(defaultEncoding(nextPlan))
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setPlanLoading(false)
    }
  }, [demoMode])

  useEffect(() => {
    void fetchProjects().catch(error => toast.error(errorToText(error))).finally(() => setLoading(false))
  }, [fetchProjects])

  useEffect(() => {
    if (!projectId) return
    void fetchProjectAssets(projectId).catch(error => toast.error(errorToText(error)))
  }, [fetchProjectAssets, projectId])

  useEffect(() => {
    void fetchPlan(datasetId)
  }, [datasetId, fetchPlan])

  useEffect(() => {
    if (!templateId && recommendedOption?.template.id) setTemplateId(recommendedOption.template.id)
  }, [recommendedOption, templateId])

  async function handleSave() {
    if (!selectedProject || !selectedDataset || !templateId) {
      toast.error('Select a project, dataset, and chart template first')
      return
    }
    setSaving(true)
    try {
      if (demoMode) {
        const chart: DashboardChartConfig = {
          ...demoChart,
          id: `demo-chart-${Date.now()}`,
          name: name.trim() || demoChart.name,
          templateId,
          encoding,
          layout: { order: charts.length, gridSpan: Number(gridSpan) },
          status: 'draft',
          publishedAt: null,
          updatedAt: new Date().toISOString(),
        }
        setCharts(current => [chart, ...current])
        setBuilderScope({ tenantId: chart.tenantId, projectId: chart.projectId }, 'dashboard')
        addBuilderChartId(chart.id)
        setChartAudit(demoChartAudit)
        toast.success('Demo draft chart saved')
        return
      }
      const response = await fetch('/api/admin/dashboard-charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          datasetId: selectedDataset.id,
          name,
          templateId,
          encoding,
          presentation: {
            size: Number(gridSpan) >= 3 ? 'wide' : 'standard',
            showLegend: true,
            showLabels: false,
            valueFormat: null,
          },
          interactions: {},
          layout: {
            order: charts.length,
            gridSpan: Number(gridSpan),
          },
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      const chart = payload.chart as DashboardChartConfig
      setCharts(current => [chart, ...current])
      setBuilderScope({ tenantId: chart.tenantId, projectId: chart.projectId }, 'dashboard')
      addBuilderChartId(chart.id)
      void fetchChartAudit(selectedProject.id)
      toast.success('Draft chart saved')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateDashboardDraft() {
    if (!selectedProject || !selectedDataset) {
      toast.error('Select a project and dataset before generating a dashboard draft')
      return
    }
    setDraftingDashboard(true)
    try {
      if (demoMode) {
        const chart: DashboardChartConfig = {
          ...demoChart,
          id: `demo-guided-chart-${Date.now()}`,
          name: `${selectedDataset.name} guided overview`,
          status: 'draft',
          publishedAt: null,
          updatedAt: new Date().toISOString(),
        }
        setCharts(current => [chart, ...current])
        addBuilderChartId(chart.id)
        setBuilderScope({ tenantId: chart.tenantId, projectId: chart.projectId }, 'dashboard')
        toast.success('Demo guided dashboard draft created')
        return
      }
      const response = await fetch('/api/admin/guided-review/dashboard-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          datasetId: selectedDataset.id,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      const nextCharts = Array.isArray(payload?.charts) ? payload.charts as DashboardChartConfig[] : []
      if (nextCharts.length > 0) {
        setCharts(current => [...nextCharts, ...current])
        for (const chart of nextCharts) addBuilderChartId(chart.id)
      }
      setBuilderScope({ tenantId: selectedProject.tenantId, projectId: selectedProject.id }, 'dashboard')
      void fetchChartAudit(selectedProject.id)
      toast.success('Guided dashboard draft created')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setDraftingDashboard(false)
    }
  }

  async function handleStatus(chartId: string, status: 'draft' | 'published' | 'archived') {
    setUpdatingId(chartId)
    try {
      if (demoMode) {
        setCharts(current => current.map(chart => (
          chart.id === chartId
            ? { ...chart, status, publishedAt: status === 'published' ? new Date().toISOString() : chart.publishedAt }
            : chart
        )))
        setChartAudit(demoChartAudit)
        toast.success(status === 'published' ? 'Demo chart published' : 'Demo chart status updated')
        return
      }
      const response = await fetch(`/api/admin/dashboard-charts/${chartId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setCharts(current => current.map(chart => chart.id === chartId ? payload.chart as DashboardChartConfig : chart))
      void fetchChartAudit(projectId)
      toast.success(status === 'published' ? 'Chart published' : 'Chart status updated')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setUpdatingId(null)
    }
  }

  function handleAiApplied(chart: DashboardChartConfig) {
    setCharts(current => current.map(item => item.id === chart.id ? chart : item))
    void fetchChartAudit(chart.projectId)
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-[color:var(--dos-text-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading chart composer
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--dos-chart-success)]">Chart Composer</p>
          <h1 className="mt-1 text-2xl font-semibold text-[color:var(--dos-text-primary)]">Validated dashboard charts</h1>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--dos-text-muted)]">
            Review suggested dashboard blocks from governed datasets, then customize only when the default needs adjustment.
          </p>
        </div>
        <Badge className="bg-[var(--dos-info-soft)] text-[color:var(--dos-chart-info)] hover:bg-[var(--dos-info-soft)]">
          {charts.length} saved configs
        </Badge>
      </div>

      <section className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-5 text-[color:var(--dos-text-primary)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge className="bg-[var(--dos-success-soft)] text-[var(--dos-success-text)] hover:bg-[var(--dos-success-soft)]">Guided mode</Badge>
            <h2 className="mt-3 text-lg font-semibold">Review suggested dashboard</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--dos-text-muted)]">
              Recommendations come from the selected dataset shape and keep the approved semantic lineage visible through dashboard draft creation.
            </p>
            <div className="mt-3 rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] px-3 py-2 text-xs leading-5 text-[color:var(--dos-text-muted)]" data-testid="guided-chart-lineage">
              {selectedDataset
                ? `${selectedDataset.name}: ${selectedDataset.description ?? 'Dataset lineage will be attached to generated dashboard drafts.'}`
                : 'Select a governed dataset to preview dashboard recommendations.'}
            </div>
          </div>
          <Button variant="outline" className="border-[color:var(--dos-border-soft)] bg-transparent text-[color:var(--dos-text-secondary)] hover:bg-[var(--dos-surface-muted)]" onClick={() => setAdvancedComposerOpen(open => !open)}>
            {advancedComposerOpen ? 'Hide advanced composer' : 'Customize chart manually'}
          </Button>
          <Button onClick={() => void handleGenerateDashboardDraft()} disabled={draftingDashboard || !selectedDataset || guidedChartRecommendations.length === 0}>
            {draftingDashboard ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate draft dashboard
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {guidedChartRecommendations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-5 text-sm text-[color:var(--dos-text-muted)] md:col-span-2 xl:col-span-4">
              Select a published dataset to see chart recommendations.
            </div>
          ) : guidedChartRecommendations.map(recommendation => (
            <button
              key={recommendation.id}
              type="button"
              onClick={() => {
                if (allowedOptions.some(option => option.template.id === recommendation.chartType)) {
                  setTemplateId(recommendation.chartType as ChartTemplateId)
                }
                setName(current => current || recommendation.title)
              }}
              className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4 text-left transition-colors hover:border-[color:var(--dos-chart-success)] hover:bg-[var(--dos-success-soft)]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[color:var(--dos-text-primary)]">{recommendation.title}</p>
                <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[color:var(--dos-text-muted)]">{recommendation.confidence}%</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-[color:var(--dos-text-muted)]">{recommendation.reason}</p>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-[color:var(--dos-chart-info)]">{recommendation.chartType}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className={advancedComposerOpen ? 'border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)]' : 'border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] opacity-90'} data-testid="dashboard-chart-composer">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <SlidersHorizontal className="h-4 w-4 text-[color:var(--dos-chart-warning)]" />
              {advancedComposerOpen ? 'Advanced chart setup' : 'Review selected chart'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[color:var(--dos-text-secondary)]" style={{ color: 'var(--dos-text-secondary)' }}>Project</Label>
                <Select value={projectId} onValueChange={(value) => {
                  const selected = projects.find(project => project.id === value)
                  setProjectId(value)
                  setDatasetId('')
                  setPlan(null)
                  setTemplateId('')
                  if (selected) setBuilderScope({ tenantId: selected.tenantId, projectId: selected.id }, 'charts')
                }}>
                  <SelectTrigger className="border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[color:var(--dos-text-primary)]">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[color:var(--dos-text-secondary)]" style={{ color: 'var(--dos-text-secondary)' }}>Dataset</Label>
                <Select value={datasetId} onValueChange={(value) => {
                  setDatasetId(value)
                  setTemplateId('')
                }}>
                  <SelectTrigger className="border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[color:var(--dos-text-primary)]">
                    <SelectValue placeholder="Select dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map(dataset => (
                      <SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <Label className="text-[color:var(--dos-text-secondary)]" style={{ color: 'var(--dos-text-secondary)' }}>Chart name</Label>
                <Input value={name} onChange={event => setName(event.target.value)} className="border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[color:var(--dos-text-primary)]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[color:var(--dos-text-secondary)]" style={{ color: 'var(--dos-text-secondary)' }}>Grid span</Label>
                <Select value={gridSpan} onValueChange={setGridSpan}>
                  <SelectTrigger className="border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[color:var(--dos-text-primary)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Compact</SelectItem>
                    <SelectItem value="2">Standard</SelectItem>
                    <SelectItem value="3">Wide</SelectItem>
                    <SelectItem value="4">Full width</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-[color:var(--dos-chart-tooltip-border)] bg-[var(--dos-background-deep)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[color:var(--dos-text-primary)]" style={{ color: 'var(--dos-text-primary)' }}>
                    {planLoading ? 'Analyzing dataset...' : `Shape: ${plan?.chartOptions?.shape.kind ?? 'unknown'}`}
                  </p>
                  <p className="mt-1 text-[11px] text-[color:var(--dos-text-muted)]">Only compatible chart templates are selectable.</p>
                </div>
                {recommendedOption ? (
                  <Badge className="bg-[var(--dos-success-soft)] text-[color:var(--dos-chart-success)] hover:bg-[var(--dos-success-soft)]" style={{ color: 'var(--dos-chart-success)' }}>
                    Recommended: {recommendedOption.template.name}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {allowedOptions.map(option => (
                  <button
                    key={option.template.id}
                    type="button"
                    onClick={() => setTemplateId(option.template.id)}
                    className={[
                      'rounded-md border px-3 py-2 text-left text-xs transition-colors',
                      templateId === option.template.id
                        ? 'border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] text-[color:var(--dos-text-primary)]'
                        : 'border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[color:var(--dos-text-secondary)] hover:border-[color:var(--dos-border-mid)]',
                    ].join(' ')}
                  >
                    <span className="font-semibold">{option.template.name}</span>
                    <span className="mt-1 block text-[11px] text-[color:var(--dos-text-muted)]">{option.template.family} / score {option.score}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={advancedComposerOpen ? 'grid gap-4 md:grid-cols-2' : 'hidden'}>
              <div className="space-y-2">
                <Label className="text-[color:var(--dos-text-secondary)]" style={{ color: 'var(--dos-text-secondary)' }}>X axis</Label>
                <Select value={encoding.xAxisFieldId ?? ''} onValueChange={(value) => setEncoding(current => ({ ...current, xAxisFieldId: value }))}>
                  <SelectTrigger className="border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[color:var(--dos-text-primary)]">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {plan?.fields.map(field => (
                      <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[color:var(--dos-text-secondary)]" style={{ color: 'var(--dos-text-secondary)' }}>Row limit</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={encoding.limit ?? 25}
                  onChange={event => setEncoding(current => ({ ...current, limit: Number(event.target.value) || 25 }))}
                  className="border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[color:var(--dos-text-primary)]"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-3">
                <p className="text-xs font-semibold text-[color:var(--dos-text-primary)]" style={{ color: 'var(--dos-text-primary)' }}>Y metrics</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {plan?.metrics.map(metric => (
                    <button
                      key={metric.id}
                      type="button"
                      onClick={() => setEncoding(current => ({ ...current, yMetricIds: toggleValue(current.yMetricIds, metric.id) }))}
                      className={[
                        'rounded-md border px-2 py-1 text-xs',
                        encoding.yMetricIds.includes(metric.id)
                          ? 'border-[color:var(--dos-chart-info)] bg-[var(--dos-info-soft)] text-[color:var(--dos-chart-info)]'
                          : 'border-[color:var(--dos-border-soft)] text-[color:var(--dos-text-muted)]',
                      ].join(' ')}
                    >
                      {metric.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-3">
                <p className="text-xs font-semibold text-[color:var(--dos-text-primary)]" style={{ color: 'var(--dos-text-primary)' }}>Tooltip fields</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...(plan?.fields ?? []), ...(plan?.metrics ?? [])].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setEncoding(current => ({ ...current, tooltipFieldIds: toggleValue(current.tooltipFieldIds, item.id) }))}
                      className={[
                        'rounded-md border px-2 py-1 text-xs',
                        encoding.tooltipFieldIds.includes(item.id)
                          ? 'border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[color:var(--dos-chart-warning)]'
                          : 'border-[color:var(--dos-border-soft)] text-[color:var(--dos-text-muted)]',
                      ].join(' ')}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button onClick={() => void handleSave()} disabled={saving || !templateId || !datasetId} className="bg-[var(--dos-chart-success)] text-[color:var(--dos-background-deep)] hover:bg-[var(--dos-chart-success)]">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Save reviewed draft
            </Button>
            {!advancedComposerOpen ? (
              <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-3 text-xs leading-5 text-[color:var(--dos-text-muted)]">
                Current draft uses {templateId || 'no'} template, {encoding.yMetricIds.length} metrics, and {encoding.tooltipFieldIds.length} tooltip fields. Open advanced composer to change bindings.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] text-[color:var(--dos-text-primary)]">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base text-[color:var(--dos-text-primary)]">
                  <ShieldCheck className="h-4 w-4 text-[color:var(--dos-chart-success)]" />
                  Guardrails
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-white/10 bg-transparent px-2 text-slate-300 hover:bg-white/10"
                  onClick={() => void fetchChartAudit(projectId)}
                  disabled={auditLoading || !projectId}
                >
                  {auditLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-400">
              <p>Dataset fields and metrics are validated before save.</p>
              <p>Incompatible chart templates are blocked by the server.</p>
              <p>Validation history is stored for publish checks.</p>
              <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--dos-text-muted)]">AI refinement</p>
                  <Badge variant="outline" className={aiRefinementGate?.enabled
                    ? 'border-[color:var(--dos-chart-success)] text-[color:var(--dos-chart-success)]'
                    : 'border-[color:var(--dos-chart-warning)] text-[color:var(--dos-chart-warning)]'}
                  >
                    {aiRefinementGate?.enabled ? aiRefinementGate.source : 'gated'}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-[color:var(--dos-text-muted)]">{aiRefinementGate?.reason ?? 'Checking controlled rollout gate.'}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="rounded-md border border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] p-2">
                  <p className="text-[10px] uppercase text-[color:var(--dos-chart-success)]">Healthy</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--dos-text-primary)]">{chartAudit?.summary.healthy ?? 0}</p>
                </div>
                <div className="rounded-md border border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] p-2">
                  <p className="text-[10px] uppercase text-[color:var(--dos-chart-warning)]">Stale</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--dos-text-primary)]">{chartAudit?.summary.stale ?? 0}</p>
                </div>
                <div className="rounded-md border border-[color:var(--dos-chart-risk)] bg-[var(--dos-danger-soft)] p-2">
                  <p className="text-[10px] uppercase text-[color:var(--dos-chart-risk)]">Blocked</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--dos-text-primary)]">{chartAudit?.summary.blocked ?? 0}</p>
                </div>
              </div>
              {chartAudit?.checkedAt ? (
                <div className="flex items-center gap-1 text-[11px] text-[color:var(--dos-text-muted)]">
                  <Activity className="h-3 w-3" />
                  Last audit {new Date(chartAudit.checkedAt).toLocaleTimeString()}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] text-[color:var(--dos-text-primary)]" data-testid="ai-rollout-control">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-[color:var(--dos-text-primary)]">
                <SlidersHorizontal className="h-4 w-4 text-[color:var(--dos-chart-info)]" />
                AI rollout control
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-[color:var(--dos-text-muted)]">
              <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide">Effective gate</span>
                  <Badge variant="outline" className={aiRefinementGate?.enabled
                    ? 'border-[color:var(--dos-chart-success)] text-[color:var(--dos-chart-success)]'
                    : 'border-[color:var(--dos-chart-warning)] text-[color:var(--dos-chart-warning)]'}
                  >
                    {aiRefinementGate?.enabled ? 'Enabled' : 'Gated'}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] leading-4">{aiGateDecisionCopy(aiRefinementGate)}</p>
                {aiRefinementGate?.reasonCode ? (
                  <p className="mt-1 font-mono text-[10px] text-[color:var(--dos-text-muted)]">{aiRefinementGate.reasonCode}</p>
                ) : null}
              </div>
              {aiRefinementRollout?.storage.available === false ? (
                <div className="rounded-md border border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] p-2 text-[11px] text-[color:var(--dos-chart-warning)]">
                  DB policy store unavailable; env allowlists are still the fallback.
                </div>
              ) : null}
              {demoMode ? (
                <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-2 text-[11px] leading-4">
                  Rollout changes are disabled in browser demo mode. Real project scopes use the admin-managed policy controls here.
                </div>
              ) : null}
              <div className="space-y-2">
                {([
                  ['global', 'Global'],
                  ['tenant', 'Tenant'],
                  ['project', 'Project'],
                  ['user', 'Current user'],
                ] as Array<[AiRolloutScopeType, string]>).map(([scopeType, label]) => {
                  const policy = rolloutPolicyByScope.get(scopeType)
                  const savingScope = savingRolloutScope === scopeType
                  return (
                    <div key={scopeType} className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-medium text-[color:var(--dos-text-primary)]">{label}</p>
                          <p className="mt-0.5 text-[10px] text-[color:var(--dos-text-muted)]">
                            {policy?.updatedAt ? `Updated ${new Date(policy.updatedAt).toLocaleDateString()}` : 'No DB override'}
                          </p>
                        </div>
                        <Badge variant="outline" className={aiRolloutPolicyBadgeClass(policy)}>
                          {aiRolloutPolicyStateLabel(policy)}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-[color:var(--dos-border-soft)] bg-transparent px-2 text-[10px]"
                          disabled={savingScope || demoMode}
                          onClick={() => void updateAiRolloutPolicy(scopeType, true)}
                        >
                          {savingScope ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enable'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-[color:var(--dos-border-soft)] bg-transparent px-2 text-[10px]"
                          disabled={savingScope || demoMode}
                          onClick={() => void updateAiRolloutPolicy(scopeType, false)}
                        >
                          Disable
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] text-[color:var(--dos-text-muted)]"
                          disabled={savingScope || demoMode || !policy}
                          onClick={() => void updateAiRolloutPolicy(scopeType, null)}
                        >
                          Fallback
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] leading-4">
                Env fallback: global {aiRefinementRollout?.env.globalEnabled ? 'on' : 'off'}, tenants {aiRefinementRollout?.env.allowlistCounts.tenantIds ?? 0}, projects {aiRefinementRollout?.env.allowlistCounts.projectIds ?? 0}, users {aiRefinementRollout?.env.allowlistCounts.userIds ?? 0}.
              </p>
            </CardContent>
          </Card>

          <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] text-[color:var(--dos-text-primary)]" data-testid="ai-refinement-ops">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-[color:var(--dos-text-primary)]">
                <Activity className="h-4 w-4 text-[color:var(--dos-chart-info)]" />
                AI refinement ops
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-[color:var(--dos-text-muted)]">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-2">
                  <p className="text-[10px] uppercase tracking-wide">Prompts</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--dos-text-primary)]">{aiRefinementSummary?.counts.promptsSubmitted ?? 0}</p>
                </div>
                <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-2">
                  <p className="text-[10px] uppercase tracking-wide">Proposals</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--dos-text-primary)]">{aiRefinementSummary?.counts.proposalsSucceeded ?? 0}</p>
                </div>
                <div className="rounded-md border border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] p-2">
                  <p className="text-[10px] uppercase tracking-wide text-[color:var(--dos-chart-success)]">Applied</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--dos-text-primary)]">{aiRefinementSummary?.counts.applySuccesses ?? 0}</p>
                </div>
                <div className="rounded-md border border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] p-2">
                  <p className="text-[10px] uppercase tracking-wide text-[color:var(--dos-chart-warning)]">Validation</p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--dos-text-primary)]">{aiRefinementSummary?.counts.validationFailures ?? 0}</p>
                </div>
              </div>
              <div className="grid gap-2 text-[11px]">
                <div className="flex items-center justify-between rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] px-2 py-1.5">
                  <span>Restricted requests</span>
                  <span className="font-semibold text-[color:var(--dos-chart-warning)]">{aiRefinementSummary?.counts.blockedSensitiveRequests ?? 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] px-2 py-1.5">
                  <span>Unsupported versions</span>
                  <span className="font-semibold text-[color:var(--dos-chart-warning)]">{aiRefinementSummary?.counts.unsupportedSchemaVersions ?? 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] px-2 py-1.5">
                  <span>Parse failures</span>
                  <span className="font-semibold text-[color:var(--dos-chart-warning)]">{aiRefinementSummary?.counts.modelParseFailures ?? 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] px-2 py-1.5">
                  <span>Preview unavailable</span>
                  <span className="font-semibold text-[color:var(--dos-chart-info)]">{aiRefinementSummary?.counts.previewUnavailableCases ?? 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] px-2 py-1.5">
                  <span>Gated off</span>
                  <span className="font-semibold text-[color:var(--dos-chart-warning)]">{aiRefinementSummary?.counts.gatedOffAccess ?? 0}</span>
                </div>
              </div>
              {aiRefinementSummary?.counts.buckets?.length ? (
                <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide">Recent buckets</p>
                  <div className="mt-2 space-y-1.5">
                    {aiRefinementSummary.counts.buckets.slice(0, 3).map(bucket => (
                      <div key={bucket.bucketStart} className="flex items-center justify-between gap-2 text-[11px]">
                        <span>{new Date(bucket.bucketStart).toLocaleDateString()}</span>
                        <span className="text-[color:var(--dos-text-primary)]">
                          {bucket.promptsSubmitted} prompts / {bucket.proposalsSucceeded} proposals / {bucket.validationFailures + bucket.gatedOffAccess + bucket.previewUnavailableCases} operator-visible issues
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="text-[11px] leading-4">
                Counts cover the last {aiRefinementSummary?.windowDays ?? 7} days and exclude raw prompt text, filter values, and sensitive field details.
              </p>
              {aiRefinementSummary?.counts.lastEventAt ? (
                <p className="text-[11px] text-[color:var(--dos-text-muted)]">
                  Last event {new Date(aiRefinementSummary.counts.lastEventAt).toLocaleString()}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <Palette className="h-4 w-4 text-[color:var(--dos-chart-risk)]" />
                Saved Drafts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {charts.length === 0 ? (
                <div className="rounded-md border border-dashed border-[color:var(--dos-border-soft)] p-4 text-xs text-[color:var(--dos-text-muted)]">
                  No chart configs saved for this project yet.
                </div>
              ) : charts.slice(0, 8).map(chart => {
                const auditItem = auditByChartId.get(chart.id)
                return (
                <div key={chart.id} className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{chart.name}</p>
                      <p className="mt-1 text-[11px] text-[color:var(--dos-text-muted)]">{chart.templateId} / {chart.status} / span {chart.layout.gridSpan}</p>
                      {chart.description ? (
                        <p className="mt-1 text-[11px] leading-4 text-[color:var(--dos-text-muted)]">{chart.description}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className={chart.validationState === 'valid' ? 'border-[color:var(--dos-chart-success)] text-[color:var(--dos-chart-success)]' : 'border-[color:var(--dos-chart-warning)] text-[color:var(--dos-chart-warning)]'}>
                        {chart.validationState}
                      </Badge>
                      <Badge variant="outline" className={healthClassName(auditItem?.healthState)}>
                        {auditItem?.healthState ?? 'not audited'}
                      </Badge>
                    </div>
                  </div>
                  {auditItem?.validation.issues.length ? (
                    <div className="mt-2 flex items-start gap-1 text-[11px] text-[#ffd866]">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{auditItem.validation.issues[0]?.message}</span>
                    </div>
                  ) : chart.validationState === 'valid' ? (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-[color:var(--dos-chart-success)]">
                      <CheckCircle2 className="h-3 w-3" />
                      Ready for publish validator
                    </div>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-[color:var(--dos-chart-success)] bg-transparent text-[color:var(--dos-chart-success)] hover:bg-[var(--dos-success-soft)]"
                      onClick={() => void handleStatus(chart.id, 'published')}
                      disabled={updatingId === chart.id || chart.status === 'published'}
                    >
                      {updatingId === chart.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                      Publish
                    </Button>
                    {aiRefinementGate?.enabled ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-[color:var(--dos-accent-primary)] bg-transparent text-[color:var(--dos-accent-primary)] hover:bg-[var(--dos-accent-primary-soft)]"
                        onClick={() => {
                          if (demoMode) {
                            toast.info('AI refinement uses real governed chart IDs. Open a real project chart to use it.')
                            return
                          }
                          setAiRefineChartId(chart.id)
                        }}
                        disabled={updatingId === chart.id}
                      >
                        <Sparkles className="mr-2 h-3.5 w-3.5" />
                        Refine with AI
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-white/10 bg-transparent text-slate-300 hover:bg-white/10"
                      onClick={() => void handleStatus(chart.id, 'archived')}
                      disabled={updatingId === chart.id || chart.status === 'archived'}
                    >
                      <Archive className="mr-2 h-3.5 w-3.5" />
                      Archive
                    </Button>
                  </div>
                  <AiChartRefinementDialog
                    chart={chart}
                    tenantId={chart.tenantId}
                    projectId={chart.projectId}
                    open={aiRefineChartId === chart.id}
                    onOpenChange={(open) => setAiRefineChartId(open ? chart.id : null)}
                    onApplied={handleAiApplied}
                  />
                </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
