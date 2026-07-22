/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

import { LayoutDashboard, LockKeyhole, ShieldAlert, Table2 } from 'lucide-react'
import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { ClientThemeShell } from '@/components/client/client-theme-shell'
import { PublishedChartsGrid } from '@/components/client/published-charts-grid'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { DASHBOARDOS_DEMO_COOKIE, shouldUseDashboardOsDemoRuntime } from '@/lib/dashboardos/demo-mode'
import { demoCharts, demoDashboard, demoDataset, demoPage, demoSlots, demoVersion } from '@/lib/dashboardos/demo-data'
import { mapDashboardChartSlot, mapDashboardPage, mapDashboardVersion, mapPublishedDashboard } from '@/lib/publishing/dashboard-publishing'
import { mapDashboardReleaseChartSnapshot, mapReleasedChartConfig } from '@/lib/publishing/dashboard-release-snapshots'
import {
  IMMUTABLE_RELEASE_MIGRATION,
  isMissingImmutableReleaseSchema,
} from '@/lib/publishing/immutable-release-schema'
import { listEntitledDashboardIds, listEntitledDatasetIds } from '@/lib/security/entitlements'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DashboardChartConfig } from '@/types/dashboard-chart'
import type { DashboardChartSlot, DashboardPage, DashboardVersion, PublishedDashboard } from '@/types/dashboard-publishing'

interface TenantRecord {
  id: string
  name: string
  slug: string
  status: string
  primary_domain?: string | null
}

interface ProjectRecord {
  id: string
  name: string
  description?: string | null
  status: string
}

interface DatasetRecord {
  id: string
  project_id: string
  name: string
  description?: string | null
  status: string
  selection?: {
    fieldIds?: string[]
    metricIds?: string[]
    relationshipIds?: string[]
  } | null
  cache_policy?: {
    ttlSeconds?: number
  } | null
  updated_at?: string | null
}

interface RuntimeDashboard {
  dashboard: PublishedDashboard
  version: DashboardVersion
  pages: DashboardPage[]
  slots: DashboardChartSlot[]
  health: DashboardHealthRunRecord | null
}

interface DashboardHealthRunRecord {
  health_state: 'healthy' | 'stale' | 'blocked'
  total_slots: number
  healthy_slots: number
  stale_slots: number
  blocked_slots: number
  checked_at: string
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return 'Not published yet'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function selectionCount(dataset: DatasetRecord, key: 'fieldIds' | 'metricIds' | 'relationshipIds') {
  const value = dataset.selection?.[key]
  return Array.isArray(value) ? value.length : 0
}

function gridSpanFromSlot(slot: DashboardChartSlot) {
  if (slot.width >= 10) return 4
  if (slot.width >= 7) return 3
  if (slot.width >= 4) return 2
  return 1
}

function chartWithSlotLayout(chart: DashboardChartConfig, slot: DashboardChartSlot): DashboardChartConfig {
  return {
    ...chart,
    name: slot.title || chart.name,
    layout: {
      order: slot.rowIndex * 12 + slot.columnIndex,
      gridSpan: gridSpanFromSlot(slot),
    },
  }
}

function healthBadgeClassName(state?: DashboardHealthRunRecord['health_state']) {
  if (state === 'healthy') return 'border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] text-[var(--dos-chart-success)]'
  if (state === 'stale') return 'border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[var(--dos-chart-warning)]'
  if (state === 'blocked') return 'border-[color:var(--dos-chart-risk)] bg-[var(--dos-danger-soft)] text-[var(--dos-chart-risk)]'
  return 'border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-muted)]'
}

function healthLabel(state?: DashboardHealthRunRecord['health_state']) {
  if (state === 'healthy') return 'Healthy'
  if (state === 'stale') return 'Needs review'
  if (state === 'blocked') return 'Degraded'
  return 'Health pending'
}

function AccessDeniedRuntime({ tenantSlug }: { tenantSlug: string }) {
  return (
    <ClientThemeShell>
      <header className="border-b border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)] text-[var(--dos-text-primary)]">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs text-[var(--dos-chart-warning)]">Client runtime</p>
              <h1 className="truncate text-xl font-semibold tracking-tight">Dashboard access required</h1>
            </div>
          </div>
          <Badge variant="outline" className="border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[var(--dos-chart-warning)]">
            Restricted
          </Badge>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-80px)] max-w-5xl px-4 py-10">
        <section className="grid w-full overflow-hidden rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] md:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="p-6 md:p-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[var(--dos-chart-warning)]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="mt-8 text-2xl font-semibold tracking-tight">Dashboard access has not been assigned</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--dos-text-muted)]">
            Your account is signed in, but it has not been assigned to the <span className="font-mono text-[var(--dos-text-secondary)]">{tenantSlug}</span> tenant or one of its published dashboard entitlements.
          </p>
          </div>
          <aside className="border-t border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)] p-6 md:border-l md:border-t-0">
            <p className="text-xs font-semibold">Access boundary</p>
          <div className="mt-6 rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)] px-4 py-3 text-left text-xs leading-5 text-[var(--dos-text-muted)]">
            Ask a workspace admin to add your employee account as a tenant member or grant a dashboard entitlement. Source credentials and unpublished semantic assets remain hidden.
          </div>
          </aside>
        </section>
      </main>
    </ClientThemeShell>
  )
}

function ReleaseStorageUnavailableRuntime({ tenantName, dashboardName }: { tenantName: string; dashboardName: string }) {
  return (
    <ClientThemeShell>
      <header className="border-b border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)]">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-xs text-[var(--dos-chart-warning)]">{tenantName}</p>
            <h1 className="text-xl font-semibold tracking-tight">{dashboardName}</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-80px)] max-w-3xl items-center px-4 py-10">
        <section className="w-full rounded-lg border border-[color:var(--dos-warning)] bg-[var(--dos-surface)] p-8 text-center" data-testid="release-storage-setup">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-[var(--dos-warning-soft)] text-[var(--dos-chart-warning)]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-xl font-semibold">Dashboard release is being prepared</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--dos-text-muted)]">
            The immutable published chart snapshot is not available yet. Ask a workspace administrator to complete release storage setup and reopen this dashboard.
          </p>
          {process.env.NODE_ENV !== 'production' ? (
            <p className="mx-auto mt-4 max-w-xl rounded-md bg-[var(--dos-surface-muted)] px-3 py-2 font-mono text-xs text-[var(--dos-text-secondary)]">
              Required AI Builder migration: {IMMUTABLE_RELEASE_MIGRATION}
            </p>
          ) : null}
        </section>
      </main>
    </ClientThemeShell>
  )
}

export default async function TenantClientPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>
}) {
  const { tenantSlug } = await params
  const requestHeaders = await headers()
  const cookieStore = await cookies()
  const hostname = (requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '').split(':')[0]
  const auth = await getAuthedSupabase()
  const demoRuntimeRequested = shouldUseDashboardOsDemoRuntime({
    hostname,
    cookieValue: cookieStore.get(DASHBOARDOS_DEMO_COOKIE)?.value,
    tenantSlug,
    isAuthenticated: Boolean(auth),
  })

  if (demoRuntimeRequested) {
    const datasetList: DatasetRecord[] = [{
      id: demoDataset.id,
      project_id: demoDataset.projectId,
      name: demoDataset.name,
      description: demoDataset.description,
      status: demoDataset.status,
      selection: demoDataset.selection,
      cache_policy: demoDataset.cachePolicy,
      updated_at: demoDataset.updatedAt,
    }]
    const projectList: ProjectRecord[] = [{
      id: demoDataset.projectId,
      name: 'Executive Analytics',
      description: 'Prepared governed revenue reporting workspace.',
      status: 'active',
    }]
    const datasetsByProject = new Map([[demoDataset.projectId, datasetList]])
    const runtimeDashboard = {
      dashboard: demoDashboard,
      version: demoVersion,
      pages: [demoPage],
      slots: demoSlots,
      health: {
        health_state: 'healthy' as const,
        total_slots: demoSlots.length,
        healthy_slots: demoSlots.length,
        stale_slots: 0,
        blocked_slots: 0,
        checked_at: demoVersion.publishedAt ?? demoVersion.createdAt,
      },
    }

    return (
      <ClientThemeShell>
        <header className="border-b border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)]">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-xs text-[var(--dos-text-muted)]">Northstar Retail</p>
                <h1 className="truncate text-lg font-semibold">{demoDashboard.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="hidden border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] text-[var(--dos-chart-success)] sm:inline-flex">
                Prepared release
              </Badge>
              <Badge variant="outline" className="border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] text-[var(--dos-chart-success)]">
                Healthy
              </Badge>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-5 px-4 py-5">
          <section className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Client dashboard runtime</h2>
            <p className="mt-1 text-xs text-[var(--dos-text-muted)]">
              Published datasets only. Builder controls, source credentials, and semantic draft assets stay hidden from this view.
            </p>
          </section>

          <section className="grid overflow-hidden rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] md:grid-cols-3 md:divide-x md:divide-[color:var(--dos-border-soft)]">
            {[['Projects', 1], ['Published datasets', 1], ['Published charts', demoCharts.length]].map(([label, value]) => <div key={String(label)} className="border-b border-[color:var(--dos-border-soft)] p-4 last:border-b-0 md:border-b-0"><p className="text-xs text-[var(--dos-text-muted)]">{label}</p><p className="mt-2 font-mono text-xl font-semibold">{value}</p></div>)}
          </section>

          <section className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{runtimeDashboard.version.title}</h2>
                <p className="mt-1 text-xs text-[var(--dos-text-muted)]">
                  {runtimeDashboard.pages.length} page, {runtimeDashboard.slots.length} governed chart slots. Published {formatUpdatedAt(runtimeDashboard.version.publishedAt)}.
                </p>
              </div>
              <Badge variant="outline" className="border-[color:var(--dos-chart-info)] bg-[var(--dos-info-soft)] text-[var(--dos-chart-info)]">
                Version {runtimeDashboard.version.versionNumber}
              </Badge>
            </div>
          </section>

          <PublishedChartsGrid tenantSlug="demo" charts={demoCharts} />

          <section className="space-y-4">
            {projectList.map(project => {
              const projectDatasets = datasetsByProject.get(project.id) ?? []
              return (
                <div key={project.id} className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">{project.name}</h2>
                      <p className="mt-1 text-xs text-[var(--dos-text-muted)]">{project.description}</p>
                    </div>
                    <Badge variant="outline" className="border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[var(--dos-chart-warning)]">
                      {projectDatasets.length} dataset
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {projectDatasets.map(dataset => (
                      <Card key={dataset.id} className="border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)]">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold">{dataset.name}</h3>
                              <p className="mt-1 text-xs text-[var(--dos-text-muted)]">{dataset.description}</p>
                            </div>
                            <Table2 className="h-4 w-4 text-[var(--dos-chart-success)]" />
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-md bg-[var(--dos-surface)] px-3 py-2"><p className="text-[var(--dos-text-muted)]">Fields</p><p className="mt-1 font-semibold">{selectionCount(dataset, 'fieldIds')}</p></div>
                            <div className="rounded-md bg-[var(--dos-surface)] px-3 py-2"><p className="text-[var(--dos-text-muted)]">Metrics</p><p className="mt-1 font-semibold">{selectionCount(dataset, 'metricIds')}</p></div>
                            <div className="rounded-md bg-[var(--dos-surface)] px-3 py-2"><p className="text-[var(--dos-text-muted)]">Joins</p><p className="mt-1 font-semibold">{selectionCount(dataset, 'relationshipIds')}</p></div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        </main>
      </ClientThemeShell>
    )
  }

  if (!auth) notFound()

  const { data: tenant, error: tenantError } = await auth.supabase
    .from('tenants')
    .select('id, name, slug, status, primary_domain')
    .eq('slug', tenantSlug)
    .eq('status', 'active')
    .single()

  if (tenantError || !tenant) return <AccessDeniedRuntime tenantSlug={tenantSlug} />
  const activeTenant = tenant as TenantRecord

  const [entitledDashboardIds, entitledDatasetIds] = await Promise.all([
    listEntitledDashboardIds({
      supabase: auth.supabase,
      userId: auth.userId,
      platformRole: auth.role,
      tenantId: activeTenant.id,
      access: 'view',
    }),
    listEntitledDatasetIds({
      supabase: auth.supabase,
      userId: auth.userId,
      platformRole: auth.role,
      tenantId: activeTenant.id,
    }),
  ])

  const [{ data: datasets, error: datasetsError }, { data: dashboards, error: dashboardsError }] = await Promise.all([
    entitledDatasetIds.length > 0
      ? auth.supabase
        .from('semantic_datasets')
        .select('id, project_id, name, description, status, selection, cache_policy, updated_at')
        .eq('tenant_id', activeTenant.id)
        .eq('status', 'published')
        .in('id', entitledDatasetIds)
        .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    entitledDashboardIds.length > 0
      ? auth.supabase
        .from('published_dashboards')
        .select('*')
        .eq('tenant_id', activeTenant.id)
        .eq('status', 'published')
        .not('current_version_id', 'is', null)
        .in('id', entitledDashboardIds)
        .order('published_at', { ascending: false })
        .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (datasetsError || dashboardsError) {
    throw new Error(datasetsError?.message ?? dashboardsError?.message ?? 'Failed to load client dashboard')
  }

  if (auth.role !== 'admin' && entitledDashboardIds.length === 0 && entitledDatasetIds.length === 0) {
    return <AccessDeniedRuntime tenantSlug={tenantSlug} />
  }

  const datasetList = (datasets ?? []) as DatasetRecord[]
  let runtimeDashboard: RuntimeDashboard | null = null
  let chartList: DashboardChartConfig[] = []
  const dashboardRow = dashboards?.[0] as Record<string, unknown> | undefined
  if (dashboardRow?.current_version_id) {
    const dashboard = mapPublishedDashboard(dashboardRow)
    const [
      { data: versionRow, error: versionError },
      { data: pages, error: pagesError },
      { data: slots, error: slotsError },
      { data: releaseChartRows, error: releaseChartsError },
      { data: healthRows, error: healthError },
    ] = await Promise.all([
      auth.supabase
        .from('dashboard_versions')
        .select('*')
        .eq('id', dashboard.currentVersionId)
        .eq('dashboard_id', dashboard.id)
        .eq('status', 'published')
        .single(),
      auth.supabase
        .from('dashboard_pages')
        .select('*')
        .eq('version_id', dashboard.currentVersionId)
        .order('sort_order', { ascending: true }),
      auth.supabase
        .from('dashboard_chart_slots')
        .select('*')
        .eq('version_id', dashboard.currentVersionId)
        .order('row_index', { ascending: true })
        .order('column_index', { ascending: true }),
      auth.supabase
        .from('dashboard_release_chart_snapshots')
        .select('*')
        .eq('version_id', dashboard.currentVersionId)
        .eq('dashboard_id', dashboard.id)
        .eq('tenant_id', activeTenant.id)
        .eq('project_id', dashboard.projectId),
      auth.supabase
        .from('dashboard_health_runs')
        .select('health_state, total_slots, healthy_slots, stale_slots, blocked_slots, checked_at')
        .eq('dashboard_id', dashboard.id)
        .order('checked_at', { ascending: false })
        .limit(1),
    ])

    const releaseStorageMissing = isMissingImmutableReleaseSchema(versionError)
      || isMissingImmutableReleaseSchema(releaseChartsError)
    if (releaseStorageMissing) {
      return <ReleaseStorageUnavailableRuntime tenantName={activeTenant.name} dashboardName={dashboard.name} />
    }
    if (versionError || pagesError || slotsError || releaseChartsError || healthError) {
      throw new Error(versionError?.message ?? pagesError?.message ?? slotsError?.message ?? releaseChartsError?.message ?? healthError?.message ?? 'Failed to load published dashboard')
    }

    const version = mapDashboardVersion(versionRow as Record<string, unknown>)
    const pageList = (pages ?? []).map(row => mapDashboardPage(row as Record<string, unknown>))
    const slotList = (slots ?? []).map(row => mapDashboardChartSlot(row as Record<string, unknown>))
    if (version.releaseSnapshotStatus === 'pending') {
      throw new Error('The selected dashboard version does not have an immutable release snapshot')
    }
    const releaseChartsBySlotId = new Map((releaseChartRows ?? []).map(row => {
      const snapshot = mapDashboardReleaseChartSnapshot(row as Record<string, unknown>)
      return [snapshot.slotId, snapshot]
    }))
    if (releaseChartsBySlotId.size !== slotList.length) {
      throw new Error('The immutable release snapshot is incomplete for the selected dashboard version')
    }
    chartList = slotList
      .map(slot => {
        const snapshot = releaseChartsBySlotId.get(slot.id)
        return snapshot ? chartWithSlotLayout(mapReleasedChartConfig(snapshot), slot) : null
      })
      .filter((chart): chart is DashboardChartConfig => chart !== null)
      .sort((left, right) => left.layout.order - right.layout.order)
    runtimeDashboard = {
      dashboard,
      version,
      pages: pageList,
      slots: slotList,
      health: (healthRows?.[0] as DashboardHealthRunRecord | undefined) ?? null,
    }
  }

  const projectIds = Array.from(new Set([
    ...datasetList.map(dataset => dataset.project_id),
    ...(runtimeDashboard ? [runtimeDashboard.dashboard.projectId] : []),
  ]))
  const { data: projects, error: projectsError } = projectIds.length > 0
    ? await auth.supabase
      .from('dashboard_projects')
      .select('id, name, description, status')
      .eq('tenant_id', activeTenant.id)
      .eq('status', 'active')
      .in('id', projectIds)
      .order('updated_at', { ascending: false })
    : { data: [], error: null }

  if (projectsError) throw new Error(projectsError.message)
  const projectList = (projects ?? []) as ProjectRecord[]
  const datasetsByProject = new Map<string, DatasetRecord[]>()
  for (const dataset of datasetList) {
    datasetsByProject.set(dataset.project_id, [...(datasetsByProject.get(dataset.project_id) ?? []), dataset])
  }

  return (
    <ClientThemeShell>
      <header className="border-b border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)]">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs text-[var(--dos-chart-success)]">{activeTenant.name}</p>
              <h1 className="truncate text-xl font-semibold tracking-tight">{runtimeDashboard?.dashboard.name ?? 'Published Dashboard'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)] text-[var(--dos-text-secondary)] sm:inline-flex">
              Read-only
            </Badge>
            <Badge variant="outline" className={healthBadgeClassName(runtimeDashboard?.health?.health_state)}>
              {healthLabel(runtimeDashboard?.health?.health_state)}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        <section className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-[var(--dos-chart-info)]">Executive runtime</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Electricity operations dashboard</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--dos-text-muted)]">
                Published charts run from governed semantic datasets. Builder controls, source credentials, and semantic draft assets stay hidden from this client view.
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)] px-4 py-3 text-right">
              <p className="font-mono text-[11px] text-[var(--dos-text-muted)]">Last updated</p>
              <p className="mt-1 text-sm font-semibold">{formatUpdatedAt(runtimeDashboard?.dashboard.publishedAt ?? runtimeDashboard?.version.publishedAt)}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--dos-text-muted)]">Workspace projects</p>
              <p className="mt-2 text-2xl font-semibold">{projectList.length}</p>
            </CardContent>
          </Card>
          <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--dos-text-muted)]">Published datasets</p>
              <p className="mt-2 text-2xl font-semibold">{datasetList.length}</p>
            </CardContent>
          </Card>
          <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--dos-text-muted)]">Published charts</p>
              <p className="mt-2 text-2xl font-semibold">{chartList.length}</p>
            </CardContent>
          </Card>
        </section>

        {runtimeDashboard ? (
          <section className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{runtimeDashboard.version.title}</h2>
                <p className="mt-1 text-xs text-[var(--dos-text-muted)]">
                  {runtimeDashboard.pages.length} pages, {runtimeDashboard.slots.length} governed chart slots. Published {formatUpdatedAt(runtimeDashboard.version.publishedAt)}.
                </p>
                {runtimeDashboard.health ? (
                  <p className="mt-1 text-xs text-[var(--dos-text-muted)]">
                    Last health check {formatUpdatedAt(runtimeDashboard.health.checked_at)}: {runtimeDashboard.health.healthy_slots}/{runtimeDashboard.health.total_slots} slots healthy.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[var(--dos-text-muted)]">No dashboard health check has been recorded yet.</p>
                )}
              </div>
              <Badge variant="outline" className="border-[color:var(--dos-chart-info)] bg-[var(--dos-info-soft)] text-[var(--dos-chart-info)]">
                Version {runtimeDashboard.version.versionNumber}
              </Badge>
            </div>
          </section>
        ) : null}

        <PublishedChartsGrid tenantSlug={activeTenant.slug} charts={chartList} />

        {projectList.length === 0 ? (
          <section className="rounded-xl border border-dashed border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-10 text-center">
            <LockKeyhole className="mx-auto h-8 w-8 text-[var(--dos-text-muted)]" />
            <h2 className="mt-3 text-sm font-semibold">No active projects available</h2>
            <p className="mt-1 text-xs text-[var(--dos-text-muted)]">Ask your dashboard team to publish a tenant project first.</p>
          </section>
        ) : (
          <section className="space-y-4">
            {projectList.map(project => {
              const projectDatasets = datasetsByProject.get(project.id) ?? []
              return (
                <div key={project.id} className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--dos-chart-success)]">Governed data assets</p>
                      <h2 className="mt-1 text-sm font-semibold">{project.name}</h2>
                      <p className="mt-1 text-xs text-[var(--dos-text-muted)]">
                        {project.description || 'Published client datasets behind this dashboard.'}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-[color:var(--dos-chart-warning)] bg-[var(--dos-warning-soft)] text-[var(--dos-chart-warning)]">
                      {projectDatasets.length} datasets
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {projectDatasets.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)] p-6 text-center text-xs text-[var(--dos-text-muted)] md:col-span-2">
                        No published datasets in this project yet.
                      </div>
                    ) : projectDatasets.map(dataset => (
                      <Card key={dataset.id} className="border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)]">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold">{dataset.name}</h3>
                              <p className="mt-1 text-xs text-[var(--dos-text-muted)]">
                                {dataset.description || 'Published semantic dataset'}
                              </p>
                            </div>
                            <Table2 className="h-4 w-4 text-[var(--dos-chart-success)]" />
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-md bg-[var(--dos-surface)] px-3 py-2">
                              <p className="text-[var(--dos-text-muted)]">Fields</p>
                              <p className="mt-1 font-semibold">{selectionCount(dataset, 'fieldIds')}</p>
                            </div>
                            <div className="rounded-md bg-[var(--dos-surface)] px-3 py-2">
                              <p className="text-[var(--dos-text-muted)]">Metrics</p>
                              <p className="mt-1 font-semibold">{selectionCount(dataset, 'metricIds')}</p>
                            </div>
                            <div className="rounded-md bg-[var(--dos-surface)] px-3 py-2">
                              <p className="text-[var(--dos-text-muted)]">Joins</p>
                              <p className="mt-1 font-semibold">{selectionCount(dataset, 'relationshipIds')}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-[11px] text-[var(--dos-text-muted)]">
                            Updated {formatUpdatedAt(dataset.updated_at)} / cache {dataset.cache_policy?.ttlSeconds ?? 300}s
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )}
      </main>
    </ClientThemeShell>
  )
}
