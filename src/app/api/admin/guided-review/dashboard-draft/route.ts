import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import {
  buildGuidedChartRecommendations,
  buildGuidedDashboardDraftPlan,
  buildGuidedDraftLineage,
  guidedLineageLabel,
} from '@/lib/dashboardos/guided-review'
import { mapDashboardChartSlot, mapDashboardPage, mapDashboardVersion, mapPublishedDashboard, slugifyDashboardName } from '@/lib/publishing/dashboard-publishing'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { analyzeDatasetChartOptions } from '@/lib/semantic/dataset-shape-analyzer'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { ChartTemplateId } from '@/types/chart-template'
import type { DashboardChartConfig, DashboardChartEncoding } from '@/types/dashboard-chart'

const DashboardDraftSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  datasetId: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
}).strict()

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function mapChart(row: Record<string, unknown>): DashboardChartConfig {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    datasetId: String(row.dataset_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as DashboardChartConfig['status'],
    templateId: String(row.template_id) as DashboardChartConfig['templateId'],
    encoding: row.encoding && typeof row.encoding === 'object'
      ? row.encoding as DashboardChartEncoding
      : { yMetricIds: [], tooltipFieldIds: [], labelById: {}, colorById: {} },
    presentation: row.presentation && typeof row.presentation === 'object'
      ? row.presentation as DashboardChartConfig['presentation']
      : { size: 'standard', showLegend: true, showLabels: false, valueFormat: null },
    interactions: row.interactions && typeof row.interactions === 'object'
      ? row.interactions as DashboardChartConfig['interactions']
      : {},
    layout: row.layout && typeof row.layout === 'object'
      ? row.layout as DashboardChartConfig['layout']
      : { order: 0, gridSpan: 1 },
    validationState: String(row.validation_state ?? 'unknown') as DashboardChartConfig['validationState'],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
  }
}

async function nextVersionNumber(supabase: SupabaseClient, dashboardId: string) {
  const { data, error } = await supabase
    .from('dashboard_versions')
    .select('version_number')
    .eq('dashboard_id', dashboardId)
    .order('version_number', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  return Number(data?.[0]?.version_number ?? 0) + 1
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ dashboard: null, version: null, charts: [], error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = DashboardDraftSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ dashboard: null, version: null, charts: [], error: parsed.error.flatten() }, { status: 400 })

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      editor: true,
    })
    if (!access.ok) return NextResponse.json({ dashboard: null, version: null, charts: [], error: access.error }, { status: access.status })

    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('id, tenant_id, project_id, model_id, name, description, selection')
      .eq('id', parsed.data.datasetId)
      .eq('tenant_id', parsed.data.tenantId)
      .eq('project_id', parsed.data.projectId)
      .single()

    if (datasetError || !datasetRow) {
      return NextResponse.json({ dashboard: null, version: null, charts: [], error: datasetError?.message ?? 'Dataset not found' }, { status: 404 })
    }

    const dataset = datasetRow as Record<string, unknown>
    const selection = dataset.selection && typeof dataset.selection === 'object' ? dataset.selection as Record<string, unknown> : {}
    const fieldIds = toStringArray(selection.fieldIds)
    const metricIds = toStringArray(selection.metricIds)
    const [fieldsResult, metricsResult, modelResult, profileResult] = await Promise.all([
      fieldIds.length > 0
        ? auth.supabase.from('business_fields').select('*').in('id', fieldIds)
        : Promise.resolve({ data: [], error: null }),
      metricIds.length > 0
        ? auth.supabase.from('business_metrics').select('*').in('id', metricIds)
        : Promise.resolve({ data: [], error: null }),
      auth.supabase
        .from('business_models')
        .select('id, version')
        .eq('id', String(dataset.model_id ?? ''))
        .maybeSingle(),
      auth.supabase
        .from('guided_schema_profiles')
        .select('id, schema_hash, state, updated_at')
        .eq('tenant_id', parsed.data.tenantId)
        .eq('project_id', parsed.data.projectId)
        .order('updated_at', { ascending: false })
        .limit(1),
    ])

    if (fieldsResult.error) return NextResponse.json({ dashboard: null, version: null, charts: [], error: fieldsResult.error.message }, { status: 500 })
    if (metricsResult.error) return NextResponse.json({ dashboard: null, version: null, charts: [], error: metricsResult.error.message }, { status: 500 })
    if (modelResult.error) return NextResponse.json({ dashboard: null, version: null, charts: [], error: modelResult.error.message }, { status: 500 })

    const fields = (fieldsResult.data ?? []) as Record<string, unknown>[]
    const metrics = (metricsResult.data ?? []) as Record<string, unknown>[]
    const shapeOptions = analyzeDatasetChartOptions({ fields, metrics })
    const simpleFields = fields.map(field => ({ id: String(field.id), name: String(field.name ?? ''), role: String(field.role ?? '') }))
    const simpleMetrics = metrics.map(metric => ({ id: String(metric.id), name: String(metric.name ?? '') }))
    const recommendations = buildGuidedChartRecommendations({
      shape: shapeOptions.shape,
      compatibility: shapeOptions.compatibility,
      fields: simpleFields,
      metrics: simpleMetrics,
    })
    const nowIso = new Date().toISOString()
    const latestProfile = profileResult.data?.[0] as Record<string, unknown> | undefined
    const profileState = latestProfile?.state && typeof latestProfile.state === 'object'
      ? latestProfile.state as { semanticDraftVersion?: number; semanticAsset?: Parameters<typeof buildGuidedDraftLineage>[0]['semanticAsset'] }
      : null
    const modelVersion = Number((modelResult.data as Record<string, unknown> | null | undefined)?.version ?? 1)
    const lineage = buildGuidedDraftLineage({
      generatedAt: nowIso,
      profileId: latestProfile ? String(latestProfile.id) : null,
      schemaHash: typeof latestProfile?.schema_hash === 'string' ? latestProfile.schema_hash : null,
      semanticDraftVersion: profileState?.semanticDraftVersion ?? 1,
      semanticAsset: profileState?.semanticAsset ?? {
        modelId: String(dataset.model_id ?? ''),
        modelName: 'Approved semantic model',
        modelVersion,
        materializedAt: nowIso,
        fieldCount: simpleFields.length,
        metricCount: simpleMetrics.length,
        relationshipCount: 0,
      },
    })
    const lineageLabel = guidedLineageLabel(lineage)
    const draftPlan = buildGuidedDashboardDraftPlan({
      datasetName: String(dataset.name ?? 'Guided'),
      fields: simpleFields,
      metrics: simpleMetrics,
      recommendations,
      lineage,
    })

    if (draftPlan.charts.length === 0) {
      return NextResponse.json({ dashboard: null, version: null, charts: [], plan: draftPlan, error: 'No safe draft charts could be generated' }, { status: 422 })
    }

    const dashboardName = parsed.data.name?.trim() || draftPlan.title
    const slugBase = slugifyDashboardName(dashboardName) || 'guided-dashboard'
    const { data: dashboardRow, error: dashboardError } = await auth.supabase
      .from('published_dashboards')
      .insert({
        tenant_id: parsed.data.tenantId,
        project_id: parsed.data.projectId,
        name: dashboardName,
        slug: `${slugBase}-${Date.now().toString(36)}`.slice(0, 80),
        description: `${lineageLabel}. Review and publish only after preview.`,
        status: 'draft',
        created_by: auth.userId,
        updated_by: auth.userId,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single()

    if (dashboardError) return NextResponse.json({ dashboard: null, version: null, charts: [], plan: draftPlan, error: dashboardError.message }, { status: 400 })
    const dashboard = mapPublishedDashboard(dashboardRow as Record<string, unknown>)

    const chartRows = []
    const validations = []
    for (const [index, chart] of draftPlan.charts.entries()) {
      const xAxisFieldId = chart.fieldIds[0]
      const encoding: DashboardChartEncoding = {
        xAxisFieldId,
        yMetricIds: chart.metricIds,
        tooltipFieldIds: [...chart.fieldIds, ...chart.metricIds],
        labelById: Object.fromEntries([
          ...simpleFields.map(field => [field.id, field.name]),
          ...simpleMetrics.map(metric => [metric.id, metric.name]),
        ]),
        colorById: {},
        sort: null,
        limit: 25,
      }
      const validation = validateDashboardChartConfig({
        templateId: chart.templateId,
        encoding,
        fields,
        metrics,
      })
      if (validation.state === 'invalid') continue
      validations.push(validation)
      chartRows.push({
        tenant_id: parsed.data.tenantId,
        project_id: parsed.data.projectId,
        dataset_id: parsed.data.datasetId,
        name: chart.title,
        description: chart.reviewNote ? `${lineageLabel}. ${chart.reviewNote}` : lineageLabel,
        status: 'draft',
        template_id: chart.templateId as ChartTemplateId,
        encoding,
        presentation: {
          size: chart.gridSpan >= 3 ? 'wide' : chart.gridSpan === 1 ? 'compact' : 'standard',
          showLegend: true,
          showLabels: false,
          valueFormat: null,
        },
        interactions: {},
        layout: { order: index, gridSpan: chart.gridSpan },
        validation_state: validation.state,
        last_validated_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
    }

    if (chartRows.length === 0) {
      return NextResponse.json({ dashboard, version: null, charts: [], plan: draftPlan, error: 'Generated chart drafts did not pass validation' }, { status: 422 })
    }

    const { data: insertedCharts, error: chartError } = await auth.supabase
      .from('dashboard_chart_configs')
      .insert(chartRows)
      .select('*')

    if (chartError) return NextResponse.json({ dashboard, version: null, charts: [], plan: draftPlan, error: chartError.message }, { status: 400 })
    const charts = (insertedCharts ?? []).map(row => mapChart(row as Record<string, unknown>))

    const versionNumber = await nextVersionNumber(auth.supabase, dashboard.id)
    const { data: versionRow, error: versionError } = await auth.supabase
      .from('dashboard_versions')
      .insert({
        dashboard_id: dashboard.id,
        tenant_id: dashboard.tenantId,
        project_id: dashboard.projectId,
        version_number: versionNumber,
        status: 'draft',
        title: 'Guided dashboard draft',
        notes: `${lineageLabel}. ${draftPlan.reviewNotes.join(' ')}`.trim(),
        layout: draftPlan.layout,
        created_by: auth.userId,
        created_at: nowIso,
      })
      .select('*')
      .single()

    if (versionError) return NextResponse.json({ dashboard, version: null, charts, plan: draftPlan, error: versionError.message }, { status: 400 })
    const version = mapDashboardVersion(versionRow as Record<string, unknown>)

    const { data: pageRows, error: pageError } = await auth.supabase
      .from('dashboard_pages')
      .insert({
        version_id: version.id,
        dashboard_id: dashboard.id,
        tenant_id: dashboard.tenantId,
        project_id: dashboard.projectId,
        title: 'Overview',
        slug: 'overview',
        sort_order: 0,
        layout: { columns: 12 },
        created_at: nowIso,
      })
      .select('*')

    if (pageError) return NextResponse.json({ dashboard, version, charts, plan: draftPlan, error: pageError.message }, { status: 400 })
    const page = mapDashboardPage((pageRows ?? [])[0] as Record<string, unknown>)

    const slotRows = charts.map((chart, index) => ({
      page_id: page.id,
      version_id: version.id,
      dashboard_id: dashboard.id,
      tenant_id: dashboard.tenantId,
      project_id: dashboard.projectId,
      chart_config_id: chart.id,
      title: chart.name,
      slot_key: slugifyDashboardName(chart.name) || `slot-${index + 1}`,
      row_index: Math.floor(index / 2),
      column_index: index % 2 === 0 ? 0 : 6,
      width: chart.layout.gridSpan >= 3 ? 8 : chart.layout.gridSpan === 1 ? 4 : 6,
      height: chart.layout.gridSpan >= 3 ? 4 : 3,
      settings: {},
      created_at: nowIso,
    }))
    const { data: slotData, error: slotError } = await auth.supabase
      .from('dashboard_chart_slots')
      .insert(slotRows)
      .select('*')

    if (slotError) return NextResponse.json({ dashboard, version, charts, plan: draftPlan, error: slotError.message }, { status: 400 })
    const slots = (slotData ?? []).map(row => mapDashboardChartSlot(row as Record<string, unknown>))

    await auth.supabase.from('audit_logs').insert({
      tenant_id: dashboard.tenantId,
      project_id: dashboard.projectId,
      actor_user_id: auth.userId,
      action: 'guided_review.dashboard_draft_created',
      target_type: 'published_dashboard',
      target_id: dashboard.id,
      metadata: { datasetId: parsed.data.datasetId, chartCount: charts.length, versionId: version.id, lineage },
      created_at: nowIso,
    })

    return NextResponse.json({ dashboard, version, pages: [page], slots, charts, plan: draftPlan, validations }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dashboard: null, version: null, charts: [], error: message }, { status: 500 })
  }
}
