import { NextResponse } from 'next/server'

import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DashboardChartEncoding } from '@/types/dashboard-chart'

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

function asEncoding(value: unknown): DashboardChartEncoding {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

  return {
    xAxisFieldId: typeof record.xAxisFieldId === 'string' ? record.xAxisFieldId : undefined,
    yMetricIds: toStringArray(record.yMetricIds),
    seriesFieldId: typeof record.seriesFieldId === 'string' ? record.seriesFieldId : undefined,
    stackMetricIds: toStringArray(record.stackMetricIds),
    tooltipFieldIds: toStringArray(record.tooltipFieldIds),
    labelById: record.labelById && typeof record.labelById === 'object' && !Array.isArray(record.labelById)
      ? record.labelById as Record<string, string>
      : {},
    colorById: record.colorById && typeof record.colorById === 'object' && !Array.isArray(record.colorById)
      ? record.colorById as Record<string, string>
      : {},
    sort: record.sort && typeof record.sort === 'object' && !Array.isArray(record.sort)
      ? record.sort as DashboardChartEncoding['sort']
      : null,
    limit: typeof record.limit === 'number' ? record.limit : null,
    filters: Array.isArray(record.filters)
      ? record.filters as DashboardChartEncoding['filters']
      : [],
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ validation: null, error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const datasetId = typeof body?.datasetId === 'string' ? body.datasetId : ''
    const templateId = typeof body?.templateId === 'string' ? body.templateId : ''
    const encoding = asEncoding(body?.encoding)

    if (!datasetId || !templateId) {
      return NextResponse.json({ validation: null, error: 'datasetId and templateId are required' }, { status: 400 })
    }

    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('id, tenant_id, project_id, selection')
      .eq('id', datasetId)
      .single()

    if (datasetError || !datasetRow) {
      return NextResponse.json({ validation: null, error: datasetError?.message ?? 'Dataset not found' }, { status: 404 })
    }

    const dataset = datasetRow as Record<string, unknown>
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(dataset.tenant_id),
      projectId: String(dataset.project_id),
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ validation: null, error: access.error }, { status: access.status })
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

    if (fieldsResult.error) return NextResponse.json({ validation: null, error: fieldsResult.error.message }, { status: 500 })
    if (metricsResult.error) return NextResponse.json({ validation: null, error: metricsResult.error.message }, { status: 500 })

    const validation = validateDashboardChartConfig({
      templateId,
      encoding,
      fields: (fieldsResult.data ?? []) as Record<string, unknown>[],
      metrics: (metricsResult.data ?? []) as Record<string, unknown>[],
    })

    return NextResponse.json({ validation })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ validation: null, error: message }, { status: 500 })
  }
}
