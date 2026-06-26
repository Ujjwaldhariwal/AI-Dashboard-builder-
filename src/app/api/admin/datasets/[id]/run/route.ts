import { NextResponse } from 'next/server'

import { executePostgresReadOnlyQuery } from '@/lib/data-sources/postgres-runtime'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { compileDatasetQueryPlan } from '@/lib/semantic/dataset-query-compiler'
import { checkQueryBudget } from '@/lib/semantic/query-budget-policy'
import { recordSemanticQueryRun } from '@/lib/semantic/query-runtime-telemetry'
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
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ result: null, error: 'Unauthorized' }, { status: 401 })

    const rateLimit = await checkRuntimeRateLimit({
      key: `admin-preview:${auth.userId}`,
      maxRequests: 30,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { result: null, error: 'Too many dataset preview requests. Please retry shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('*')
      .eq('id', id)
      .single()

    if (datasetError) {
      return NextResponse.json({ result: null, error: datasetError.message }, { status: 404 })
    }

    const dataset = datasetRow as Record<string, unknown>
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(dataset.tenant_id),
      projectId: String(dataset.project_id),
    })
    if (!access.ok) {
      return NextResponse.json({ result: null, error: access.error }, { status: access.status })
    }

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
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(dataset.tenant_id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        actorUserId: auth.userId,
        surface: 'admin_preview',
        status: 'error',
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: 'Dataset is not executable yet',
        warnings: compileResult.warnings,
      })
      return NextResponse.json({
        result: null,
        error: 'Dataset is not executable yet',
        warnings: compileResult.warnings,
        queryPlan: compileResult.queryPlan,
      }, { status: 422 })
    }

    const { data: sourceRow, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, credential_ciphertext, status')
      .eq('id', compileResult.dataSourceId)
      .single()

    if (sourceError) return NextResponse.json({ result: null, error: sourceError.message }, { status: 404 })
    if (sourceRow.status !== 'active') {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(dataset.tenant_id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'admin_preview',
        status: 'error',
        sql: compileResult.queryPlan.executableSql,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: 'Data source must be active before dataset execution',
        warnings: compileResult.warnings,
      })
      return NextResponse.json({ result: null, error: 'Data source must be active before dataset execution' }, { status: 409 })
    }

    const budget = await checkQueryBudget({
      supabase: auth.supabase,
      tenantId: String(dataset.tenant_id),
      projectId: String(dataset.project_id),
      dataSourceId: compileResult.dataSourceId,
    })
    if (!budget.ok) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(dataset.tenant_id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'admin_preview',
        status: 'error',
        sql: compileResult.queryPlan.executableSql,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: budget.reason ?? 'Query budget exceeded',
        warnings: [...compileResult.warnings, `budget_policy:${budget.policy?.id ?? 'unknown'}`],
      })
      return NextResponse.json({
        result: null,
        error: budget.reason ?? 'Query budget exceeded',
        budget,
      }, { status: 429, headers: { 'Retry-After': String(budget.retryAfterSeconds) } })
    }

    let result: Awaited<ReturnType<typeof executePostgresReadOnlyQuery>>
    try {
      result = await executePostgresReadOnlyQuery(
        String(sourceRow.credential_ciphertext),
        compileResult.queryPlan.executableSql,
        {
          poolKey: `data-source:${String(sourceRow.id)}`,
          queryTimeoutMs: compileResult.queryPlan.limits.timeoutMs,
        },
      )
    } catch (queryError) {
      const message = queryError instanceof Error ? queryError.message : String(queryError)
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(dataset.tenant_id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'admin_preview',
        status: 'error',
        sql: compileResult.queryPlan.executableSql,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: message,
        warnings: compileResult.warnings,
      })
      throw queryError
    }

    const projectedBudget = await checkQueryBudget({
      supabase: auth.supabase,
      tenantId: String(dataset.tenant_id),
      projectId: String(dataset.project_id),
      dataSourceId: compileResult.dataSourceId,
      projection: {
        queries: 1,
        rows: result.rowCount,
        elapsedMs: result.elapsedMs,
      },
    })
    if (!projectedBudget.ok) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(dataset.tenant_id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'admin_preview',
        status: 'error',
        sql: compileResult.queryPlan.executableSql,
        rowCount: result.rowCount,
        elapsedMs: result.elapsedMs,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: projectedBudget.reason ?? 'Query budget exceeded',
        warnings: [...compileResult.warnings, `budget_policy:${projectedBudget.policy?.id ?? 'unknown'}`, 'budget_projection:post_execution'],
      })
      return NextResponse.json({
        result: null,
        error: projectedBudget.reason ?? 'Query budget exceeded',
        budget: projectedBudget,
      }, { status: 429, headers: { 'Retry-After': String(projectedBudget.retryAfterSeconds) } })
    }

    await recordSemanticQueryRun({
      supabase: auth.supabase,
      tenantId: String(dataset.tenant_id),
      projectId: String(dataset.project_id),
      datasetId: String(dataset.id),
      dataSourceId: compileResult.dataSourceId,
      actorUserId: auth.userId,
      surface: 'admin_preview',
      status: 'success',
      sql: compileResult.queryPlan.executableSql,
      rowCount: result.rowCount,
      elapsedMs: result.elapsedMs,
      timeoutMs: compileResult.queryPlan.limits.timeoutMs,
      warnings: compileResult.warnings,
    })

    return NextResponse.json({
      result: {
        dataset: {
          id: String(dataset.id),
          name: String(dataset.name ?? ''),
          status: String(dataset.status ?? 'draft'),
        },
        queryPlan: compileResult.queryPlan,
        warnings: compileResult.warnings,
        ...result,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ result: null, error: message }, { status: 500 })
  }
}
