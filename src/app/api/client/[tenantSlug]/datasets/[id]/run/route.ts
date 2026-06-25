import { NextResponse } from 'next/server'

import { executePostgresReadOnlyQuery } from '@/lib/data-sources/postgres-runtime'
import { compileDatasetQueryPlan } from '@/lib/semantic/dataset-query-compiler'
import { getAuthedSupabase } from '@/lib/supabase/server'

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
    relationshipIds: toStringArray(selection.relationshipIds),
  }
}

function metricSourceFieldIds(metrics: Record<string, unknown>[], fields: Record<string, unknown>[]) {
  const selectedFieldIds = new Set(fields.map(field => String(field.id)))
  return Array.from(new Set(metrics.map(metric => {
    const expression = metric.expression && typeof metric.expression === 'object'
      ? metric.expression as Record<string, unknown>
      : {}
    return typeof expression.fieldId === 'string' ? expression.fieldId : null
  }).filter(Boolean) as string[])).filter(fieldId => !selectedFieldIds.has(fieldId))
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ tenantSlug: string; id: string }> },
) {
  const { tenantSlug, id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ result: null, error: 'Unauthorized' }, { status: 401 })

    const { data: tenant, error: tenantError } = await auth.supabase
      .from('tenants')
      .select('id, name, slug, status')
      .eq('slug', tenantSlug)
      .eq('status', 'active')
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ result: null, error: 'Tenant not found' }, { status: 404 })
    }

    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .eq('status', 'published')
      .single()

    if (datasetError) {
      return NextResponse.json({ result: null, error: 'Published dataset not found' }, { status: 404 })
    }

    const dataset = datasetRow as Record<string, unknown>
    const selection = selectionFromDataset(dataset)
    const [fieldsResult, metricsResult, relationshipsResult] = await Promise.all([
      selection.fieldIds.length > 0
        ? auth.supabase.from('business_fields').select('*').in('id', selection.fieldIds)
        : Promise.resolve({ data: [], error: null }),
      selection.metricIds.length > 0
        ? auth.supabase.from('business_metrics').select('*').in('id', selection.metricIds)
        : Promise.resolve({ data: [], error: null }),
      selection.relationshipIds.length > 0
        ? auth.supabase.from('business_relationships').select('*').in('id', selection.relationshipIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (fieldsResult.error) return NextResponse.json({ result: null, error: fieldsResult.error.message }, { status: 500 })
    if (metricsResult.error) return NextResponse.json({ result: null, error: metricsResult.error.message }, { status: 500 })
    if (relationshipsResult.error) return NextResponse.json({ result: null, error: relationshipsResult.error.message }, { status: 500 })

    const fields = (fieldsResult.data ?? []) as Record<string, unknown>[]
    const metrics = (metricsResult.data ?? []) as Record<string, unknown>[]
    const relationships = (relationshipsResult.data ?? []) as Record<string, unknown>[]
    const missingMetricSourceFieldIds = metricSourceFieldIds(metrics, fields)
    const { data: metricSourceFields, error: metricSourceFieldsError } = missingMetricSourceFieldIds.length > 0
      ? await auth.supabase.from('business_fields').select('*').in('id', missingMetricSourceFieldIds)
      : { data: [], error: null }

    if (metricSourceFieldsError) {
      return NextResponse.json({ result: null, error: metricSourceFieldsError.message }, { status: 500 })
    }

    const compileResult = compileDatasetQueryPlan({
      fields,
      metrics,
      relationships,
      metricSourceFields: (metricSourceFields ?? []) as Record<string, unknown>[],
    })

    if (!compileResult.queryPlan.executableSql || !compileResult.dataSourceId) {
      return NextResponse.json({
        result: null,
        error: 'Published dataset is not executable yet',
        warnings: compileResult.warnings,
      }, { status: 422 })
    }

    const { data: sourceRow, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, credential_ciphertext, status')
      .eq('id', compileResult.dataSourceId)
      .eq('tenant_id', tenant.id)
      .single()

    if (sourceError) return NextResponse.json({ result: null, error: sourceError.message }, { status: 404 })
    if (sourceRow.status !== 'active') {
      return NextResponse.json({ result: null, error: 'Data source is not active' }, { status: 409 })
    }

    const result = await executePostgresReadOnlyQuery(
      String(sourceRow.credential_ciphertext),
      compileResult.queryPlan.executableSql,
      { queryTimeoutMs: compileResult.queryPlan.limits.timeoutMs },
    )

    return NextResponse.json({
      result: {
        tenant: {
          id: String(tenant.id),
          name: String(tenant.name ?? ''),
          slug: String(tenant.slug ?? ''),
        },
        dataset: {
          id: String(dataset.id),
          name: String(dataset.name ?? ''),
          status: String(dataset.status ?? 'published'),
        },
        warnings: compileResult.warnings,
        ...result,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ result: null, error: message }, { status: 500 })
  }
}
