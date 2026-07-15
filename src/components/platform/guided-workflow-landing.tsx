'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Clock3, Database, GitBranch, LayoutDashboard, Loader2, LockKeyhole, Rocket, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

import { GuidedProgressStepper } from '@/components/platform/guided-progress-stepper'
import { GuidedPublishReadinessPanel } from '@/components/platform/guided-publish-readiness-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  approveGuidedSemanticDraft,
  buildGuidedContinueState,
  buildGuidedPublishReadiness,
  buildGuidedProgress,
  buildGuidedReviewState,
  type GuidedContinueAction,
  type GuidedPublishReadinessResult,
  type GuidedProgressStepId,
  type GuidedReviewState,
} from '@/lib/dashboardos/guided-review'
import { demoCharts, demoDashboard, demoDataSource, demoDataset, demoModel, demoColumns, demoPage, demoSlots, demoVersion, DEMO_DATA_SOURCE_ID } from '@/lib/dashboardos/demo-data'
import { isDashboardOsDemoMode } from '@/lib/dashboardos/demo-mode'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import type { DashboardChartConfig } from '@/types/dashboard-chart'
import type { DashboardChartSlot, DashboardPage, DashboardVersion, PublishedDashboard } from '@/types/dashboard-publishing'
import type { SemanticDataset } from '@/types/semantic-dataset'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
  tenantSlug?: string | null
  activeBusinessModelId?: string | null
}

interface GuidedProfileApiRecord {
  id: string
  state: GuidedReviewState
}

interface GuidedLandingSnapshot {
  project: ProjectOption | null
  dataSources: Array<{
    id: string
    schemaLastStatus?: string | null
    schemaLastError?: string | null
    schemaHash?: string | null
    schemaColumnCount?: number | null
  }>
  profile: GuidedProfileApiRecord | null
  models: Array<{ id: string; status: string; version?: number | null }>
  datasets: SemanticDataset[]
  charts: DashboardChartConfig[]
  dashboards: PublishedDashboard[]
  versions: DashboardVersion[]
  pages: DashboardPage[]
  slots: DashboardChartSlot[]
  preflight: GuidedPublishReadinessResult | null
  localReadinessEvaluatedAt: string
  error: string | null
  loading: boolean
}

const INITIAL_LOCAL_READINESS_EVALUATED_AT = '2026-07-13T00:00:00.000Z'

function errorToText(value: unknown) {
  if (value instanceof Error) return value.message
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
  }
  return String(value)
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorToText(payload) || `Request failed (${response.status})`)
  return payload as Record<string, unknown>
}

function buildDemoProfile(): GuidedProfileApiRecord {
  const approved = approveGuidedSemanticDraft(
    buildGuidedReviewState(demoColumns, {
      dataSourceId: DEMO_DATA_SOURCE_ID,
      schemaHash: demoDataSource.schemaHash ?? 'demo-schema',
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
      relationshipCount: 1,
    },
  )

  return { id: 'demo-guided-profile', state: approved }
}

const baseActions: Record<GuidedProgressStepId, GuidedContinueAction> = {
  connect_db: {
    stepId: 'connect_db',
    label: 'Connect DB',
    href: '/admin/data-sources',
    detail: 'Save or scan a read-only database connection.',
  },
  review_findings: {
    stepId: 'review_findings',
    label: 'Review findings',
    href: '/admin/semantic-model',
    detail: 'Resolve review items and hidden-field decisions.',
  },
  approve_model: {
    stepId: 'approve_model',
    label: 'Approve model',
    href: '/admin/semantic-model',
    detail: 'Create the approved semantic model asset.',
  },
  generate_draft_dashboard: {
    stepId: 'generate_draft_dashboard',
    label: 'Review chart recommendations',
    href: '/admin/charts',
    detail: 'Automatic dashboard composition is paused until staged creation is transaction-safe.',
  },
  preview: {
    stepId: 'preview',
    label: 'Preview dashboard',
    href: '/admin/charts',
    detail: 'Review generated chart drafts and validation status.',
  },
  publish: {
    stepId: 'publish',
    label: 'Publish',
    href: '/admin/publishing',
    detail: 'Create a versioned release for the client runtime.',
  },
  view_client_dashboard: {
    stepId: 'view_client_dashboard',
    label: 'View client dashboard',
    href: '/admin/publishing',
    detail: 'Open the published client dashboard.',
  },
}

export function GuidedWorkflowLanding() {
  const builderScope = useScopedBuilderStore(state => state.scope)
  const demoMode = isDashboardOsDemoMode()
  const [snapshot, setSnapshot] = useState<GuidedLandingSnapshot>({
    project: null,
    dataSources: [],
    profile: null,
    models: [],
    datasets: [],
    charts: [],
    dashboards: [],
    versions: [],
    pages: [],
    slots: [],
    preflight: null,
    localReadinessEvaluatedAt: INITIAL_LOCAL_READINESS_EVALUATED_AT,
    error: null,
    loading: true,
  })

  const loadSnapshot = useCallback(async () => {
    setSnapshot(current => ({ ...current, loading: true, error: null }))
    try {
      if (demoMode) {
        setSnapshot({
          project: { id: demoDataset.projectId, tenantId: demoDataset.tenantId, name: 'Northstar Retail', tenantSlug: 'northstar-retail', activeBusinessModelId: demoModel.id },
          dataSources: [{ id: demoDataSource.id, schemaLastStatus: 'ok', schemaHash: demoDataSource.schemaHash, schemaColumnCount: demoColumns.length }],
          profile: buildDemoProfile(),
          models: [{ id: demoModel.id, status: demoModel.status }],
          datasets: [demoDataset],
          charts: demoCharts,
          dashboards: [demoDashboard],
          versions: [demoVersion],
          pages: [demoPage],
          slots: demoSlots,
          preflight: null,
          localReadinessEvaluatedAt: '2026-07-13T00:05:00.000Z',
          error: null,
          loading: false,
        })
        return
      }

      const projectsPayload = await fetchJson('/api/admin/projects')
      const projects = Array.isArray(projectsPayload.projects) ? projectsPayload.projects as ProjectOption[] : []
      const project = projects.find(item => item.id === builderScope?.projectId) ?? projects[0] ?? null
      if (!project) {
        setSnapshot(current => ({ ...current, project: null, loading: false }))
        return
      }

      const [sourcesPayload, profilePayload, modelsPayload, datasetsPayload, chartsPayload, dashboardsPayload, preflightPayload] = await Promise.all([
        fetchJson(`/api/admin/data-sources?projectId=${encodeURIComponent(project.id)}`),
        fetchJson(`/api/admin/guided-review/profile?projectId=${encodeURIComponent(project.id)}`),
        fetchJson(`/api/admin/semantic-models?projectId=${encodeURIComponent(project.id)}`),
        fetchJson(`/api/admin/datasets?projectId=${encodeURIComponent(project.id)}`),
        fetchJson(`/api/admin/dashboard-charts?projectId=${encodeURIComponent(project.id)}`),
        fetchJson(`/api/admin/published-dashboards?projectId=${encodeURIComponent(project.id)}`),
        fetchJson(`/api/admin/guided-review/publish-readiness?projectId=${encodeURIComponent(project.id)}`),
      ])

      setSnapshot({
        project,
        dataSources: Array.isArray(sourcesPayload.dataSources) ? sourcesPayload.dataSources as GuidedLandingSnapshot['dataSources'] : [],
        profile: profilePayload.profile as GuidedProfileApiRecord | null,
        models: Array.isArray(modelsPayload.models) ? modelsPayload.models as GuidedLandingSnapshot['models'] : [],
        datasets: Array.isArray(datasetsPayload.datasets) ? datasetsPayload.datasets as GuidedLandingSnapshot['datasets'] : [],
        charts: Array.isArray(chartsPayload.charts) ? chartsPayload.charts as GuidedLandingSnapshot['charts'] : [],
        dashboards: Array.isArray(dashboardsPayload.dashboards) ? dashboardsPayload.dashboards as GuidedLandingSnapshot['dashboards'] : [],
        versions: [],
        pages: [],
        slots: [],
        preflight: preflightPayload.readiness as GuidedPublishReadinessResult | null,
        localReadinessEvaluatedAt: new Date().toISOString(),
        error: null,
        loading: false,
      })
    } catch (error) {
      setSnapshot(current => ({ ...current, error: errorToText(error), loading: false }))
    }
  }, [builderScope?.projectId, demoMode])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  const clientHref = snapshot.project?.tenantSlug
    ? `/client/${encodeURIComponent(snapshot.project.tenantSlug)}`
    : '/admin/publishing'
  const actions = useMemo(() => ({
    ...baseActions,
    view_client_dashboard: {
      ...baseActions.view_client_dashboard,
      href: clientHref,
    },
  }), [clientHref])

  const profileState = snapshot.profile?.state
  const semanticAsset = profileState?.semanticAsset
  const profileDataSourceId = profileState?.lineage?.schemaProfile.dataSourceId ?? null
  const schemaSource = snapshot.dataSources.find(source => source.id === profileDataSourceId) ?? null
  const localReadiness = useMemo(() => buildGuidedPublishReadiness({
    profileState,
    schemaIntrospection: schemaSource ? {
      dataSourceId: schemaSource.id,
      status: schemaSource.schemaLastStatus ?? null,
      error: schemaSource.schemaLastError ?? null,
      schemaHash: schemaSource.schemaHash ?? null,
    } : null,
    models: snapshot.models,
    activeSemanticModelId: snapshot.project?.activeBusinessModelId ?? null,
    datasets: snapshot.datasets,
    charts: snapshot.charts,
    dashboards: snapshot.dashboards,
    versions: snapshot.versions,
    pages: snapshot.pages,
    slots: snapshot.slots,
    selectedDashboardId: snapshot.dashboards[0]?.id ?? null,
    clientUrl: clientHref,
    evaluatedAt: snapshot.localReadinessEvaluatedAt,
  }), [clientHref, profileState, schemaSource, snapshot.charts, snapshot.dashboards, snapshot.datasets, snapshot.localReadinessEvaluatedAt, snapshot.models, snapshot.pages, snapshot.project?.activeBusinessModelId, snapshot.slots, snapshot.versions])
  const readiness = snapshot.preflight ?? localReadiness
  const steps = useMemo(() => buildGuidedProgress({
    hasDataSource: snapshot.dataSources.some(source => source.schemaLastStatus === 'ok'),
    hasProfile: Boolean(snapshot.profile),
    openReviewCount: profileState?.semanticDraft.needsReview.length ?? 0,
    semanticDraftApproved: profileState?.semanticDraftStatus === 'approved' || snapshot.models.some(model => model.status === 'approved'),
    hasDatasetDraft: snapshot.datasets.length > 0,
    hasDashboardDraft: snapshot.charts.length > 0 || snapshot.dashboards.length > 0,
    hasPreview: snapshot.charts.some(chart => chart.validationState === 'valid' || chart.validationState === 'warning') || snapshot.dashboards.length > 0,
    hasPublishedDashboard: snapshot.dashboards.some(dashboard => dashboard.status === 'published' || Boolean(dashboard.currentVersionId) || Boolean(dashboard.publishedAt)),
    clientUrl: clientHref,
    publishReadiness: readiness,
  }), [clientHref, profileState?.semanticDraft.needsReview.length, profileState?.semanticDraftStatus, readiness, snapshot])
  const continueState = useMemo(() => buildGuidedContinueState(steps, actions), [actions, steps])
  const lineageItems = [
    {
      label: 'Schema profile',
      value: snapshot.profile ? (profileState?.lineage?.schemaProfile.schemaHash ? 'Profile saved' : 'Profile ready') : 'Waiting for scan',
      done: Boolean(snapshot.profile),
      icon: Database,
    },
    {
      label: 'Review decisions',
      value: profileState ? `${profileState.decisions.length} saved / ${profileState.semanticDraft.needsReview.length} open` : 'Not started',
      done: Boolean(profileState && profileState.semanticDraft.needsReview.length === 0),
      icon: CheckCircle2,
    },
    {
      label: 'Semantic asset',
      value: semanticAsset ? `${semanticAsset.modelName} v${semanticAsset.modelVersion}` : 'Approval creates model asset',
      done: Boolean(semanticAsset),
      icon: GitBranch,
    },
    {
      label: 'Dataset draft',
      value: snapshot.datasets[0]?.description?.includes('approved semantic draft') ? 'Lineage attached' : `${snapshot.datasets.length} draft/active`,
      done: snapshot.datasets.length > 0,
      icon: ShieldCheck,
    },
    {
      label: 'Dashboard draft',
      value: snapshot.dashboards.length > 0 ? `${snapshot.dashboards.length} dashboard shell` : `${snapshot.charts.length} chart drafts`,
      done: snapshot.charts.length > 0 || snapshot.dashboards.length > 0,
      icon: LayoutDashboard,
    },
  ]

  return (
    <section
      className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-5 text-[color:var(--dos-text-primary)]"
      data-testid="guided-workflow-landing"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-[var(--dos-success-soft)] text-[var(--dos-success-text)] hover:bg-[var(--dos-success-soft)]">Guided path</Badge>
            {snapshot.project ? (
              <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[color:var(--dos-text-muted)]">
                {snapshot.project.tenantName ?? 'Tenant'} / {snapshot.project.name}
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Continue DB to dashboard</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--dos-text-muted)]">
            Connect a read-only database, review findings, approve the semantic model, inspect governed chart
            recommendations, validate readiness, then publish an immutable client release.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="bg-[var(--dos-accent-primary)] text-white hover:bg-[var(--dos-accent-primary-hover)]" data-testid="guided-next-action">
            <Link href={continueState.nextAction.href}>
              {continueState.nextAction.label}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" className="border-[color:var(--dos-border-soft)] bg-transparent text-[color:var(--dos-text-secondary)] hover:bg-[var(--dos-surface)]" onClick={() => void loadSnapshot()}>
            {snapshot.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {snapshot.error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] p-3 text-sm text-[color:var(--dos-warning-text)]">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{snapshot.error}</span>
        </div>
      ) : null}

      {demoMode ? (
        <div className="mt-4 rounded-lg border border-[color:var(--dos-info)] bg-[var(--dos-info-soft)] px-4 py-3 text-xs leading-5 text-[var(--dos-info-text)]" data-testid="prepared-workspace-notice">
          <span className="font-semibold">Prepared reference workspace.</span>{' '}
          The approved assets and published release below are a stable walkthrough snapshot. No customer source,
          semantic model, or release is changed; automatic dashboard assembly remains paused.
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--dos-text-muted)]">Current step</p>
          <h3 className="mt-2 text-lg font-semibold" data-testid="guided-current-step">{continueState.currentStep.label}</h3>
          <p className="mt-2 text-sm leading-6 text-[color:var(--dos-text-muted)]">{continueState.currentStep.detail}</p>
          <div className="mt-4 rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-3 text-xs leading-5 text-[color:var(--dos-text-muted)]">
            <p className="font-semibold text-[color:var(--dos-text-secondary)]">Next recommended action</p>
            <p className="mt-1">{continueState.nextAction.detail}</p>
          </div>
          {continueState.blockerSteps.length > 0 ? (
            <div className="mt-3 space-y-2" data-testid="guided-blockers">
              {continueState.blockerSteps.slice(0, 3).map(step => (
                <div key={step.id} className="flex items-start gap-2 rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] px-3 py-2 text-xs text-[color:var(--dos-text-muted)]">
                  <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{step.label}: {step.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-[color:var(--dos-success)] bg-[var(--dos-success-soft)] px-3 py-2 text-xs text-[var(--dos-success-text)]">
              <Rocket className="h-3.5 w-3.5" />
              Guided path is ready for the client dashboard handoff.
            </div>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5" data-testid="guided-lineage-strip">
          {lineageItems.map(item => {
            const Icon = item.icon
            return (
              <div key={item.label} className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <Icon className={item.done ? 'h-4 w-4 text-[color:var(--dos-chart-success)]' : 'h-4 w-4 text-[color:var(--dos-text-muted)]'} />
                  <Badge variant="outline" className={item.done ? 'border-[color:var(--dos-chart-success)] text-[color:var(--dos-chart-success)]' : 'border-[color:var(--dos-border-soft)] text-[color:var(--dos-text-muted)]'}>
                    {item.done ? 'done' : 'pending'}
                  </Badge>
                </div>
                <p className="mt-3 text-xs font-semibold text-[color:var(--dos-text-secondary)]">{item.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-[color:var(--dos-text-muted)]">{item.value}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-5">
        <GuidedPublishReadinessPanel readiness={readiness} compact source={demoMode ? 'prepared-reference' : snapshot.preflight ? 'server-preflight' : 'local'} />
      </div>

      <div className="mt-5">
        <GuidedProgressStepper
          steps={steps}
          actions={actions}
          title="Guided workflow"
          description="Advanced screens remain available, but this path is the recommended first route."
        />
      </div>
    </section>
  )
}
