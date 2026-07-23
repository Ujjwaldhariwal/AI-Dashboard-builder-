/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

import { Activity, LayoutDashboard, ShieldAlert } from 'lucide-react'
import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { ClientThemeShell } from '@/components/client/client-theme-shell'
import { PublishedChartsGrid } from '@/components/client/published-charts-grid'
import { Badge } from '@/components/ui/badge'
import { DASHBOARDOS_DEMO_COOKIE, shouldUseDashboardOsDemoRuntime } from '@/lib/dashboardos/demo-mode'
import { demoCharts, demoDashboard, demoSlots, demoVersion } from '@/lib/dashboardos/demo-data'
import { publishedDashboardDisplayName } from '@/lib/client/published-chart-runtime'
import { mapDashboardChartSlot, mapDashboardPage, mapDashboardVersion, mapPublishedDashboard } from '@/lib/publishing/dashboard-publishing'
import { mapDashboardReleaseChartSnapshot, mapReleasedChartConfig } from '@/lib/publishing/dashboard-release-snapshots'
import {
  IMMUTABLE_RELEASE_MIGRATION,
  isMissingImmutableReleaseSchema,
} from '@/lib/publishing/immutable-release-schema'
import { listEntitledDashboardIds } from '@/lib/security/entitlements'
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

function PublishedDashboardRuntime({
  tenantName,
  tenantSlug,
  dashboardName,
  versionNumber,
  publishedAt,
  health,
  charts,
}: {
  tenantName: string
  tenantSlug: string
  dashboardName: string
  versionNumber?: number
  publishedAt?: string | null
  health?: DashboardHealthRunRecord | null
  charts: DashboardChartConfig[]
}) {
  const displayName = publishedDashboardDisplayName(dashboardName) || 'Published dashboard'

  return (
    <ClientThemeShell>
      <header className="border-b border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 pr-16">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)]">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">DashboardOS</p>
              <p className="truncate text-xs text-[var(--dos-text-muted)]">{tenantName}</p>
            </div>
          </div>
          <Badge variant="outline" className={healthBadgeClassName(health?.health_state)}>
            {healthLabel(health?.health_state)}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:py-7">
        <section className="border-b border-[color:var(--dos-border-soft)] pb-5 sm:pb-6">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[var(--dos-text-muted)]">
                <Activity className="h-3.5 w-3.5 text-[var(--dos-accent-primary)]" />
                <span>Live operating view</span>
              </div>
              <h1 className="min-w-0 [overflow-wrap:anywhere] text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
                {displayName}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--dos-text-muted)] lg:justify-end">
              <span className="font-mono tabular-nums">{charts.length} charts</span>
              {versionNumber ? <span>Version {versionNumber}</span> : null}
              <span>Updated {formatUpdatedAt(publishedAt)}</span>
            </div>
          </div>
        </section>

        {charts.length > 0 ? (
          <PublishedChartsGrid tenantSlug={tenantSlug} charts={charts} />
        ) : (
          <section className="rounded-lg border border-dashed border-[color:var(--dos-border-mid)] px-5 py-12 text-center">
            <h2 className="text-base font-semibold">No charts are published yet</h2>
            <p className="mt-2 text-sm text-[var(--dos-text-muted)]">Publish a dashboard version with at least one validated chart slot.</p>
          </section>
        )}
      </main>
    </ClientThemeShell>
  )
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
    return <PublishedDashboardRuntime
      tenantName="Northstar Retail"
      tenantSlug="demo"
      dashboardName={demoDashboard.name}
      versionNumber={demoVersion.versionNumber}
      publishedAt={demoVersion.publishedAt}
      health={{
        health_state: 'healthy',
        total_slots: demoSlots.length,
        healthy_slots: demoSlots.length,
        stale_slots: 0,
        blocked_slots: 0,
        checked_at: demoVersion.publishedAt ?? demoVersion.createdAt,
      }}
      charts={demoCharts}
    />
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

  const entitledDashboardIds = await listEntitledDashboardIds({
    supabase: auth.supabase,
    userId: auth.userId,
    platformRole: auth.role,
    tenantId: activeTenant.id,
    access: 'view',
  })

  if (auth.role !== 'admin' && entitledDashboardIds.length === 0) {
    return <AccessDeniedRuntime tenantSlug={tenantSlug} />
  }

  const { data: dashboards, error: dashboardsError } = entitledDashboardIds.length > 0
    ? await auth.supabase
      .from('published_dashboards')
      .select('*')
      .eq('tenant_id', activeTenant.id)
      .eq('status', 'published')
      .not('current_version_id', 'is', null)
      .in('id', entitledDashboardIds)
      .order('published_at', { ascending: false })
      .limit(1)
    : { data: [], error: null }

  if (dashboardsError) throw new Error(dashboardsError.message)

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

  return <PublishedDashboardRuntime
    tenantName={activeTenant.name}
    tenantSlug={activeTenant.slug}
    dashboardName={runtimeDashboard?.dashboard.name ?? 'Published dashboard'}
    versionNumber={runtimeDashboard?.version.versionNumber}
    publishedAt={runtimeDashboard?.dashboard.publishedAt ?? runtimeDashboard?.version.publishedAt}
    health={runtimeDashboard?.health}
    charts={chartList}
  />
}
