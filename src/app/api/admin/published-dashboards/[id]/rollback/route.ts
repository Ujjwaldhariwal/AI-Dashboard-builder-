import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auditDashboardVersion, recordDashboardHealthRuns } from '@/lib/publishing/dashboard-health-auditor'
import { mapDashboardVersion, mapPublishedDashboard } from '@/lib/publishing/dashboard-publishing'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const RollbackSchema = z.object({
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
    const parsed = RollbackSchema.safeParse(body)
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
      return NextResponse.json({ dashboard: null, version: null, error: 'Archived dashboards cannot be rolled back' }, { status: 409 })
    }
    if (!dashboard.currentVersionId) {
      return NextResponse.json({ dashboard: null, version: null, error: 'Rollback requires an active published version' }, { status: 409 })
    }
    if (dashboard.currentVersionId === parsed.data.versionId) {
      return NextResponse.json({ dashboard, version: null, error: 'Selected version is already current' }, { status: 409 })
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
    if (version.status === 'draft') {
      return NextResponse.json({ dashboard: null, version, error: 'Draft versions must be published through the publish endpoint' }, { status: 409 })
    }

    const healthAudit = await auditDashboardVersion({
      supabase: auth.supabase,
      dashboard,
      version,
    })
    const candidateHealth = healthAudit.dashboards[0]
    if (!candidateHealth || candidateHealth.healthState === 'blocked') {
      return NextResponse.json({
        dashboard: null,
        version,
        healthAudit,
        error: 'Rollback blocked: fix missing or invalid dashboard charts before promotion',
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

    const rolledBackDashboard = mapPublishedDashboard(dashboardResult.data as Record<string, unknown>)
    const rolledBackVersion = mapDashboardVersion(versionResult.data as Record<string, unknown>)
    const rollbackHealthAudit = {
      ...healthAudit,
      dashboards: healthAudit.dashboards.map(item => ({
        ...item,
        dashboard: {
          ...item.dashboard,
          status: rolledBackDashboard.status,
          publishedAt: rolledBackDashboard.publishedAt,
        },
        version: item.version
          ? {
            ...item.version,
            status: rolledBackVersion.status,
            publishedAt: rolledBackVersion.publishedAt,
          }
          : item.version,
      })),
    }

    await Promise.all([
      auth.supabase.from('dashboard_publish_events').insert({
        dashboard_id: rolledBackDashboard.id,
        version_id: rolledBackVersion.id,
        tenant_id: rolledBackDashboard.tenantId,
        project_id: rolledBackDashboard.projectId,
        actor_user_id: auth.userId,
        event_type: 'rolled_back',
        notes: parsed.data.notes?.trim() || null,
        metadata: {
          versionNumber: rolledBackVersion.versionNumber,
          previousVersionId: dashboard.currentVersionId,
        },
        created_at: nowIso,
      }),
      auth.supabase.from('audit_logs').insert({
        tenant_id: rolledBackDashboard.tenantId,
        project_id: rolledBackDashboard.projectId,
        actor_user_id: auth.userId,
        action: 'published_dashboard.rolled_back',
        target_type: 'published_dashboard',
        target_id: rolledBackDashboard.id,
        metadata: {
          versionId: rolledBackVersion.id,
          versionNumber: rolledBackVersion.versionNumber,
          previousVersionId: dashboard.currentVersionId,
        },
        created_at: nowIso,
      }),
      recordDashboardHealthRuns({
        supabase: auth.supabase,
        audit: rollbackHealthAudit,
        checkedBy: auth.userId,
      }),
    ])

    return NextResponse.json({ dashboard: rolledBackDashboard, version: rolledBackVersion, healthAudit: rollbackHealthAudit })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dashboard: null, version: null, error: message }, { status: 500 })
  }
}
