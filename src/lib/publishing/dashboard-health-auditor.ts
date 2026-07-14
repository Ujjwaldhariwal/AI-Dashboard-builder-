import type { SupabaseClient } from '@supabase/supabase-js'

import { auditDashboardCharts, type ChartHealthState, type DashboardChartAuditItem } from '@/lib/semantic/chart-health-auditor'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import {
  mapDashboardChartSlot,
  mapDashboardPage,
  mapDashboardVersion,
  mapPublishedDashboard,
} from '@/lib/publishing/dashboard-publishing'
import {
  mapDashboardReleaseChartSnapshot,
  mapDashboardReleaseDatasetSnapshot,
  mapReleasedChartConfig,
  releasedSourceSchemaContracts,
  resolveReleasedSemanticReferences,
  type DashboardReleaseChartSnapshot,
  type DashboardReleaseDatasetSnapshot,
} from '@/lib/publishing/dashboard-release-snapshots'
import type {
  DashboardChartSlot,
  DashboardHealthAudit,
  DashboardHealthAuditDashboard,
  DashboardHealthAuditItem,
  DashboardHealthState,
  DashboardPage,
  DashboardVersion,
  PublishedDashboard,
} from '@/types/dashboard-publishing'

export interface AuditPublishedDashboardsInput {
  supabase: SupabaseClient
  projectId?: string | null
  tenantId?: string | null
  dashboardId?: string | null
}

export interface AuditDashboardVersionInput {
  supabase: SupabaseClient
  dashboard: PublishedDashboard
  version: DashboardVersion
}

export interface ReleaseSourceState {
  status: string
  schemaHash: string | null
}

export function releasedSourceContractIssues(
  snapshot: DashboardReleaseDatasetSnapshot,
  sourceStatesById: Map<string, ReleaseSourceState>,
): DashboardHealthAuditItem['issues'] {
  return Object.entries(releasedSourceSchemaContracts(snapshot))
    .flatMap(([sourceId, expectedSchemaHash]) => {
      const source = sourceStatesById.get(sourceId)
      if (!source) {
        return [{ severity: 'error' as const, code: 'missing_release_data_source', message: `Released data source ${sourceId} is no longer available.` }]
      }
      if (source.status !== 'active') {
        return [{ severity: 'error' as const, code: 'inactive_release_data_source', message: `Released data source ${sourceId} is not active.` }]
      }
      if (!source.schemaHash || source.schemaHash !== expectedSchemaHash) {
        return [{ severity: 'error' as const, code: 'release_source_schema_mismatch', message: `Released data source ${sourceId} no longer matches the captured schema contract.` }]
      }
      return []
    })
}

async function loadReleaseSourceStates(
  supabase: SupabaseClient,
  snapshots: DashboardReleaseDatasetSnapshot[],
) {
  const sourceIds = Array.from(new Set(snapshots.flatMap(snapshot => (
    Object.keys(releasedSourceSchemaContracts(snapshot))
  ))))
  if (sourceIds.length === 0) return new Map<string, ReleaseSourceState>()

  const { data, error } = await supabase
    .from('data_sources')
    .select('id, status, schema_hash')
    .in('id', sourceIds)

  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as Record<string, unknown>[]).map(row => [
    String(row.id),
    {
      status: String(row.status ?? 'missing'),
      schemaHash: typeof row.schema_hash === 'string' ? row.schema_hash : null,
    },
  ]))
}

function stateFromSlots(items: DashboardHealthAuditItem[]): DashboardHealthState {
  if (items.length === 0) return 'blocked'
  if (items.some(item => item.healthState === 'blocked')) return 'blocked'
  if (items.some(item => item.healthState === 'stale')) return 'stale'
  return 'healthy'
}

function slotHealthFromChartItem(item: DashboardChartAuditItem | undefined): ChartHealthState {
  return item?.healthState ?? 'blocked'
}

function slotIssueFromChartItem(item: DashboardChartAuditItem | undefined) {
  if (item) return item.validation.issues
  return [{ severity: 'error' as const, code: 'missing_chart_config', message: 'Slot chart config is missing or not published.' }]
}

function buildDashboardHealthItem({
  dashboard,
  version,
  pages,
  slots,
  chartItemsById,
}: {
  dashboard: PublishedDashboard
  version: DashboardVersion | undefined
  pages: DashboardPage[]
  slots: DashboardChartSlot[]
  chartItemsById: Map<string, DashboardChartAuditItem>
}): DashboardHealthAuditDashboard {
  const items: DashboardHealthAuditItem[] = slots.map(slot => {
    const chartItem = chartItemsById.get(slot.chartConfigId)
    return {
      slot: {
        id: slot.id,
        pageId: slot.pageId,
        chartConfigId: slot.chartConfigId,
        slotKey: slot.slotKey,
        title: slot.title,
      },
      chart: chartItem?.chart ?? {
        id: slot.chartConfigId,
        name: slot.title ?? 'Missing chart config',
        status: 'missing',
        templateId: 'unknown',
        validationState: 'invalid',
      },
      healthState: slotHealthFromChartItem(chartItem),
      issues: slotIssueFromChartItem(chartItem),
    }
  })
  const healthState = version ? stateFromSlots(items) : 'blocked'

  return {
    dashboard: {
      id: dashboard.id,
      name: dashboard.name,
      slug: dashboard.slug,
      status: dashboard.status,
      publishedAt: dashboard.publishedAt,
    },
    version: version
      ? {
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        status: version.status,
        publishedAt: version.publishedAt,
      }
      : null,
    summary: {
      totalSlots: items.length,
      healthySlots: items.filter(item => item.healthState === 'healthy').length,
      staleSlots: items.filter(item => item.healthState === 'stale').length,
      blockedSlots: items.filter(item => item.healthState === 'blocked').length,
      pageCount: pages.length,
    },
    healthState,
    items,
  }
}

function buildReleasedDashboardHealthItem({
  dashboard,
  version,
  pages,
  slots,
  chartSnapshotsBySlotId,
  datasetSnapshotsById,
  sourceStatesById,
}: {
  dashboard: PublishedDashboard
  version: DashboardVersion
  pages: DashboardPage[]
  slots: DashboardChartSlot[]
  chartSnapshotsBySlotId: Map<string, DashboardReleaseChartSnapshot>
  datasetSnapshotsById: Map<string, DashboardReleaseDatasetSnapshot>
  sourceStatesById: Map<string, ReleaseSourceState>
}): DashboardHealthAuditDashboard {
  const items: DashboardHealthAuditItem[] = slots.map(slot => {
    const chartSnapshot = chartSnapshotsBySlotId.get(slot.id)
    if (!chartSnapshot) {
      return {
        slot: {
          id: slot.id,
          pageId: slot.pageId,
          chartConfigId: slot.chartConfigId,
          slotKey: slot.slotKey,
          title: slot.title,
        },
        chart: {
          id: slot.chartConfigId,
          name: slot.title ?? 'Missing release chart snapshot',
          status: 'missing',
          templateId: 'unknown',
          validationState: 'invalid',
        },
        healthState: 'blocked',
        issues: [{ severity: 'error', code: 'missing_release_chart_snapshot', message: 'The released slot has no immutable chart snapshot.' }],
      }
    }

    const chart = mapReleasedChartConfig(chartSnapshot)
    const datasetSnapshot = datasetSnapshotsById.get(chartSnapshot.datasetSnapshotId)
    if (!datasetSnapshot) {
      return {
        slot: {
          id: slot.id,
          pageId: slot.pageId,
          chartConfigId: chartSnapshot.id,
          slotKey: slot.slotKey,
          title: slot.title,
        },
        chart: {
          id: chartSnapshot.id,
          name: chart.name,
          status: 'released',
          templateId: chart.templateId,
          validationState: 'invalid',
        },
        healthState: 'blocked',
        issues: [{ severity: 'error', code: 'missing_release_dataset_snapshot', message: 'The released chart has no immutable dataset snapshot.' }],
      }
    }

    const semantics = resolveReleasedSemanticReferences(datasetSnapshot)
    if (!semantics.ok) {
      return {
        slot: {
          id: slot.id,
          pageId: slot.pageId,
          chartConfigId: chartSnapshot.id,
          slotKey: slot.slotKey,
          title: slot.title,
        },
        chart: {
          id: chartSnapshot.id,
          name: chart.name,
          status: 'released',
          templateId: chart.templateId,
          validationState: 'invalid',
        },
        healthState: 'blocked',
        issues: [{ severity: 'error', code: 'invalid_release_semantic_snapshot', message: semantics.error ?? 'The released semantic snapshot is invalid.' }],
      }
    }

    const validation = validateDashboardChartConfig({
      templateId: chart.templateId,
      encoding: chart.encoding,
      fields: semantics.fields,
      metrics: semantics.metrics,
    })
    const sourceIssues = releasedSourceContractIssues(datasetSnapshot, sourceStatesById)
    const legacy = chartSnapshot.snapshotOrigin === 'legacy_backfill'
      || datasetSnapshot.snapshotOrigin === 'legacy_backfill'
      || version.releaseSnapshotStatus === 'legacy_backfill'
    const issues = [...validation.issues, ...sourceIssues]
    if (legacy) {
      issues.push({
        severity: 'warning',
        code: 'legacy_release_backfill',
        message: 'This release snapshot was reconstructed from the mutable state present during migration, not captured at its original publish time.',
      })
    }

    return {
      slot: {
        id: slot.id,
        pageId: slot.pageId,
        chartConfigId: chartSnapshot.id,
        slotKey: slot.slotKey,
        title: slot.title,
      },
      chart: {
        id: chartSnapshot.id,
        name: chart.name,
        status: 'released',
        templateId: chart.templateId,
        validationState: validation.state,
      },
      healthState: validation.state === 'valid' && sourceIssues.length === 0 ? (legacy ? 'stale' : 'healthy') : 'blocked',
      issues,
    }
  })

  return {
    dashboard: {
      id: dashboard.id,
      name: dashboard.name,
      slug: dashboard.slug,
      status: dashboard.status,
      publishedAt: dashboard.publishedAt,
    },
    version: {
      id: version.id,
      versionNumber: version.versionNumber,
      title: version.title,
      status: version.status,
      publishedAt: version.publishedAt,
    },
    summary: {
      totalSlots: items.length,
      healthySlots: items.filter(item => item.healthState === 'healthy').length,
      staleSlots: items.filter(item => item.healthState === 'stale').length,
      blockedSlots: items.filter(item => item.healthState === 'blocked').length,
      pageCount: pages.length,
    },
    healthState: stateFromSlots(items),
    items,
  }
}

function auditFromDashboards(checkedAt: string, dashboards: DashboardHealthAuditDashboard[]): DashboardHealthAudit {
  return {
    checkedAt,
    summary: {
      total: dashboards.length,
      healthy: dashboards.filter(item => item.healthState === 'healthy').length,
      stale: dashboards.filter(item => item.healthState === 'stale').length,
      blocked: dashboards.filter(item => item.healthState === 'blocked').length,
    },
    dashboards,
  }
}

export async function auditPublishedDashboards({
  supabase,
  projectId,
  tenantId,
  dashboardId,
}: AuditPublishedDashboardsInput): Promise<DashboardHealthAudit> {
  let dashboardQuery = supabase
    .from('published_dashboards')
    .select('*')
    .eq('status', 'published')
    .not('current_version_id', 'is', null)
    .order('published_at', { ascending: false })

  if (projectId) dashboardQuery = dashboardQuery.eq('project_id', projectId)
  if (tenantId) dashboardQuery = dashboardQuery.eq('tenant_id', tenantId)
  if (dashboardId) dashboardQuery = dashboardQuery.eq('id', dashboardId)

  const { data: dashboardRows, error: dashboardError } = await dashboardQuery
  if (dashboardError) throw new Error(dashboardError.message)

  const dashboards = (dashboardRows ?? []).map(row => mapPublishedDashboard(row as Record<string, unknown>))
  const versionIds = dashboards.map(dashboard => dashboard.currentVersionId).filter(Boolean) as string[]

  const [versionsResult, pagesResult, slotsResult, chartSnapshotsResult, datasetSnapshotsResult] = await Promise.all([
    versionIds.length > 0
      ? supabase.from('dashboard_versions').select('*').in('id', versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length > 0
      ? supabase.from('dashboard_pages').select('*').in('version_id', versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length > 0
      ? supabase.from('dashboard_chart_slots').select('*').in('version_id', versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length > 0
      ? supabase.from('dashboard_release_chart_snapshots').select('*').in('version_id', versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length > 0
      ? supabase.from('dashboard_release_dataset_snapshots').select('*').in('version_id', versionIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (versionsResult.error) throw new Error(versionsResult.error.message)
  if (pagesResult.error) throw new Error(pagesResult.error.message)
  if (slotsResult.error) throw new Error(slotsResult.error.message)
  if (chartSnapshotsResult.error) throw new Error(chartSnapshotsResult.error.message)
  if (datasetSnapshotsResult.error) throw new Error(datasetSnapshotsResult.error.message)

  const versionsById = new Map(
    ((versionsResult.data ?? []) as Record<string, unknown>[]).map(row => {
      const version = mapDashboardVersion(row)
      return [version.id, version]
    }),
  )
  const pagesByVersionId = new Map<string, DashboardPage[]>()
  for (const row of (pagesResult.data ?? []) as Record<string, unknown>[]) {
    const page = mapDashboardPage(row)
    pagesByVersionId.set(page.versionId, [...(pagesByVersionId.get(page.versionId) ?? []), page])
  }
  const slotsByVersionId = new Map<string, DashboardChartSlot[]>()
  for (const row of (slotsResult.data ?? []) as Record<string, unknown>[]) {
    const slot = mapDashboardChartSlot(row)
    slotsByVersionId.set(slot.versionId, [...(slotsByVersionId.get(slot.versionId) ?? []), slot])
  }

  const chartSnapshotsByVersionId = new Map<string, Map<string, DashboardReleaseChartSnapshot>>()
  for (const row of (chartSnapshotsResult.data ?? []) as Record<string, unknown>[]) {
    const snapshot = mapDashboardReleaseChartSnapshot(row)
    const snapshotsBySlot = chartSnapshotsByVersionId.get(snapshot.versionId) ?? new Map<string, DashboardReleaseChartSnapshot>()
    snapshotsBySlot.set(snapshot.slotId, snapshot)
    chartSnapshotsByVersionId.set(snapshot.versionId, snapshotsBySlot)
  }
  const datasetSnapshotsByVersionId = new Map<string, Map<string, DashboardReleaseDatasetSnapshot>>()
  const allDatasetSnapshots: DashboardReleaseDatasetSnapshot[] = []
  for (const row of (datasetSnapshotsResult.data ?? []) as Record<string, unknown>[]) {
    const snapshot = mapDashboardReleaseDatasetSnapshot(row)
    allDatasetSnapshots.push(snapshot)
    const snapshotsById = datasetSnapshotsByVersionId.get(snapshot.versionId) ?? new Map<string, DashboardReleaseDatasetSnapshot>()
    snapshotsById.set(snapshot.id, snapshot)
    datasetSnapshotsByVersionId.set(snapshot.versionId, snapshotsById)
  }
  const sourceStatesById = await loadReleaseSourceStates(supabase, allDatasetSnapshots)

  const dashboardsHealth = dashboards.map(dashboard => {
    const version = dashboard.currentVersionId ? versionsById.get(dashboard.currentVersionId) : undefined
    const pages = version ? pagesByVersionId.get(version.id) ?? [] : []
    const slots = version ? slotsByVersionId.get(version.id) ?? [] : []
    if (!version) return buildDashboardHealthItem({ dashboard, version, pages, slots, chartItemsById: new Map() })
    return buildReleasedDashboardHealthItem({
      dashboard,
      version,
      pages,
      slots,
      chartSnapshotsBySlotId: chartSnapshotsByVersionId.get(version.id) ?? new Map(),
      datasetSnapshotsById: datasetSnapshotsByVersionId.get(version.id) ?? new Map(),
      sourceStatesById,
    })
  })

  return auditFromDashboards(new Date().toISOString(), dashboardsHealth)
}

export async function auditDashboardVersion({
  supabase,
  dashboard,
  version,
}: AuditDashboardVersionInput): Promise<DashboardHealthAudit> {
  const released = version.releaseSnapshotStatus !== 'pending'
  const [pagesResult, slotsResult, chartSnapshotsResult, datasetSnapshotsResult, chartAudit] = await Promise.all([
    supabase
      .from('dashboard_pages')
      .select('*')
      .eq('version_id', version.id)
      .eq('dashboard_id', dashboard.id)
      .eq('tenant_id', dashboard.tenantId)
      .eq('project_id', dashboard.projectId),
    supabase
      .from('dashboard_chart_slots')
      .select('*')
      .eq('version_id', version.id)
      .eq('dashboard_id', dashboard.id)
      .eq('tenant_id', dashboard.tenantId)
      .eq('project_id', dashboard.projectId),
    released
      ? supabase
        .from('dashboard_release_chart_snapshots')
        .select('*')
        .eq('version_id', version.id)
        .eq('dashboard_id', dashboard.id)
        .eq('tenant_id', dashboard.tenantId)
        .eq('project_id', dashboard.projectId)
      : Promise.resolve({ data: [], error: null }),
    released
      ? supabase
        .from('dashboard_release_dataset_snapshots')
        .select('*')
        .eq('version_id', version.id)
        .eq('dashboard_id', dashboard.id)
        .eq('tenant_id', dashboard.tenantId)
        .eq('project_id', dashboard.projectId)
      : Promise.resolve({ data: [], error: null }),
    released
      ? Promise.resolve(null)
      : auditDashboardCharts({
        supabase,
        projectId: dashboard.projectId,
        tenantId: dashboard.tenantId,
        status: 'published',
      }),
  ])

  if (pagesResult.error) throw new Error(pagesResult.error.message)
  if (slotsResult.error) throw new Error(slotsResult.error.message)
  if (chartSnapshotsResult.error) throw new Error(chartSnapshotsResult.error.message)
  if (datasetSnapshotsResult.error) throw new Error(datasetSnapshotsResult.error.message)

  const pages = ((pagesResult.data ?? []) as Record<string, unknown>[]).map(row => mapDashboardPage(row))
  const slots = ((slotsResult.data ?? []) as Record<string, unknown>[]).map(row => mapDashboardChartSlot(row))
  let dashboardHealth: DashboardHealthAuditDashboard
  if (released) {
    const chartSnapshotsBySlotId = new Map(((chartSnapshotsResult.data ?? []) as Record<string, unknown>[])
      .map(row => mapDashboardReleaseChartSnapshot(row))
      .map(snapshot => [snapshot.slotId, snapshot]))
    const datasetSnapshotsById = new Map(((datasetSnapshotsResult.data ?? []) as Record<string, unknown>[])
      .map(row => mapDashboardReleaseDatasetSnapshot(row))
      .map(snapshot => [snapshot.id, snapshot]))
    const sourceStatesById = await loadReleaseSourceStates(supabase, Array.from(datasetSnapshotsById.values()))
    dashboardHealth = buildReleasedDashboardHealthItem({
      dashboard,
      version,
      pages,
      slots,
      chartSnapshotsBySlotId,
      datasetSnapshotsById,
      sourceStatesById,
    })
  } else {
    const chartItemsById = new Map((chartAudit?.items ?? []).map(item => [item.chart.id, item]))
    dashboardHealth = buildDashboardHealthItem({ dashboard, version, pages, slots, chartItemsById })
  }

  return auditFromDashboards(new Date().toISOString(), [dashboardHealth])
}

export async function recordDashboardHealthRuns({
  supabase,
  audit,
  checkedBy,
}: {
  supabase: SupabaseClient
  audit: DashboardHealthAudit
  checkedBy: string | null
}) {
  const rows = audit.dashboards.map(item => ({
    tenant_id: item.dashboard.id ? null : null,
    project_id: null,
    dashboard_id: item.dashboard.id,
    version_id: item.version?.id ?? null,
    checked_by: checkedBy,
    health_state: item.healthState,
    total_slots: item.summary.totalSlots,
    healthy_slots: item.summary.healthySlots,
    stale_slots: item.summary.staleSlots,
    blocked_slots: item.summary.blockedSlots,
    degraded_chart_ids: item.items
      .filter(slot => slot.healthState !== 'healthy')
      .map(slot => slot.chart.id),
    summary: item.summary,
    items: item.items,
    checked_at: audit.checkedAt,
  }))

  if (rows.length === 0) return []

  const { data: dashboardRows, error: dashboardError } = await supabase
    .from('published_dashboards')
    .select('id, tenant_id, project_id')
    .in('id', rows.map(row => row.dashboard_id))

  if (dashboardError) throw new Error(dashboardError.message)
  const ownership = new Map((dashboardRows ?? []).map(row => [
    String(row.id),
    { tenantId: String(row.tenant_id), projectId: String(row.project_id) },
  ]))

  const { data, error } = await supabase
    .from('dashboard_health_runs')
    .insert(rows.map(row => {
      const owner = ownership.get(row.dashboard_id)
      return {
        ...row,
        tenant_id: owner?.tenantId ?? null,
        project_id: owner?.projectId ?? null,
      }
    }))
    .select('*')

  if (error) throw new Error(error.message)
  return data as Record<string, unknown>[]
}
