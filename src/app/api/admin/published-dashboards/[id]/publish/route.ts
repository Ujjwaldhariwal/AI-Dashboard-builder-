import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auditDashboardVersion, recordDashboardHealthRuns } from '@/lib/publishing/dashboard-health-auditor'
import { buildGuidedPublishReadiness } from '@/lib/dashboardos/guided-review'
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

    const readinessEvaluatedAt = new Date().toISOString()
    const [pagesResult, slotsResult] = await Promise.all([
      auth.supabase
        .from('dashboard_pages')
        .select('*')
        .eq('version_id', version.id)
        .eq('dashboard_id', dashboard.id)
        .eq('tenant_id', dashboard.tenantId)
        .eq('project_id', dashboard.projectId),
      auth.supabase
        .from('dashboard_chart_slots')
        .select('*')
        .eq('version_id', version.id)
        .eq('dashboard_id', dashboard.id)
        .eq('tenant_id', dashboard.tenantId)
        .eq('project_id', dashboard.projectId),
    ])
    if (pagesResult.error) return NextResponse.json({ dashboard: null, version, error: pagesResult.error.message }, { status: 500 })
    if (slotsResult.error) return NextResponse.json({ dashboard: null, version, error: slotsResult.error.message }, { status: 500 })

    const slotRows = (slotsResult.data ?? []) as Record<string, unknown>[]
    const chartIds = [...new Set(slotRows.map(slot => String(slot.chart_config_id)).filter(Boolean))]
    const chartsResult = chartIds.length > 0
      ? await auth.supabase
        .from('dashboard_chart_configs')
        .select('id, dataset_id, status, validation_state, encoding, template_id')
        .eq('tenant_id', dashboard.tenantId)
        .eq('project_id', dashboard.projectId)
        .in('id', chartIds)
      : { data: [], error: null }
    if (chartsResult.error) return NextResponse.json({ dashboard: null, version, error: chartsResult.error.message }, { status: 500 })

    const chartRows = (chartsResult.data ?? []) as Record<string, unknown>[]
    const datasetIds = [...new Set(chartRows.map(chart => String(chart.dataset_id)).filter(Boolean))]
    const [datasetsResult, modelsResult, profileResult, tenantResult] = await Promise.all([
      datasetIds.length > 0
        ? auth.supabase
          .from('semantic_datasets')
          .select('id, model_id, status, selection, description')
          .eq('tenant_id', dashboard.tenantId)
          .eq('project_id', dashboard.projectId)
          .in('id', datasetIds)
        : Promise.resolve({ data: [], error: null }),
      auth.supabase
        .from('business_models')
        .select('id, status, version')
        .eq('tenant_id', dashboard.tenantId)
        .eq('project_id', dashboard.projectId),
      auth.supabase
        .from('guided_schema_profiles')
        .select('state')
        .eq('tenant_id', dashboard.tenantId)
        .eq('project_id', dashboard.projectId)
        .order('updated_at', { ascending: false })
        .limit(1),
      auth.supabase
        .from('tenants')
        .select('slug')
        .eq('id', dashboard.tenantId)
        .single(),
    ])
    if (datasetsResult.error) return NextResponse.json({ dashboard: null, version, error: datasetsResult.error.message }, { status: 500 })
    if (modelsResult.error) return NextResponse.json({ dashboard: null, version, error: modelsResult.error.message }, { status: 500 })
    if (profileResult.error) return NextResponse.json({ dashboard: null, version, error: profileResult.error.message }, { status: 500 })
    if (tenantResult.error) return NextResponse.json({ dashboard: null, version, error: tenantResult.error.message }, { status: 500 })

    const profileState = (profileResult.data?.[0]?.state && typeof profileResult.data[0].state === 'object')
      ? profileResult.data[0].state as Parameters<typeof buildGuidedPublishReadiness>[0]['profileState']
      : null
    const readiness = buildGuidedPublishReadiness({
      evaluatedAt: readinessEvaluatedAt,
      profileState,
      models: (modelsResult.data ?? []).map(row => ({
        id: String(row.id),
        status: typeof row.status === 'string' ? row.status : null,
        version: typeof row.version === 'number' ? row.version : Number(row.version ?? 0),
      })),
      activeSemanticModelId: profileState?.semanticAsset?.modelId ?? null,
      datasets: ((datasetsResult.data ?? []) as Record<string, unknown>[]).map(row => {
        const selection = row.selection && typeof row.selection === 'object'
          ? row.selection as { fieldIds?: string[]; metricIds?: string[]; relationshipIds?: string[] }
          : {}
        return {
          id: String(row.id),
          modelId: String(row.model_id),
          status: String(row.status ?? 'draft') as 'draft' | 'published' | 'archived',
          description: typeof row.description === 'string' ? row.description : null,
          selection: {
            fieldIds: Array.isArray(selection.fieldIds) ? selection.fieldIds : [],
            metricIds: Array.isArray(selection.metricIds) ? selection.metricIds : [],
            relationshipIds: Array.isArray(selection.relationshipIds) ? selection.relationshipIds : [],
          },
        }
      }),
      charts: chartRows.map(row => ({
        id: String(row.id),
        datasetId: String(row.dataset_id),
        status: String(row.status ?? 'draft') as 'draft' | 'published' | 'archived',
        validationState: String(row.validation_state ?? 'unknown') as 'unknown' | 'valid' | 'warning' | 'invalid',
        templateId: String(row.template_id) as never,
        encoding: row.encoding && typeof row.encoding === 'object'
          ? row.encoding as never
          : { yMetricIds: [], tooltipFieldIds: [], labelById: {}, colorById: {} },
      })),
      dashboards: [dashboard],
      versions: [version],
      pages: ((pagesResult.data ?? []) as Record<string, unknown>[]).map(row => ({
        id: String(row.id),
        versionId: String(row.version_id),
        slug: String(row.slug ?? ''),
      })),
      slots: slotRows.map(row => ({
        id: String(row.id),
        versionId: String(row.version_id),
        chartConfigId: String(row.chart_config_id),
      })),
      selectedDashboardId: dashboard.id,
      selectedVersionId: version.id,
      clientUrl: typeof tenantResult.data?.slug === 'string' ? `/client/${tenantResult.data.slug}` : null,
    })

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
        },
        created_at: readinessEvaluatedAt,
      })
      return NextResponse.json({
        dashboard: null,
        version,
        healthAudit,
        readiness,
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
