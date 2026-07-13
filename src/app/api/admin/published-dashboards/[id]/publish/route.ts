import { NextResponse } from 'next/server'
import { z } from 'zod'

import { evaluateGuidedPublishReadinessForProject } from '@/lib/dashboardos/guided-publish-readiness-server'
import { auditDashboardVersion, recordDashboardHealthRuns } from '@/lib/publishing/dashboard-health-auditor'
import { mapDashboardVersion, mapPublishedDashboard } from '@/lib/publishing/dashboard-publishing'
import { createDefaultDashboardEntitlement } from '@/lib/security/entitlements'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const PublishSchema = z.object({
  versionId: z.string().uuid(),
  notes: z.string().max(1000).optional().or(z.literal('')),
}).strict()

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
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

    const nowIso = new Date().toISOString()
    const [retireResult, versionResult, dashboardResult] = await Promise.all([
      auth.supabase
        .from('dashboard_versions')
        .update({ status: 'retired' })
        .eq('dashboard_id', dashboard.id)
        .eq('status', 'published')
        .neq('id', version.id),
      auth.supabase
        .from('dashboard_versions')
        .update({
          status: 'published',
          published_by: auth.userId,
          published_at: nowIso,
        })
        .eq('id', version.id)
        .select('*')
        .single(),
      auth.supabase
        .from('published_dashboards')
        .update({
          status: 'published',
          current_version_id: version.id,
          updated_by: auth.userId,
          published_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', dashboard.id)
        .select('*')
        .single(),
    ])

    if (retireResult.error) return NextResponse.json({ dashboard: null, version: null, error: retireResult.error.message }, { status: 400 })
    if (versionResult.error) return NextResponse.json({ dashboard: null, version: null, error: versionResult.error.message }, { status: 400 })
    if (dashboardResult.error) return NextResponse.json({ dashboard: null, version: null, error: dashboardResult.error.message }, { status: 400 })

    const publishedDashboard = mapPublishedDashboard(dashboardResult.data as Record<string, unknown>)
    const publishedVersion = mapDashboardVersion(versionResult.data as Record<string, unknown>)
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

    await Promise.all([
      createDefaultDashboardEntitlement({
        supabase: auth.supabase,
        tenantId: publishedDashboard.tenantId,
        projectId: publishedDashboard.projectId,
        dashboardId: publishedDashboard.id,
        createdBy: auth.userId,
      }),
      auth.supabase.from('dashboard_publish_events').insert({
        dashboard_id: publishedDashboard.id,
        version_id: publishedVersion.id,
        tenant_id: publishedDashboard.tenantId,
        project_id: publishedDashboard.projectId,
        actor_user_id: auth.userId,
        event_type: 'published',
        notes: parsed.data.notes?.trim() || null,
        metadata: {
          versionNumber: publishedVersion.versionNumber,
          readinessStatus: readiness.status,
          blockers: readiness.blockers.map(check => check.message),
          warnings: readiness.warnings.map(check => check.message),
          evaluatedAt: readiness.evaluatedAt,
          preflightStrategy: readinessPreflight.metadata.strategy,
        },
        created_at: nowIso,
      }),
      auth.supabase.from('audit_logs').insert({
        tenant_id: publishedDashboard.tenantId,
        project_id: publishedDashboard.projectId,
        actor_user_id: auth.userId,
        action: 'published_dashboard.published',
        target_type: 'published_dashboard',
        target_id: publishedDashboard.id,
        metadata: {
          versionId: publishedVersion.id,
          versionNumber: publishedVersion.versionNumber,
          readinessStatus: readiness.status,
          blockers: readiness.blockers.map(check => check.message),
          warnings: readiness.warnings.map(check => check.message),
          evaluatedAt: readiness.evaluatedAt,
          preflightStrategy: readinessPreflight.metadata.strategy,
        },
        created_at: nowIso,
      }),
      recordDashboardHealthRuns({
        supabase: auth.supabase,
        audit: publishedHealthAudit,
        checkedBy: auth.userId,
      }),
    ])

    return NextResponse.json({ dashboard: publishedDashboard, version: publishedVersion, healthAudit: publishedHealthAudit })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dashboard: null, version: null, error: message }, { status: 500 })
  }
}
