import type {
  DashboardChartSlot,
  DashboardPage,
  DashboardPublishEvent,
  DashboardVersion,
  PublishedDashboard,
} from '@/types/dashboard-publishing'

export function mapPublishedDashboard(row: Record<string, unknown>): PublishedDashboard {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as PublishedDashboard['status'],
    currentVersionId: typeof row.current_version_id === 'string' ? row.current_version_id : null,
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    updatedBy: typeof row.updated_by === 'string' ? row.updated_by : null,
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export function mapDashboardVersion(row: Record<string, unknown>): DashboardVersion {
  return {
    id: String(row.id),
    dashboardId: String(row.dashboard_id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    versionNumber: Number(row.version_number ?? 1),
    status: String(row.status ?? 'draft') as DashboardVersion['status'],
    title: String(row.title ?? ''),
    notes: typeof row.notes === 'string' ? row.notes : null,
    layout: row.layout && typeof row.layout === 'object'
      ? row.layout as Record<string, unknown>
      : {},
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    publishedBy: typeof row.published_by === 'string' ? row.published_by : null,
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export function mapDashboardPage(row: Record<string, unknown>): DashboardPage {
  return {
    id: String(row.id),
    versionId: String(row.version_id),
    dashboardId: String(row.dashboard_id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    title: String(row.title ?? ''),
    slug: String(row.slug ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    layout: row.layout && typeof row.layout === 'object'
      ? row.layout as Record<string, unknown>
      : {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export function mapDashboardChartSlot(row: Record<string, unknown>): DashboardChartSlot {
  return {
    id: String(row.id),
    pageId: String(row.page_id),
    versionId: String(row.version_id),
    dashboardId: String(row.dashboard_id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    chartConfigId: String(row.chart_config_id),
    title: typeof row.title === 'string' ? row.title : null,
    slotKey: String(row.slot_key ?? ''),
    rowIndex: Number(row.row_index ?? 0),
    columnIndex: Number(row.column_index ?? 0),
    width: Number(row.width ?? 6),
    height: Number(row.height ?? 4),
    settings: row.settings && typeof row.settings === 'object'
      ? row.settings as Record<string, unknown>
      : {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export function mapDashboardPublishEvent(row: Record<string, unknown>): DashboardPublishEvent {
  return {
    id: String(row.id),
    dashboardId: String(row.dashboard_id),
    versionId: typeof row.version_id === 'string' ? row.version_id : null,
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : null,
    eventType: String(row.event_type ?? 'created') as DashboardPublishEvent['eventType'],
    notes: typeof row.notes === 'string' ? row.notes : null,
    metadata: row.metadata && typeof row.metadata === 'object'
      ? row.metadata as Record<string, unknown>
      : {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export function slugifyDashboardName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
