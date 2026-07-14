import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auditDashboardVersion, recordDashboardHealthRuns } from '@/lib/publishing/dashboard-health-auditor'
import { mapDashboardVersion, mapPublishedDashboard } from '@/lib/publishing/dashboard-publishing'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase, type AuthedSupabaseContext } from '@/lib/supabase/server'

const RollbackSchema = z.object({
  versionId: z.string().uuid(),
  notes: z.string().max(1000).optional().or(z.literal('')),
}).strict()

type AuthProvider = () => Promise<AuthedSupabaseContext | null>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function createPublishedDashboardRollbackPostHandler(authProvider: AuthProvider = getAuthedSupabase) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const { id } = await context.params

    try {
      const auth = await authProvider()
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
        return NextResponse.json({ dashboard: null, version: null, error: 'Rollback requires an active published release' }, { status: 409 })
      }
      if (dashboard.currentVersionId === parsed.data.versionId) {
        return NextResponse.json({ dashboard, version: null, error: 'Selected release is already current' }, { status: 409 })
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
      if (version.status === 'draft' || version.releaseSnapshotStatus === 'pending') {
        return NextResponse.json({
          dashboard: null,
          version,
          error: 'Rollback requires a previously captured immutable release. Draft or unsnapshotted versions must be published first.',
        }, { status: 409 })
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
          error: 'Rollback blocked: the captured release snapshot is incomplete or invalid',
        }, { status: 422 })
      }

      const { data: transitionData, error: transitionError } = await auth.supabase.rpc(
        'rollback_dashboard_release_immutable',
        {
          p_dashboard_id: dashboard.id,
          p_version_id: version.id,
          p_tenant_id: dashboard.tenantId,
          p_project_id: dashboard.projectId,
          p_notes: parsed.data.notes?.trim() || '',
          p_metadata: { previousVersionId: dashboard.currentVersionId },
        },
      )
      if (transitionError) {
        return NextResponse.json({
          dashboard: null,
          version,
          healthAudit,
          error: `Immutable release rollback failed: ${transitionError.message}`,
        }, { status: 409 })
      }

      const transition = asRecord(transitionData)
      const dashboardResult = asRecord(transition.dashboard)
      const versionResult = asRecord(transition.version)
      if (!dashboardResult.id || !versionResult.id) {
        return NextResponse.json({ dashboard: null, version, healthAudit, error: 'Rollback transaction returned an incomplete result' }, { status: 500 })
      }

      const rolledBackDashboard = mapPublishedDashboard(dashboardResult)
      const rolledBackVersion = mapDashboardVersion(versionResult)
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

      const operationalWarnings: string[] = []
      try {
        await recordDashboardHealthRuns({
          supabase: auth.supabase,
          audit: rollbackHealthAudit,
          checkedBy: auth.userId,
        })
      } catch (healthError) {
        operationalWarnings.push(`Rollback completed, but health telemetry failed: ${healthError instanceof Error ? healthError.message : String(healthError)}`)
      }

      return NextResponse.json({
        dashboard: rolledBackDashboard,
        version: rolledBackVersion,
        healthAudit: rollbackHealthAudit,
        release: {
          immutable: true,
          snapshotStatus: rolledBackVersion.releaseSnapshotStatus,
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

export const POST = createPublishedDashboardRollbackPostHandler()
