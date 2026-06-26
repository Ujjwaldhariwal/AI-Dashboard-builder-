import type { SupabaseClient } from '@supabase/supabase-js'

import { auditDashboardCharts, type ChartHealthState, type DashboardChartAuditItem } from '@/lib/semantic/chart-health-auditor'
import {
  mapDashboardChartSlot,
  mapDashboardPage,
  mapDashboardVersion,
  mapPublishedDashboard,
} from '@/lib/publishing/dashboard-publishing'
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

  const [versionsResult, pagesResult, slotsResult] = await Promise.all([
    versionIds.length > 0
      ? supabase.from('dashboard_versions').select('*').in('id', versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length > 0
      ? supabase.from('dashboard_pages').select('*').in('version_id', versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length > 0
      ? supabase.from('dashboard_chart_slots').select('*').in('version_id', versionIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (versionsResult.error) throw new Error(versionsResult.error.message)
  if (pagesResult.error) throw new Error(pagesResult.error.message)
  if (slotsResult.error) throw new Error(slotsResult.error.message)

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

  const chartAudit = await auditDashboardCharts({
    supabase,
    projectId,
    tenantId,
    status: 'published',
  })
  const chartItemsById = new Map(chartAudit.items.map(item => [item.chart.id, item]))

  const dashboardsHealth = dashboards.map(dashboard => {
    const version = dashboard.currentVersionId ? versionsById.get(dashboard.currentVersionId) : undefined
    const pages = version ? pagesByVersionId.get(version.id) ?? [] : []
    const slots = version ? slotsByVersionId.get(version.id) ?? [] : []
    return buildDashboardHealthItem({ dashboard, version, pages, slots, chartItemsById })
  })

  return auditFromDashboards(new Date().toISOString(), dashboardsHealth)
}

export async function auditDashboardVersion({
  supabase,
  dashboard,
  version,
}: AuditDashboardVersionInput): Promise<DashboardHealthAudit> {
  const [pagesResult, slotsResult, chartAudit] = await Promise.all([
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
    auditDashboardCharts({
      supabase,
      projectId: dashboard.projectId,
      tenantId: dashboard.tenantId,
      status: 'published',
    }),
  ])

  if (pagesResult.error) throw new Error(pagesResult.error.message)
  if (slotsResult.error) throw new Error(slotsResult.error.message)

  const pages = ((pagesResult.data ?? []) as Record<string, unknown>[]).map(row => mapDashboardPage(row))
  const slots = ((slotsResult.data ?? []) as Record<string, unknown>[]).map(row => mapDashboardChartSlot(row))
  const chartItemsById = new Map(chartAudit.items.map(item => [item.chart.id, item]))
  const dashboardHealth = buildDashboardHealthItem({ dashboard, version, pages, slots, chartItemsById })

  return auditFromDashboards(new Date().toISOString(), [dashboardHealth])
}

export async function recordDashboardHealthRuns({
  supabase,
  audit,
  checkedBy,
}: {
  supabase: SupabaseClient
  audit: DashboardHealthAudit
  checkedBy: string
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
