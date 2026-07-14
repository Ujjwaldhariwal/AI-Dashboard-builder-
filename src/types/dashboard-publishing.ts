export type PublishedDashboardStatus = 'draft' | 'published' | 'archived'

export type DashboardVersionStatus = 'draft' | 'published' | 'retired'

export type DashboardReleaseSnapshotStatus = 'pending' | 'complete' | 'legacy_backfill'

export type DashboardPublishEventType =
  | 'created'
  | 'version_created'
  | 'published'
  | 'rolled_back'
  | 'archived'

export interface PublishedDashboard {
  id: string
  tenantId: string
  projectId: string
  name: string
  slug: string
  description?: string | null
  status: PublishedDashboardStatus
  currentVersionId?: string | null
  createdBy?: string | null
  updatedBy?: string | null
  publishedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface DashboardVersion {
  id: string
  dashboardId: string
  tenantId: string
  projectId: string
  versionNumber: number
  status: DashboardVersionStatus
  title: string
  notes?: string | null
  layout: Record<string, unknown>
  createdBy?: string | null
  publishedBy?: string | null
  publishedAt?: string | null
  releaseSnapshotStatus: DashboardReleaseSnapshotStatus
  releaseSnapshotCreatedAt?: string | null
  createdAt: string
}

export interface DashboardPage {
  id: string
  versionId: string
  dashboardId: string
  tenantId: string
  projectId: string
  title: string
  slug: string
  sortOrder: number
  layout: Record<string, unknown>
  createdAt: string
}

export interface DashboardChartSlot {
  id: string
  pageId: string
  versionId: string
  dashboardId: string
  tenantId: string
  projectId: string
  chartConfigId: string
  title?: string | null
  slotKey: string
  rowIndex: number
  columnIndex: number
  width: number
  height: number
  settings: Record<string, unknown>
  createdAt: string
}

export interface DashboardPublishEvent {
  id: string
  dashboardId: string
  versionId?: string | null
  tenantId: string
  projectId: string
  actorUserId?: string | null
  eventType: DashboardPublishEventType
  notes?: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface PublishedDashboardBundle {
  dashboard: PublishedDashboard
  version: DashboardVersion
  pages: DashboardPage[]
  slots: DashboardChartSlot[]
}

export type DashboardHealthState = 'healthy' | 'stale' | 'blocked'

export interface DashboardHealthAuditItem {
  slot: {
    id: string
    pageId: string
    chartConfigId: string
    slotKey: string
    title?: string | null
  }
  chart: {
    id: string
    name: string
    status: string
    templateId: string
    validationState: string
  }
  healthState: DashboardHealthState
  issues: Array<{
    severity: 'error' | 'warning'
    code: string
    message: string
  }>
}

export interface DashboardHealthAuditDashboard {
  dashboard: {
    id: string
    name: string
    slug: string
    status: PublishedDashboardStatus
    publishedAt?: string | null
  }
  version: {
    id: string
    versionNumber: number
    title: string
    status: DashboardVersionStatus
    publishedAt?: string | null
  } | null
  summary: {
    totalSlots: number
    healthySlots: number
    staleSlots: number
    blockedSlots: number
    pageCount: number
  }
  healthState: DashboardHealthState
  items: DashboardHealthAuditItem[]
}

export interface DashboardHealthAudit {
  checkedAt: string
  summary: {
    total: number
    healthy: number
    stale: number
    blocked: number
  }
  dashboards: DashboardHealthAuditDashboard[]
}
