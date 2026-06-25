import { NextResponse } from 'next/server'
import { z } from 'zod'

import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DashboardChartConfig, DashboardChartEncoding } from '@/types/dashboard-chart'

const StatusSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']),
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ chart: null, validation: null, error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parsed = StatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ chart: null, validation: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: chartRow, error: chartError } = await auth.supabase
      .from('dashboard_chart_configs')
      .select('*')
      .eq('id', id)
      .single()

    if (chartError || !chartRow) {
      return NextResponse.json({ chart: null, validation: null, error: chartError?.message ?? 'Chart not found' }, { status: 404 })
    }

    const chart = mapChart(chartRow as Record<string, unknown>)
    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('id, tenant_id, project_id, status, selection')
      .eq('id', chart.datasetId)
      .eq('tenant_id', chart.tenantId)
      .eq('project_id', chart.projectId)
      .single()

    if (datasetError || !datasetRow) {
      return NextResponse.json({ chart: null, validation: null, error: datasetError?.message ?? 'Dataset not found' }, { status: 404 })
    }

    const dataset = datasetRow as Record<string, unknown>
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
      templateId: chart.templateId,
      encoding: chart.encoding as DashboardChartEncoding,
      fields: (fieldsResult.data ?? []) as Record<string, unknown>[],
      metrics: (metricsResult.data ?? []) as Record<string, unknown>[],
    })

    if (parsed.data.status === 'published') {
      if (dataset.status !== 'published') {
        return NextResponse.json({ chart: null, validation, error: 'Dataset must be published before chart publish' }, { status: 409 })
      }
      if (validation.state !== 'valid') {
        return NextResponse.json({ chart: null, validation, error: 'Chart must pass validation before publish' }, { status: 422 })
      }
    }

    const nowIso = new Date().toISOString()
    const nextStatus = parsed.data.status
    const { data: updatedRow, error: updateError } = await auth.supabase
      .from('dashboard_chart_configs')
      .update({
        status: nextStatus,
        validation_state: validation.state,
        last_validated_at: nowIso,
        published_at: nextStatus === 'published' ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) return NextResponse.json({ chart: null, validation, error: updateError.message }, { status: 400 })
    const updatedChart = mapChart(updatedRow as Record<string, unknown>)

    await Promise.all([
      auth.supabase.from('dashboard_chart_validation_results').insert({
        chart_id: updatedChart.id,
        tenant_id: updatedChart.tenantId,
        project_id: updatedChart.projectId,
        state: validation.state,
        issues: validation.issues,
        checked_by: auth.userId,
        checked_at: nowIso,
      }),
      auth.supabase.from('audit_logs').insert({
        tenant_id: updatedChart.tenantId,
        project_id: updatedChart.projectId,
        actor_user_id: auth.userId,
        action: 'dashboard_chart.status_updated',
        target_type: 'dashboard_chart_config',
        target_id: updatedChart.id,
        metadata: { status: updatedChart.status, validationState: validation.state },
        created_at: nowIso,
      }),
    ])

    return NextResponse.json({ chart: updatedChart, validation })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ chart: null, validation: null, error: message }, { status: 500 })
  }
}
