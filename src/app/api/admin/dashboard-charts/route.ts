import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DashboardChartConfig, DashboardChartEncoding } from '@/types/dashboard-chart'

const EncodingSchema = z.object({
  xAxisFieldId: z.string().uuid().optional(),
  yMetricIds: z.array(z.string().uuid()).default([]),
  seriesFieldId: z.string().uuid().optional(),
  stackMetricIds: z.array(z.string().uuid()).default([]),
  tooltipFieldIds: z.array(z.string().uuid()).default([]),
  labelById: z.record(z.string(), z.string()).default({}),
  colorById: z.record(z.string(), z.string()).default({}),
  sort: z.object({
    byId: z.string().uuid(),
    direction: z.enum(['asc', 'desc']),
  }).nullable().optional(),
  limit: z.number().int().min(1).max(500).nullable().optional(),
  filters: z.array(z.object({
    fieldId: z.string().uuid(),
    operator: z.enum(['eq', 'not_eq', 'in', 'contains', 'gte', 'lte']),
    value: z.union([
      z.string().max(120),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string().max(120), z.number(), z.boolean()])).min(1).max(12),
    ]),
  }).strict()).max(4).default([]),
}).strict()

const ChartSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  datasetId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().or(z.literal('')),
  templateId: z.string().min(2).max(80),
  encoding: EncodingSchema,
  presentation: z.object({
    size: z.enum(['compact', 'standard', 'wide', 'full']).default('standard'),
    showLegend: z.boolean().default(true),
    showLabels: z.boolean().default(false),
    valueFormat: z.string().max(80).nullable().optional(),
  }).strict().default({
    size: 'standard',
    showLegend: true,
    showLabels: false,
    valueFormat: null,
  }),
  interactions: z.object({
    drilldown: z.object({
      enabled: z.boolean(),
      fieldId: z.string().uuid().optional(),
      targetChartId: z.string().uuid().optional(),
    }).nullable().optional(),
    filterOnClick: z.boolean().optional(),
  }).strict().default({}),
  layout: z.object({
    order: z.number().int().min(0).default(0),
    gridSpan: z.number().int().min(1).max(4).default(1),
  }).strict().default({ order: 0, gridSpan: 1 }),
}).strict()

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function selectionFromDataset(row: Record<string, unknown>) {
  const selection = row.selection && typeof row.selection === 'object'
    ? row.selection as Record<string, unknown>
    : {}
  return {
    fieldIds: toStringArray(selection.fieldIds),
    metricIds: toStringArray(selection.metricIds),
  }
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
      ? row.encoding as DashboardChartConfig['encoding']
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

export async function GET(req: NextRequest) {
  const auth = await getAuthedSupabase()
  if (!auth) return NextResponse.json({ charts: [], error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (projectId) {
    const access = await requireProjectAccess({ ...accessContext(auth), projectId })
    if (!access.ok) {
      return NextResponse.json({ charts: [], error: access.error }, { status: access.status })
    }
  }

  let query = auth.supabase.from('dashboard_chart_configs').select('*').order('updated_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return NextResponse.json({ charts: [], error: error.message }, { status: 500 })
  return NextResponse.json({ charts: (data ?? []).map(row => mapChart(row as Record<string, unknown>)) })
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ chart: null, validation: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = ChartSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ chart: null, validation: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ chart: null, validation: null, error: access.error }, { status: access.status })
    }

    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('id, tenant_id, project_id, model_id, selection')
      .eq('id', parsed.data.datasetId)
      .eq('tenant_id', parsed.data.tenantId)
      .eq('project_id', parsed.data.projectId)
      .single()

    if (datasetError || !datasetRow) {
      return NextResponse.json({ chart: null, validation: null, error: datasetError?.message ?? 'Dataset not found' }, { status: 404 })
    }

    const dataset = datasetRow as Record<string, unknown>
    const modelId = typeof dataset.model_id === 'string' ? dataset.model_id : ''
    const { data: modelRow, error: modelError } = await auth.supabase
      .from('business_models')
      .select('id, status')
      .eq('id', modelId)
      .eq('tenant_id', parsed.data.tenantId)
      .eq('project_id', parsed.data.projectId)
      .single()

    if (modelError || !modelRow) {
      return NextResponse.json({ chart: null, validation: null, error: modelError?.message ?? 'Business model not found' }, { status: 404 })
    }
    if (modelRow.status !== 'approved') {
      return NextResponse.json({ chart: null, validation: null, error: 'Business model must be approved before creating chart configs' }, { status: 409 })
    }

    const selection = selectionFromDataset(dataset)
    const [fieldsResult, metricsResult] = await Promise.all([
      selection.fieldIds.length > 0
        ? auth.supabase.from('business_fields').select('*').in('id', selection.fieldIds)
        : Promise.resolve({ data: [], error: null }),
      selection.metricIds.length > 0
        ? auth.supabase.from('business_metrics').select('*').in('id', selection.metricIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (fieldsResult.error) return NextResponse.json({ chart: null, validation: null, error: fieldsResult.error.message }, { status: 500 })
    if (metricsResult.error) return NextResponse.json({ chart: null, validation: null, error: metricsResult.error.message }, { status: 500 })

    const validation = validateDashboardChartConfig({
      templateId: parsed.data.templateId,
      encoding: parsed.data.encoding as DashboardChartEncoding,
      fields: (fieldsResult.data ?? []) as Record<string, unknown>[],
      metrics: (metricsResult.data ?? []) as Record<string, unknown>[],
    })

    if (validation.state === 'invalid') {
      return NextResponse.json({ chart: null, validation, error: 'Chart config is invalid' }, { status: 422 })
    }

    const nowIso = new Date().toISOString()
    const { data: chartRow, error: chartError } = await auth.supabase
      .from('dashboard_chart_configs')
      .insert({
        tenant_id: parsed.data.tenantId,
        project_id: parsed.data.projectId,
        dataset_id: parsed.data.datasetId,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        status: 'draft',
        template_id: parsed.data.templateId,
        encoding: parsed.data.encoding,
        presentation: parsed.data.presentation,
        interactions: parsed.data.interactions,
        layout: parsed.data.layout,
        validation_state: validation.state,
        last_validated_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single()

    if (chartError) return NextResponse.json({ chart: null, validation, error: chartError.message }, { status: 400 })
    const chart = mapChart(chartRow as Record<string, unknown>)

    await Promise.all([
      auth.supabase.from('dashboard_chart_validation_results').insert({
        chart_id: chart.id,
        tenant_id: chart.tenantId,
        project_id: chart.projectId,
        state: validation.state,
        issues: validation.issues,
        checked_by: auth.userId,
        checked_at: nowIso,
      }),
      auth.supabase.from('audit_logs').insert({
        tenant_id: chart.tenantId,
        project_id: chart.projectId,
        actor_user_id: auth.userId,
        action: 'dashboard_chart.created',
        target_type: 'dashboard_chart_config',
        target_id: chart.id,
        metadata: { datasetId: chart.datasetId, templateId: chart.templateId, validationState: validation.state },
        created_at: nowIso,
      }),
    ])

    return NextResponse.json({ chart, validation }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ chart: null, validation: null, error: message }, { status: 500 })
  }
}
