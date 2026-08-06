import type { SupabaseClient } from '@supabase/supabase-js'

import {
  evaluateGuidedPublishReadinessForProject,
  type GuidedPublishPreflightMetadata,
  type GuidedPublishSemanticAuthority,
} from '@/lib/dashboardos/guided-publish-readiness-server'
import { createDefaultDashboardEntitlement } from '@/lib/security/entitlements'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { auditDashboardVersion, recordDashboardHealthRuns } from '@/lib/publishing/dashboard-health-auditor'
import { mapDashboardVersion, mapPublishedDashboard } from '@/lib/publishing/dashboard-publishing'
import type { AuthedSupabaseContext } from '@/lib/supabase/server'
import type {
  DashboardHealthAudit,
  DashboardVersion,
  PublishedDashboard,
} from '@/types/dashboard-publishing'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export class GovernedDashboardPublishError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor({
    message,
    status,
    code,
    details = {},
  }: {
    message: string
    status: number
    code: string
    details?: Record<string, unknown>
  }) {
    super(message)
    this.name = 'GovernedDashboardPublishError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export interface DashboardReleaseVerification {
  activePointerVerified: boolean
  immutableSnapshotVerified: boolean
  clientLoadable: boolean
  pageCount: number
  slotCount: number
  chartSnapshotCount: number
  datasetSnapshotCount: number
  healthState: 'healthy' | 'stale' | 'blocked'
  verifiedAt: string
}

export interface GovernedDashboardPublishResult {
  dashboard: PublishedDashboard
  version: DashboardVersion
  healthAudit: DashboardHealthAudit
  readiness: Awaited<ReturnType<typeof evaluateGuidedPublishReadinessForProject>>['readiness']
  metadata: GuidedPublishPreflightMetadata
  release: {
    immutable: true
    datasetSnapshotCount: number
    chartSnapshotCount: number
  }
  verification: DashboardReleaseVerification
  operationalWarnings: string[]
  reusedExistingRelease: boolean
}

async function loadOwnedDashboard(
  auth: AuthedSupabaseContext,
  dashboardId: string,
) {
  const { data, error } = await auth.supabase
    .from('published_dashboards')
    .select('*')
    .eq('id', dashboardId)
    .single()

  if (error || !data) {
    throw new GovernedDashboardPublishError({
      message: error?.message ?? 'Dashboard not found',
      status: 404,
      code: 'dashboard_not_found',
    })
  }

  const dashboard = mapPublishedDashboard(data as Record<string, unknown>)
  if (dashboard.status === 'archived') {
    throw new GovernedDashboardPublishError({
      message: 'Archived dashboards cannot be published',
      status: 409,
      code: 'dashboard_archived',
    })
  }

  const access = await requireProjectAccess({
    ...accessContext(auth),
    tenantId: dashboard.tenantId,
    projectId: dashboard.projectId,
    editor: true,
  })
  if (!access.ok) {
    throw new GovernedDashboardPublishError({
      message: access.error,
      status: access.status,
      code: 'project_access_required',
    })
  }

  return dashboard
}

async function loadDashboardVersion({
  supabase,
  dashboard,
  versionId,
}: {
  supabase: SupabaseClient
  dashboard: PublishedDashboard
  versionId: string
}) {
  const { data, error } = await supabase
    .from('dashboard_versions')
    .select('*')
    .eq('id', versionId)
    .eq('dashboard_id', dashboard.id)
    .eq('tenant_id', dashboard.tenantId)
    .eq('project_id', dashboard.projectId)
    .single()

  if (error || !data) {
    throw new GovernedDashboardPublishError({
      message: error?.message ?? 'Version not found',
      status: 404,
      code: 'dashboard_version_not_found',
    })
  }

  return mapDashboardVersion(data as Record<string, unknown>)
}

async function releaseCounts({
  supabase,
  dashboard,
  version,
}: {
  supabase: SupabaseClient
  dashboard: PublishedDashboard
  version: DashboardVersion
}) {
  const [
    pagesResult,
    slotsResult,
    chartSnapshotsResult,
    datasetSnapshotsResult,
  ] = await Promise.all([
    supabase
      .from('dashboard_pages')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', version.id)
      .eq('dashboard_id', dashboard.id),
    supabase
      .from('dashboard_chart_slots')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', version.id)
      .eq('dashboard_id', dashboard.id),
    supabase
      .from('dashboard_release_chart_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', version.id)
      .eq('dashboard_id', dashboard.id),
    supabase
      .from('dashboard_release_dataset_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', version.id)
      .eq('dashboard_id', dashboard.id),
  ])
  const error = pagesResult.error
    ?? slotsResult.error
    ?? chartSnapshotsResult.error
    ?? datasetSnapshotsResult.error
  if (error) throw new Error(error.message)
  return {
    pageCount: pagesResult.count ?? 0,
    slotCount: slotsResult.count ?? 0,
    chartSnapshotCount: chartSnapshotsResult.count ?? 0,
    datasetSnapshotCount: datasetSnapshotsResult.count ?? 0,
  }
}

async function verifyPublishedRelease({
  auth,
  dashboard,
  version,
}: {
  auth: AuthedSupabaseContext
  dashboard: PublishedDashboard
  version: DashboardVersion
}) {
  const counts = await releaseCounts({
    supabase: auth.supabase,
    dashboard,
    version,
  })
  const healthAudit = await auditDashboardVersion({
    supabase: auth.supabase,
    dashboard,
    version,
  })
  const healthState = healthAudit.dashboards[0]?.healthState ?? 'blocked'
  const activePointerVerified = dashboard.status === 'published'
    && dashboard.currentVersionId === version.id
    && version.status === 'published'
  const immutableSnapshotVerified = version.releaseSnapshotStatus !== 'pending'
    && counts.pageCount > 0
    && counts.slotCount > 0
    && counts.chartSnapshotCount === counts.slotCount
    && counts.datasetSnapshotCount > 0

  return {
    healthAudit,
    verification: {
      ...counts,
      activePointerVerified,
      immutableSnapshotVerified,
      clientLoadable: activePointerVerified
        && immutableSnapshotVerified
        && healthState !== 'blocked',
      healthState,
      verifiedAt: new Date().toISOString(),
    } satisfies DashboardReleaseVerification,
  }
}

function publishedHealthAudit({
  healthAudit,
  dashboard,
  version,
}: {
  healthAudit: DashboardHealthAudit
  dashboard: PublishedDashboard
  version: DashboardVersion
}): DashboardHealthAudit {
  return {
    ...healthAudit,
    dashboards: healthAudit.dashboards.map(item => ({
      ...item,
      dashboard: {
        ...item.dashboard,
        status: dashboard.status,
        publishedAt: dashboard.publishedAt,
      },
      version: item.version
        ? {
          ...item.version,
          status: version.status,
          publishedAt: version.publishedAt,
        }
        : item.version,
    })),
  }
}

export async function publishDashboardVersionGoverned({
  auth,
  dashboardId,
  versionId,
  readinessAuthority = 'guided_profile',
  notes = '',
  metadata = {},
}: {
  auth: AuthedSupabaseContext
  dashboardId: string
  versionId: string
  readinessAuthority?: GuidedPublishSemanticAuthority
  notes?: string
  metadata?: Record<string, unknown>
}): Promise<GovernedDashboardPublishResult> {
  const dashboard = await loadOwnedDashboard(auth, dashboardId)
  const version = await loadDashboardVersion({
    supabase: auth.supabase,
    dashboard,
    versionId,
  })

  const readinessPreflight = await evaluateGuidedPublishReadinessForProject({
    supabase: auth.supabase,
    projectId: dashboard.projectId,
    selectedDashboardId: dashboard.id,
    selectedVersionId: version.id,
    semanticAuthority: readinessAuthority,
  })
  const readiness = readinessPreflight.readiness

  if (
    dashboard.status === 'published'
    && dashboard.currentVersionId === version.id
    && version.status === 'published'
    && version.releaseSnapshotStatus !== 'pending'
  ) {
    const verified = await verifyPublishedRelease({ auth, dashboard, version })
    if (!verified.verification.clientLoadable) {
      throw new GovernedDashboardPublishError({
        message: 'The existing immutable release is incomplete or blocked at runtime.',
        status: 409,
        code: 'existing_release_verification_failed',
        details: { verification: verified.verification },
      })
    }
    return {
      dashboard,
      version,
      readiness,
      metadata: readinessPreflight.metadata,
      healthAudit: verified.healthAudit,
      release: {
        immutable: true,
        datasetSnapshotCount: verified.verification.datasetSnapshotCount,
        chartSnapshotCount: verified.verification.chartSnapshotCount,
      },
      verification: verified.verification,
      operationalWarnings: [],
      reusedExistingRelease: true,
    }
  }

  if (version.status !== 'draft' || version.releaseSnapshotStatus !== 'pending') {
    throw new GovernedDashboardPublishError({
      message: 'Only an unsnapshotted draft version can be published. Use rollback for a prior immutable release.',
      status: 409,
      code: 'dashboard_version_not_publishable',
      details: { version },
    })
  }

  const counts = await releaseCounts({
    supabase: auth.supabase,
    dashboard,
    version,
  })
  if (counts.pageCount === 0) {
    throw new GovernedDashboardPublishError({
      message: 'Publish requires at least one dashboard page',
      status: 422,
      code: 'dashboard_page_required',
    })
  }
  if (counts.slotCount === 0) {
    throw new GovernedDashboardPublishError({
      message: 'Publish requires at least one chart slot',
      status: 422,
      code: 'dashboard_chart_slot_required',
    })
  }

  const healthAudit = await auditDashboardVersion({
    supabase: auth.supabase,
    dashboard,
    version,
  })
  const candidateHealth = healthAudit.dashboards[0]

  if (!readiness.publishEligible) {
    await auth.supabase.from('audit_logs').insert({
      tenant_id: dashboard.tenantId,
      project_id: dashboard.projectId,
      actor_user_id: auth.userId,
      action: 'published_dashboard.publish_blocked',
      target_type: 'published_dashboard',
      target_id: dashboard.id,
      metadata: {
        versionId: version.id,
        readinessStatus: readiness.status,
        blockers: readiness.blockers.map(check => check.message),
        warnings: readiness.warnings.map(check => check.message),
        evaluatedAt: readiness.evaluatedAt,
        preflightStrategy: readinessPreflight.metadata.strategy,
      },
      created_at: readiness.evaluatedAt,
    })
    throw new GovernedDashboardPublishError({
      message: readiness.summary,
      status: 422,
      code: 'guided_publish_readiness_blocked',
      details: {
        version,
        healthAudit,
        readiness,
        metadata: readinessPreflight.metadata,
      },
    })
  }

  if (!candidateHealth || candidateHealth.healthState === 'blocked') {
    throw new GovernedDashboardPublishError({
      message: 'Publish blocked: fix missing or invalid dashboard charts before promotion',
      status: 422,
      code: 'dashboard_health_blocked',
      details: { version, healthAudit, readiness },
    })
  }

  const transitionMetadata = {
    ...metadata,
    readinessStatus: readiness.status,
    blockers: readiness.blockers.map(check => check.message),
    warnings: readiness.warnings.map(check => check.message),
    evaluatedAt: readiness.evaluatedAt,
    preflightStrategy: readinessPreflight.metadata.strategy,
  }
  const { data, error } = await auth.supabase.rpc(
    'publish_dashboard_version_immutable',
    {
      p_dashboard_id: dashboard.id,
      p_version_id: version.id,
      p_tenant_id: dashboard.tenantId,
      p_project_id: dashboard.projectId,
      p_notes: notes.trim(),
      p_metadata: transitionMetadata,
    },
  )
  if (error) {
    throw new GovernedDashboardPublishError({
      message: `Immutable release creation failed: ${error.message}`,
      status: 409,
      code: 'immutable_release_creation_failed',
      details: { version, healthAudit, readiness },
    })
  }

  const transition = asRecord(data)
  const dashboardResult = asRecord(transition.dashboard)
  const versionResult = asRecord(transition.version)
  if (!dashboardResult.id || !versionResult.id) {
    throw new GovernedDashboardPublishError({
      message: 'Immutable release transaction returned an incomplete result',
      status: 500,
      code: 'immutable_release_result_incomplete',
    })
  }

  const publishedDashboard = mapPublishedDashboard(dashboardResult)
  const publishedVersion = mapDashboardVersion(versionResult)
  await createDefaultDashboardEntitlement({
    supabase: auth.supabase,
    tenantId: publishedDashboard.tenantId,
    projectId: publishedDashboard.projectId,
    dashboardId: publishedDashboard.id,
    createdBy: auth.userId,
  })

  const operationalWarnings: string[] = []
  try {
    await recordDashboardHealthRuns({
      supabase: auth.supabase,
      audit: publishedHealthAudit({
        healthAudit,
        dashboard: publishedDashboard,
        version: publishedVersion,
      }),
      checkedBy: auth.userId,
    })
  } catch (healthError) {
    operationalWarnings.push(
      `Release published, but pre-release health telemetry failed: ${
        healthError instanceof Error ? healthError.message : String(healthError)
      }`,
    )
  }

  const verified = await verifyPublishedRelease({
    auth,
    dashboard: publishedDashboard,
    version: publishedVersion,
  })
  if (!verified.verification.clientLoadable) {
    throw new GovernedDashboardPublishError({
      message: 'The immutable release was created but failed release verification.',
      status: 409,
      code: 'release_verification_failed',
      details: { verification: verified.verification },
    })
  }

  try {
    await recordDashboardHealthRuns({
      supabase: auth.supabase,
      audit: verified.healthAudit,
      checkedBy: auth.userId,
    })
  } catch (healthError) {
    operationalWarnings.push(
      `Release verified, but post-release health telemetry failed: ${
        healthError instanceof Error ? healthError.message : String(healthError)
      }`,
    )
  }

  return {
    dashboard: publishedDashboard,
    version: publishedVersion,
    healthAudit: verified.healthAudit,
    readiness,
    metadata: readinessPreflight.metadata,
    release: {
      immutable: true,
      datasetSnapshotCount: Number(
        transition.releaseDatasetSnapshotCount
        ?? verified.verification.datasetSnapshotCount,
      ),
      chartSnapshotCount: Number(
        transition.releaseChartSnapshotCount
        ?? verified.verification.chartSnapshotCount,
      ),
    },
    verification: verified.verification,
    operationalWarnings,
    reusedExistingRelease: false,
  }
}
