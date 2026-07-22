import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ChartSuiteDraftSchema } from '@/lib/ai/chart-suite-copilot'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DashboardChartConfig } from '@/types/dashboard-chart'

const RequestSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  datasetId: z.string().uuid(),
  charts: z.array(ChartSuiteDraftSchema).min(1).max(12),
}).strict()

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function mapChart(row: Record<string, unknown>): DashboardChartConfig {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    datasetId: String(row.dataset_id),
    name: String(row.name),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status) as DashboardChartConfig['status'],
    templateId: String(row.template_id) as DashboardChartConfig['templateId'],
    encoding: row.encoding as DashboardChartConfig['encoding'],
    presentation: row.presentation as DashboardChartConfig['presentation'],
    interactions: row.interactions as DashboardChartConfig['interactions'],
    layout: row.layout as DashboardChartConfig['layout'],
    validationState: String(row.validation_state) as DashboardChartConfig['validationState'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ charts: [], error: 'Unauthorized' }, { status: 401 })
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ charts: [], error: parsed.error.flatten() }, { status: 400 })
    const access = await requireProjectAccess({ ...accessContext(auth), tenantId: parsed.data.tenantId, projectId: parsed.data.projectId, editor: true })
    if (!access.ok) return NextResponse.json({ charts: [], error: access.error }, { status: access.status })

    const { data: dataset, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('id, tenant_id, project_id, status, selection')
      .eq('id', parsed.data.datasetId)
      .eq('tenant_id', parsed.data.tenantId)
      .eq('project_id', parsed.data.projectId)
      .single()
    if (datasetError || !dataset) return NextResponse.json({ charts: [], error: datasetError?.message ?? 'Dataset not found' }, { status: 404 })
    if (dataset.status !== 'published') return NextResponse.json({ charts: [], error: 'Publish the governed dataset before applying chart drafts' }, { status: 409 })
    const selection = dataset.selection && typeof dataset.selection === 'object' ? dataset.selection as Record<string, unknown> : {}
    const fieldIds = strings(selection.fieldIds)
    const metricIds = strings(selection.metricIds)
    const [fieldResult, metricResult] = await Promise.all([
      fieldIds.length ? auth.supabase.from('business_fields').select('*').in('id', fieldIds) : Promise.resolve({ data: [], error: null }),
      metricIds.length ? auth.supabase.from('business_metrics').select('*').in('id', metricIds) : Promise.resolve({ data: [], error: null }),
    ])
    const assetError = fieldResult.error ?? metricResult.error
    if (assetError) return NextResponse.json({ charts: [], error: assetError.message }, { status: 500 })
    const fields = (fieldResult.data ?? []) as Record<string, unknown>[]
    const metrics = (metricResult.data ?? []) as Record<string, unknown>[]
    const validated = parsed.data.charts.map((chart) => ({
      chart,
      validation: validateDashboardChartConfig({ templateId: chart.templateId, encoding: chart.encoding, fields, metrics }),
    }))
    const invalid = validated.filter(item => item.validation.state === 'invalid')
    if (invalid.length > 0) {
      return NextResponse.json({ charts: [], error: 'No chart drafts were created because at least one proposal is invalid', validation: validated.map(item => item.validation) }, { status: 422 })
    }

    const rpcCharts = validated.map(({ chart, validation }) => ({
      ...chart,
      validationState: validation.state,
      validationIssues: validation.issues,
    }))
    const { data, error } = await auth.supabase.rpc('create_dashboard_chart_drafts', {
      p_tenant_id: parsed.data.tenantId,
      p_project_id: parsed.data.projectId,
      p_dataset_id: parsed.data.datasetId,
      p_charts: rpcCharts,
    })
    if (error) return NextResponse.json({ charts: [], error: error.message }, { status: 409 })
    return NextResponse.json({ charts: (data ?? []).map(row => mapChart(row as Record<string, unknown>)), validation: validated.map(item => item.validation) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ charts: [], error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
