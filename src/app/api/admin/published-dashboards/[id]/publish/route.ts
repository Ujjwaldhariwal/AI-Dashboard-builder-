import { NextResponse } from 'next/server'
import { z } from 'zod'

import { evaluateGuidedPublishReadinessForProject } from '@/lib/dashboardos/guided-publish-readiness-server'
import { auditDashboardVersion, recordDashboardHealthRuns } from '@/lib/publishing/dashboard-health-auditor'
import { mapDashboardVersion, mapPublishedDashboard } from '@/lib/publishing/dashboard-publishing'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase, type AuthedSupabaseContext } from '@/lib/supabase/server'

const PublishSchema = z.object({
  versionId: z.string().uuid(),
  notes: z.string().max(1000).optional().or(z.literal('')),
}).strict()

type AuthProvider = () => Promise<AuthedSupabaseContext | null>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function createPublishedDashboardPublishPostHandler(authProvider: AuthProvider = getAuthedSupabase) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
  const { id } = await context.params

  try {
    const auth = await authProvider()
    if (!auth) return NextResponse.json({ dashboard: null, version: null, error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parsed = PublishSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ dashboard: null, version: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: dashboardRow, error: dashboardError } = await auth.supabase
      .from('published_dashboards')
      .select('*')
      .eq('id', id)
      .single()

    if (dashboardError || !dashboardRow) {
      return NextResponse.json({ dashboard: null, version: null, error: dashboardError?.message ?? 'Dashboard not found' }, { status: 404 })
    }

    const dashboard = mapPublishedDashboard(dashboardRow as Record<string, unknown>)
    if (dashboard.status === 'archived') {
      return NextResponse.json({ dashboard: null, version: null, error: 'Archived dashboards cannot be published' }, { status: 409 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: dashboard.tenantId,
      projectId: dashboard.projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ dashboard: null, version: null, error: access.error }, { status: access.status })
    }

    const { data: versionRow, error: versionError } = await auth.supabase
      .from('dashboard_versions')
      .select('*')
      .eq('id', parsed.data.versionId)
      .eq('dashboard_id', dashboard.id)
      .eq('tenant_id', dashboard.tenantId)
      .eq('project_id', dashboard.projectId)
      .single()

    if (versionError || !versionRow) {
      return NextResponse.json({ dashboard: null, version: null, error: versionError?.message ?? 'Version not found' }, { status: 404 })
    }

    const version = mapDashboardVersion(versionRow as Record<string, unknown>)
    if (version.status !== 'draft' || version.releaseSnapshotStatus !== 'pending') {
      return NextResponse.json({
        dashboard: null,
        version,
        error: 'Only an unsnapshotted draft version can be published. Use rollback for a prior immutable release.',
      }, { status: 409 })
    }

    const { count: pageCount, error: pageCountError } = await auth.supabase
      .from('dashboard_pages')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', version.id)

    if (pageCountError) return NextResponse.json({ dashboard: null, version: null, error: pageCountError.message }, { status: 500 })
    if ((pageCount ?? 0) === 0) {
      return NextResponse.json({ dashboard: null, version: null, error: 'Publish requires at least one dashboard page' }, { status: 422 })
    }

    const { count: slotCount, error: slotCountError } = await auth.supabase
      .from('dashboard_chart_slots')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', version.id)

    if (slotCountError) return NextResponse.json({ dashboard: null, version: null, error: slotCountError.message }, { status: 500 })
    if ((slotCount ?? 0) === 0) {
      return NextResponse.json({ dashboard: null, version: null, error: 'Publish requires at least one chart slot' }, { status: 422 })
    }

    const healthAudit = await auditDashboardVersion({
      supabase: auth.supabase,
      dashboard,
      version,
    })
    const candidateHealth = healthAudit.dashboards[0]

    const readinessPreflight = await evaluateGuidedPublishReadinessForProject({
      supabase: auth.supabase,
      projectId: dashboard.projectId,
      selectedDashboardId: dashboard.id,
      selectedVersionId: version.id,
    })
    const readiness = readinessPreflight.readiness

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
      return NextResponse.json({
        dashboard: null,
        version,
        healthAudit,
        readiness,
        metadata: readinessPreflight.metadata,
        error: readiness.summary,
      }, { status: 422 })
    }

    if (!candidateHealth || candidateHealth.healthState === 'blocked') {
      return NextResponse.json({
        dashboard: null,
        version,
        healthAudit,
        error: 'Publish blocked: fix missing or invalid dashboard charts before promotion',
      }, { status: 422 })
    }

    const transitionMetadata = {
      readinessStatus: readiness.status,
      blockers: readiness.blockers.map(check => check.message),
      warnings: readiness.warnings.map(check => check.message),
      evaluatedAt: readiness.evaluatedAt,
      preflightStrategy: readinessPreflight.metadata.strategy,
    }
    const { data: transitionData, error: transitionError } = await auth.supabase.rpc(
      'publish_dashboard_version_immutable',
      {
        p_dashboard_id: dashboard.id,
        p_version_id: version.id,
        p_tenant_id: dashboard.tenantId,
        p_project_id: dashboard.projectId,
        p_notes: parsed.data.notes?.trim() || '',
        p_metadata: transitionMetadata,
      },
    )

    if (transitionError) {
      return NextResponse.json({
        dashboard: null,
        version,
        healthAudit,
        readiness,
        error: `Immutable release creation failed: ${transitionError.message}`,
      }, { status: 409 })
    }

    const transition = asRecord(transitionData)
    const dashboardResult = asRecord(transition.dashboard)
    const versionResult = asRecord(transition.version)
    if (!dashboardResult.id || !versionResult.id) {
      return NextResponse.json({
        dashboard: null,
        version,
        healthAudit,
        readiness,
        error: 'Immutable release transaction returned an incomplete result',
      }, { status: 500 })
    }

    const publishedDashboard = mapPublishedDashboard(dashboardResult)
    const publishedVersion = mapDashboardVersion(versionResult)
    const publishedHealthAudit = {
      ...healthAudit,
      dashboards: healthAudit.dashboards.map(item => ({
        ...item,
        dashboard: {
          ...item.dashboard,
          status: publishedDashboard.status,
          publishedAt: publishedDashboard.publishedAt,
        },
        version: item.version
          ? {
            ...item.version,
            status: publishedVersion.status,
            publishedAt: publishedVersion.publishedAt,
          }
          : item.version,
      })),
    }

    const operationalWarnings: string[] = []
    try {
      await recordDashboardHealthRuns({
        supabase: auth.supabase,
        audit: publishedHealthAudit,
        checkedBy: auth.userId,
      })
    } catch (healthError) {
      operationalWarnings.push(`Release published, but health telemetry failed: ${healthError instanceof Error ? healthError.message : String(healthError)}`)
    }

    return NextResponse.json({
      dashboard: publishedDashboard,
      version: publishedVersion,
      healthAudit: publishedHealthAudit,
      release: {
        immutable: true,
        datasetSnapshotCount: Number(transition.releaseDatasetSnapshotCount ?? 0),
        chartSnapshotCount: Number(transition.releaseChartSnapshotCount ?? 0),
      },
      operationalWarnings,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dashboard: null, version: null, error: message }, { status: 500 })
  }
}
}

export const POST = createPublishedDashboardPublishPostHandler()
