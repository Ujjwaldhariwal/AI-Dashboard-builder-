'use client'

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, ExternalLink, Eye, FileStack, LayoutDashboard, Loader2, Plus, Rocket, Send, ShieldCheck, SquareStack, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GuidedPublishReadinessPanel } from '@/components/platform/guided-publish-readiness-panel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import {
  demoCharts,
  demoColumns,
  demoDashboard,
  demoDashboardHealthAudit,
  demoDataset,
  demoModel,
  demoPage,
  demoProjects,
  demoSlots,
  demoVersion,
  DEMO_DASHBOARD_ID,
  DEMO_DATA_SOURCE_ID,
  DEMO_PROJECT_ID,
  DEMO_TENANT_ID,
  DEMO_VERSION_ID,
} from '@/lib/dashboardos/demo-data'
import { isDashboardOsDemoMode } from '@/lib/dashboardos/demo-mode'
import {
  approveGuidedSemanticDraft,
  buildGuidedPublishReadiness,
  buildGuidedReviewState,
  type GuidedPublishReadinessResult,
  type GuidedReviewState,
} from '@/lib/dashboardos/guided-review'
import type { GuidedPublishPreflightMetadata } from '@/lib/dashboardos/guided-publish-readiness-server'
import type { DashboardChartConfig } from '@/types/dashboard-chart'
import type { DashboardChartSlot, DashboardHealthAudit, DashboardPage, DashboardVersion, PublishedDashboard } from '@/types/dashboard-publishing'
import type { SemanticDataset } from '@/types/semantic-dataset'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
  tenantSlug?: string | null
}

interface VersionHistory {
  versions: DashboardVersion[]
  pages: DashboardPage[]
  slots: DashboardChartSlot[]
}

interface GuidedProfileApiRecord {
  id: string
  state: GuidedReviewState
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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function statusClassName(status: string) {
  if (status === 'published') return 'border-[color:var(--dos-success)] bg-[var(--dos-success-soft)] text-[var(--dos-success-text)]'
  if (status === 'archived' || status === 'retired') return 'border-[color:var(--dos-danger)] bg-[var(--dos-danger-soft)] text-[var(--dos-danger-text)]'
  return 'border-[color:var(--dos-info)] bg-[var(--dos-info-soft)] text-[var(--dos-info-text)]'
}

function chartSize(chart: DashboardChartConfig) {
  if (chart.presentation.size === 'full' || chart.layout.gridSpan >= 4) return { width: 12, height: 5 }
  if (chart.presentation.size === 'wide' || chart.layout.gridSpan >= 3) return { width: 8, height: 4 }
  if (chart.presentation.size === 'compact') return { width: 4, height: 3 }
  return { width: 6, height: 4 }
}

function buildDemoGuidedProfile(): GuidedProfileApiRecord {
  const approved = approveGuidedSemanticDraft(
    buildGuidedReviewState(demoColumns, {
      dataSourceId: DEMO_DATA_SOURCE_ID,
      schemaHash: 'demo-electricity-schema',
      generatedAt: '2026-07-13T00:00:00.000Z',
    }),
    null,
    '2026-07-13T00:05:00.000Z',
    {
      modelId: demoModel.id,
      modelName: demoModel.name,
      modelVersion: demoModel.version,
      materializedAt: '2026-07-13T00:05:00.000Z',
      fieldCount: demoColumns.length,
      metricCount: 3,
      relationshipCount: 0,
    },
  )
  return { id: 'demo-guided-profile', state: approved }
}

export function PublishedDashboardsAdminPanel() {
  const builderScope = useScopedBuilderStore(state => state.scope)
  const setBuilderScope = useScopedBuilderStore(state => state.setScope)
  const setBuilderDashboardId = useScopedBuilderStore(state => state.setDashboardId)
  const setBuilderPublishedVersionId = useScopedBuilderStore(state => state.setPublishedVersionId)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [dashboards, setDashboards] = useState<PublishedDashboard[]>([])
  const [charts, setCharts] = useState<DashboardChartConfig[]>([])
  const [guidedProfile, setGuidedProfile] = useState<GuidedProfileApiRecord | null>(null)
  const [models, setModels] = useState<Array<{ id: string; status?: string | null; version?: number | null }>>([])
  const [datasets, setDatasets] = useState<SemanticDataset[]>([])
  const [history, setHistory] = useState<VersionHistory>({ versions: [], pages: [], slots: [] })
  const [projectId, setProjectId] = useState('')
  const [dashboardId, setDashboardId] = useState('')
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([])
  const [dashboardName, setDashboardName] = useState('')
  const [dashboardDescription, setDashboardDescription] = useState('')
  const [versionTitle, setVersionTitle] = useState('')
  const [versionNotes, setVersionNotes] = useState('')
  const [savingDashboard, setSavingDashboard] = useState(false)
  const [savingVersion, setSavingVersion] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [serverPreflight, setServerPreflight] = useState<{ readiness: GuidedPublishReadinessResult; metadata: GuidedPublishPreflightMetadata } | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [healthAudit, setHealthAudit] = useState<DashboardHealthAudit | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const demoMode = isDashboardOsDemoMode()

  const selectedProject = projects.find(project => project.id === projectId)
  const selectedDashboard = dashboards.find(dashboard => dashboard.id === dashboardId)
  const clientDashboardUrl = selectedProject?.tenantSlug
    ? `/client/${encodeURIComponent(selectedProject.tenantSlug)}`
    : demoMode
      ? '/client/northstar-retail'
      : null
  const publishableCharts = useMemo(() => charts.filter(chart => (
    chart.status === 'published' && ['valid', 'warning'].includes(chart.validationState)
  )), [charts])
  const selectedCharts = useMemo(() => {
    const selected = new Set(selectedChartIds)
    return publishableCharts.filter(chart => selected.has(chart.id))
  }, [publishableCharts, selectedChartIds])
  const buildReadinessForVersion = useCallback((versionId?: string | null): GuidedPublishReadinessResult => buildGuidedPublishReadiness({
    profileState: guidedProfile?.state ?? null,
    models,
    activeSemanticModelId: guidedProfile?.state.semanticAsset?.modelId ?? null,
    datasets,
    charts,
    dashboards,
    versions: history.versions,
    pages: history.pages,
    slots: history.slots,
    selectedDashboardId: dashboardId || selectedDashboard?.id || null,
    selectedVersionId: versionId ?? selectedDashboard?.currentVersionId ?? history.versions[0]?.id ?? null,
    clientUrl: clientDashboardUrl,
  }), [charts, clientDashboardUrl, dashboardId, dashboards, datasets, guidedProfile?.state, history.pages, history.slots, history.versions, models, selectedDashboard?.currentVersionId, selectedDashboard?.id])
  const localPublishReadiness = useMemo(() => buildReadinessForVersion(selectedDashboard?.currentVersionId ?? history.versions[0]?.id ?? null), [buildReadinessForVersion, history.versions, selectedDashboard?.currentVersionId])
  const publishReadiness = serverPreflight?.readiness ?? localPublishReadiness
  const pagesByVersion = useMemo(() => {
    const map = new Map<string, DashboardPage[]>()
    for (const page of history.pages) map.set(page.versionId, [...(map.get(page.versionId) ?? []), page])
    return map
  }, [history.pages])
  const slotsByVersion = useMemo(() => {
    const map = new Map<string, DashboardChartSlot[]>()
    for (const slot of history.slots) map.set(slot.versionId, [...(map.get(slot.versionId) ?? []), slot])
    return map
  }, [history.slots])

  const fetchProjects = useCallback(async () => {
    if (demoMode) {
      setProjects(demoProjects)
      setProjectId(DEMO_PROJECT_ID)
      if (!builderScope || builderScope.tenantId !== DEMO_TENANT_ID || builderScope.projectId !== DEMO_PROJECT_ID) {
        setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'dashboard')
      }
      return
    }
    const response = await fetch('/api/admin/projects', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload))
    const nextProjects = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
    setProjects(nextProjects)
    setServerPreflight(null)
    setProjectId(current => {
      if (current) return current
      if (builderScope && nextProjects.some(project => project.id === builderScope.projectId)) return builderScope.projectId
      return ''
    })
  }, [builderScope, demoMode, setBuilderScope])

  const fetchProjectAssets = useCallback(async (nextProjectId: string) => {
    if (!nextProjectId) return
    if (demoMode) {
      setDashboards([demoDashboard])
      setCharts(demoCharts)
      setGuidedProfile(buildDemoGuidedProfile())
      setModels([demoModel])
      setDatasets([demoDataset])
      setDashboardId(DEMO_DASHBOARD_ID)
      setSelectedChartIds(demoCharts.map(chart => chart.id))
      return
    }
    const [dashboardsResponse, chartsResponse, profileResponse, modelsResponse, datasetsResponse] = await Promise.all([
      fetch(`/api/admin/published-dashboards?projectId=${nextProjectId}`, { cache: 'no-store' }),
      fetch(`/api/admin/dashboard-charts?projectId=${nextProjectId}`, { cache: 'no-store' }),
      fetch(`/api/admin/guided-review/profile?projectId=${nextProjectId}`, { cache: 'no-store' }),
      fetch(`/api/admin/semantic-models?projectId=${nextProjectId}`, { cache: 'no-store' }),
      fetch(`/api/admin/datasets?projectId=${nextProjectId}`, { cache: 'no-store' }),
    ])
    const dashboardsPayload = await dashboardsResponse.json().catch(() => null)
    const chartsPayload = await chartsResponse.json().catch(() => null)
    const profilePayload = await profileResponse.json().catch(() => null)
    const modelsPayload = await modelsResponse.json().catch(() => null)
    const datasetsPayload = await datasetsResponse.json().catch(() => null)
    if (!dashboardsResponse.ok) throw new Error(errorToText(dashboardsPayload))
    if (!chartsResponse.ok) throw new Error(errorToText(chartsPayload))
    if (!profileResponse.ok) throw new Error(errorToText(profilePayload))
    if (!modelsResponse.ok) throw new Error(errorToText(modelsPayload))
    if (!datasetsResponse.ok) throw new Error(errorToText(datasetsPayload))
    const nextDashboards = Array.isArray(dashboardsPayload?.dashboards) ? dashboardsPayload.dashboards as PublishedDashboard[] : []
    const nextCharts = Array.isArray(chartsPayload?.charts) ? chartsPayload.charts as DashboardChartConfig[] : []
    setDashboards(nextDashboards)
    setCharts(nextCharts)
    setGuidedProfile(profilePayload?.profile as GuidedProfileApiRecord | null)
    setModels(Array.isArray(modelsPayload?.models) ? modelsPayload.models as Array<{ id: string; status?: string | null; version?: number | null }> : [])
    setDatasets(Array.isArray(datasetsPayload?.datasets) ? datasetsPayload.datasets as SemanticDataset[] : [])
    setDashboardId(current => nextDashboards.some(dashboard => dashboard.id === current) ? current : nextDashboards[0]?.id ?? '')
    setSelectedChartIds(current => current.filter(chartId => nextCharts.some(chart => chart.id === chartId)))
    setServerPreflight(null)
  }, [demoMode])

  const fetchVersionHistory = useCallback(async (nextDashboardId: string) => {
    if (!nextDashboardId) {
      setHistory({ versions: [], pages: [], slots: [] })
      return
    }
    if (demoMode) {
      setHistory({ versions: [demoVersion], pages: [demoPage], slots: demoSlots })
      return
    }
    const response = await fetch(`/api/admin/published-dashboards/${nextDashboardId}/versions`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload))
    setHistory({
      versions: Array.isArray(payload?.versions) ? payload.versions as DashboardVersion[] : [],
      pages: Array.isArray(payload?.pages) ? payload.pages as DashboardPage[] : [],
      slots: Array.isArray(payload?.slots) ? payload.slots as DashboardChartSlot[] : [],
    })
  }, [demoMode])

  useEffect(() => {
    void fetchProjects().catch(error => toast.error(errorToText(error))).finally(() => setLoading(false))
  }, [fetchProjects])

  useEffect(() => {
    if (!projectId) return
    void fetchProjectAssets(projectId).catch(error => toast.error(errorToText(error)))
  }, [fetchProjectAssets, projectId])

  useEffect(() => {
    if (!dashboardId) {
      setHistory({ versions: [], pages: [], slots: [] })
      return
    }
    void fetchVersionHistory(dashboardId).catch(error => toast.error(errorToText(error)))
  }, [dashboardId, fetchVersionHistory])

  async function createDashboard() {
    if (!selectedProject) return
    setSavingDashboard(true)
    try {
      if (demoMode) {
        setDashboards([demoDashboard])
        setDashboardId(DEMO_DASHBOARD_ID)
        setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'dashboard')
        setBuilderDashboardId(DEMO_DASHBOARD_ID)
        toast.success('Demo dashboard shell ready')
        return
      }
      const response = await fetch('/api/admin/published-dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          name: dashboardName.trim(),
          slug: slugify(dashboardName),
          description: dashboardDescription.trim(),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      toast.success('Dashboard shell created')
      setDashboardName('')
      setDashboardDescription('')
      await fetchProjectAssets(selectedProject.id)
      if (payload?.dashboard?.id) {
        const nextDashboardId = String(payload.dashboard.id)
        setDashboardId(nextDashboardId)
        setBuilderScope({ tenantId: selectedProject.tenantId, projectId: selectedProject.id }, 'dashboard')
        setBuilderDashboardId(nextDashboardId)
      }
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setSavingDashboard(false)
    }
  }

  async function createVersion() {
    if (!selectedDashboard || selectedCharts.length === 0) return
    setSavingVersion(true)
    try {
      if (demoMode) {
        setHistory({ versions: [demoVersion], pages: [demoPage], slots: demoSlots })
        setBuilderPublishedVersionId(DEMO_VERSION_ID)
        toast.success('Demo draft version created')
        return
      }
      const response = await fetch(`/api/admin/published-dashboards/${selectedDashboard.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: versionTitle.trim() || `${selectedDashboard.name} release`,
          notes: versionNotes.trim() || publishReadiness.summary,
          layout: {
            mode: 'responsive-grid',
            guidedReadiness: {
              status: publishReadiness.status,
              publishEligible: publishReadiness.publishEligible,
              evaluatedAt: publishReadiness.evaluatedAt,
              blockers: publishReadiness.blockers.map(check => check.message),
              warnings: publishReadiness.warnings.map(check => check.message),
            },
          },
          pages: [{
            title: 'Overview',
            slug: 'overview',
            sortOrder: 0,
            layout: { columns: 12 },
            slots: selectedCharts.map((chart, index) => {
              const size = chartSize(chart)
              return {
                chartConfigId: chart.id,
                title: chart.name,
                slotKey: slugify(chart.name) || `slot-${index + 1}`,
                rowIndex: Math.floor(index / 2),
                columnIndex: index % 2 === 0 ? 0 : 6,
                width: size.width,
                height: size.height,
                settings: {},
              }
            }),
          }],
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      toast.success('Draft version created')
      setVersionTitle('')
      setVersionNotes('')
      setSelectedChartIds([])
      await fetchVersionHistory(selectedDashboard.id)
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setSavingVersion(false)
    }
  }

  async function publishVersion(versionId: string) {
    if (!selectedDashboard) return
    const versionReadiness = buildReadinessForVersion(versionId)
    if (!versionReadiness.publishEligible) {
      toast.error(versionReadiness.summary)
      return
    }
    setPublishingId(versionId)
    try {
      if (demoMode) {
        setDashboards([{ ...demoDashboard, currentVersionId: versionId, publishedAt: new Date().toISOString() }])
        setBuilderPublishedVersionId(versionId)
        toast.success('Demo dashboard version published')
        return
      }
      const response = await fetch(`/api/admin/published-dashboards/${selectedDashboard.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          notes: `Published from admin publishing panel. ${versionReadiness.summary}`,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      toast.success('Immutable dashboard release published')
      setBuilderPublishedVersionId(versionId)
      await Promise.all([
        fetchProjectAssets(projectId),
        fetchVersionHistory(selectedDashboard.id),
      ])
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setPublishingId(null)
    }
  }

  async function runReadinessPreflight() {
    if (!projectId) return
    setPreflightLoading(true)
    try {
      if (demoMode) {
        setServerPreflight({
          readiness: localPublishReadiness,
          metadata: {
            strategy: 'recomputed',
            projectId: DEMO_PROJECT_ID,
            tenantId: DEMO_TENANT_ID,
            tenantSlug: 'northstar-retail',
            selectedDashboardId: DEMO_DASHBOARD_ID,
            selectedVersionId: DEMO_VERSION_ID,
            semanticModelId: demoModel.id,
            semanticDraftVersion: 1,
            datasetCount: 1,
            chartCount: demoCharts.length,
            dashboardCount: 1,
            versionCount: 1,
            pageCount: 1,
            slotCount: demoSlots.length,
          },
        })
        toast.success('Prepared readiness snapshot loaded')
        return
      }

      const params = new URLSearchParams({ projectId })
      if (selectedDashboard?.id) params.set('dashboardId', selectedDashboard.id)
      const candidateVersionId = selectedDashboard?.currentVersionId ?? history.versions[0]?.id
      if (candidateVersionId) params.set('versionId', candidateVersionId)
      const response = await fetch(`/api/admin/guided-review/publish-readiness?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setServerPreflight({
        readiness: payload.readiness as GuidedPublishReadinessResult,
        metadata: payload.metadata as GuidedPublishPreflightMetadata,
      })
      toast.success('Readiness preflight recomputed from server data')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setPreflightLoading(false)
    }
  }

  async function runDashboardHealthCheck() {
    if (!projectId) return
    setHealthLoading(true)
    try {
      if (demoMode) {
        setHealthAudit(demoDashboardHealthAudit)
        toast.success('Prepared health snapshot loaded')
        return
      }
      const response = await fetch(`/api/admin/published-dashboards/health?projectId=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setHealthAudit(payload?.audit as DashboardHealthAudit)
      toast.success('Dashboard health check recorded')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setHealthLoading(false)
    }
  }

  function toggleChart(chartId: string) {
    setSelectedChartIds(current => (
      current.includes(chartId)
        ? current.filter(id => id !== chartId)
        : [...current, chartId]
    ))
  }

  function openClientDashboard() {
    if (!clientDashboardUrl) {
      toast.info('Select a project with a tenant slug before opening the client runtime.')
      return
    }
    window.open(clientDashboardUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center text-sm text-[var(--dos-text-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading publishing workspace
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-5 border-b border-[color:var(--dos-border-soft)] pb-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-[var(--dos-accent-primary-soft)] text-[var(--dos-accent-primary)] hover:bg-[var(--dos-accent-primary-soft)]">Publishing</Badge>
            <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[var(--dos-text-secondary)]">Immutable releases</Badge>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-[var(--dos-text-primary)]">Release governance workbench</h2>
        </div>
        <div className="w-full max-w-xs">
          <Label className="text-xs text-[var(--dos-text-muted)]">Project</Label>
          <Select
            value={projectId}
            onValueChange={(value) => {
              const selected = projects.find(project => project.id === value)
              setProjectId(value)
              setDashboardId('')
              setSelectedChartIds([])
              if (selected) setBuilderScope({ tenantId: selected.tenantId, projectId: selected.id }, 'dashboard')
            }}
          >
            <SelectTrigger className="mt-2 border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[var(--dos-text-primary)]">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(project => (
                <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 xl:col-span-2">
          <Button variant="outline" onClick={openClientDashboard} disabled={!clientDashboardUrl}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View as client
          </Button>
          <Button variant="outline" onClick={runDashboardHealthCheck} disabled={!projectId || healthLoading}>
            {healthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
            {demoMode ? 'Load health snapshot' : 'Run health check'}
          </Button>
          <Button onClick={runReadinessPreflight} disabled={!projectId || preflightLoading} data-testid="run-readiness-preflight">
            {preflightLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            {demoMode ? 'Load readiness snapshot' : 'Run readiness check'}
          </Button>
        </div>
      </section>

      {demoMode ? (
        <section className="rounded-md border border-[color:var(--dos-info)] bg-[var(--dos-info-soft)] px-3 py-2 text-xs text-[var(--dos-info-text)]" data-testid="prepared-release-notice">
          Reference mode · mutations disabled
        </section>
      ) : null}

      <section className="grid overflow-hidden rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] md:grid-cols-4 md:divide-x md:divide-[color:var(--dos-border-soft)]">
        {[
          ['Dashboards', dashboards.length],
          ['Versions', history.versions.length],
          ['Eligible charts', publishableCharts.length],
          ['Selected slots', selectedCharts.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="border-b border-[color:var(--dos-border-soft)] p-4 last:border-b-0 md:border-b-0">
            <p className="text-xs text-[var(--dos-text-muted)]">{label}</p>
            <p className="mt-2 font-mono text-xl font-semibold text-[var(--dos-text-primary)]">{value}</p>
          </div>
        ))}
      </section>

      <GuidedPublishReadinessPanel readiness={publishReadiness} source={demoMode ? 'prepared-reference' : serverPreflight ? 'server-preflight' : 'local'} />
      {serverPreflight ? (
        <p className="text-xs text-slate-500" data-testid="guided-preflight-metadata">
          {demoMode ? 'Prepared readiness covers' : 'Server preflight evaluated'} {serverPreflight.metadata.datasetCount} datasets, {serverPreflight.metadata.chartCount} charts, and {serverPreflight.metadata.slotCount} dashboard slots for this project.
        </p>
      ) : null}

      {healthAudit ? (
        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Dashboard health</h3>
              <p className="mt-1 text-xs text-slate-500">
                Checked {new Date(healthAudit.checkedAt).toLocaleString()} across {healthAudit.summary.total} published dashboards.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-[color:var(--dos-success)] bg-[var(--dos-success-soft)] text-[var(--dos-success-text)]">{healthAudit.summary.healthy} healthy</Badge>
              <Badge variant="outline" className="border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] text-[var(--dos-warning-text)]">{healthAudit.summary.stale} stale</Badge>
              <Badge variant="outline" className="border-[color:var(--dos-danger)] bg-[var(--dos-danger-soft)] text-[var(--dos-danger-text)]">{healthAudit.summary.blocked} blocked</Badge>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="space-y-5">
          <Card className="border-white/10 bg-white/[0.03] text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <LayoutDashboard className="h-4 w-4 text-[var(--dos-accent-primary)]" />
                New dashboard shell
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-slate-400">Name</Label>
                <Input value={dashboardName} onChange={event => setDashboardName(event.target.value)} disabled={demoMode} className="mt-2 border-white/10 bg-slate-950 text-slate-100" placeholder="Executive revenue" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Description</Label>
                <Textarea value={dashboardDescription} onChange={event => setDashboardDescription(event.target.value)} disabled={demoMode} className="mt-2 border-white/10 bg-slate-950 text-slate-100" placeholder="Read-only client dashboard purpose" />
              </div>
              <Button onClick={createDashboard} disabled={demoMode || !selectedProject || dashboardName.trim().length < 2 || savingDashboard} title={demoMode ? 'Draft creation is disabled in the prepared reference workspace' : undefined} className="w-full">
                {savingDashboard ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create dashboard
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03] text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <SquareStack className="h-4 w-4 text-[var(--dos-info-text)]" />
                Dashboard selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={dashboardId}
                onValueChange={(value) => {
                  setDashboardId(value)
                  setBuilderDashboardId(value || null)
                }}
              >
                <SelectTrigger className="border-white/10 bg-slate-950 text-slate-100">
                  <SelectValue placeholder="Select dashboard" />
                </SelectTrigger>
                <SelectContent>
                  {dashboards.map(dashboard => (
                    <SelectItem key={dashboard.id} value={dashboard.id}>{dashboard.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDashboard ? (
                <div className="rounded-md border border-white/10 bg-slate-950/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{selectedDashboard.name}</p>
                      <p className="mt-1 text-xs text-slate-500">/{selectedDashboard.slug}</p>
                    </div>
                    <Badge variant="outline" className={statusClassName(selectedDashboard.status)}>{selectedDashboard.status}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={openClientDashboard} disabled={!clientDashboardUrl} className="h-8 border-white/10 bg-transparent text-slate-300 hover:bg-white/10">
                      <Eye className="mr-2 h-3.5 w-3.5" />
                      Preview published dashboard
                    </Button>
                    {clientDashboardUrl ? (
                      <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 font-mono text-[11px] text-slate-500">
                        {clientDashboardUrl}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                  Create a dashboard shell to start versioning.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-white/10 bg-white/[0.03] text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileStack className="h-4 w-4 text-[var(--dos-warning-text)]" />
                Draft version composer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-slate-400">Version title</Label>
                  <Input value={versionTitle} onChange={event => setVersionTitle(event.target.value)} className="mt-2 border-white/10 bg-slate-950 text-slate-100" placeholder="Q2 executive release" />
                </div>
                <div>
                  <Label className="text-xs text-slate-400">Release notes</Label>
                  <Input value={versionNotes} onChange={event => setVersionNotes(event.target.value)} className="mt-2 border-white/10 bg-slate-950 text-slate-100" placeholder="Initial client release" />
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {publishableCharts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-slate-500 lg:col-span-2">
                    Publish and validate chart configs before composing a dashboard version.
                  </div>
                ) : publishableCharts.map(chart => {
                  const selected = selectedChartIds.includes(chart.id)
                  return (
                    <button
                      key={chart.id}
                      type="button"
                      onClick={() => toggleChart(chart.id)}
                      className={[
                        'min-h-24 rounded-md border p-3 text-left transition-colors',
                        selected
                          ? 'border-[color:var(--dos-success)] bg-[var(--dos-success-soft)]'
                          : 'border-white/10 bg-slate-950/50 hover:border-white/25',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{chart.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{chart.templateId}</p>
                        </div>
                        {selected ? <CheckCircle2 className="h-4 w-4 text-[var(--dos-success-text)]" /> : <Eye className="h-4 w-4 text-[var(--dos-text-muted)]" />}
                      </div>
                    </button>
                  )
                })}
              </div>

              <Button onClick={createVersion} disabled={demoMode || !selectedDashboard || selectedCharts.length === 0 || savingVersion} title={demoMode ? 'Draft creation is disabled in the prepared reference workspace' : undefined}>
                {savingVersion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Create draft version
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03] text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Rocket className="h-4 w-4 text-[var(--dos-danger-text)]" />
                Version history
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.versions.length === 0 ? (
                <div className="flex gap-2 rounded-md border border-dashed border-white/10 p-4 text-xs text-slate-500">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  No versions have been created for this dashboard.
                </div>
              ) : history.versions.map(version => {
                const pageCount = pagesByVersion.get(version.id)?.length ?? 0
                const slotCount = slotsByVersion.get(version.id)?.length ?? 0
                const versionReadiness = buildReadinessForVersion(version.id)
                const released = version.releaseSnapshotStatus !== 'pending'
                const releaseLabel = version.releaseSnapshotStatus === 'complete'
                  ? 'Immutable release'
                  : version.releaseSnapshotStatus === 'legacy_backfill'
                    ? 'Legacy baseline'
                    : 'Draft inputs'
                const publishDisabled = version.status !== 'draft'
                  || version.releaseSnapshotStatus !== 'pending'
                  || slotCount === 0
                  || pageCount === 0
                  || !versionReadiness.publishEligible
                return (
                  <div key={version.id} className="rounded-md border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{version.title}</p>
                          <Badge variant="outline" className={statusClassName(version.status)}>{version.status}</Badge>
                          <Badge variant="outline" className="border-white/15 text-slate-300">{releaseLabel}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Version {version.versionNumber} · {pageCount} pages · {slotCount} slots
                        </p>
                        {version.notes ? (
                          <p className="mt-2 max-w-2xl text-[11px] leading-4 text-slate-500" data-testid="guided-publish-lineage">
                            {version.notes}
                          </p>
                        ) : null}
                        {released ? (
                          <p className="mt-2 text-[11px] leading-4 text-slate-500">
                            {version.releaseSnapshotStatus === 'legacy_backfill'
                              ? 'Reconstructed from state available during migration; it is isolated now, but does not prove original historical content.'
                              : 'Chart, dataset configuration, and semantic inputs are frozen for this release. Source data remains live and schema-compatible.'}
                          </p>
                        ) : (
                          <p className="mt-2 text-[11px] leading-4 text-slate-500">
                            Draft readiness: {versionReadiness.summary}
                          </p>
                        )}
                      </div>
                      <Button size="sm" onClick={() => publishVersion(version.id)} disabled={publishDisabled || publishingId === version.id}>
                        {publishingId === version.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                        Publish
                      </Button>
                      {version.status === 'published' ? (
                        <Button size="sm" variant="outline" onClick={openClientDashboard} disabled={!clientDashboardUrl} className="border-white/10 bg-transparent text-slate-300 hover:bg-white/10">
                          <ExternalLink className="mr-2 h-3.5 w-3.5" />
                          Open dashboard
                        </Button>
                      ) : null}
                    </div>
                    {version.releaseSnapshotCreatedAt ? (
                      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        Release captured {new Date(version.releaseSnapshotCreatedAt).toLocaleString()}
                      </p>
                    ) : version.publishedAt ? (
                      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        Legacy publish recorded {new Date(version.publishedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
