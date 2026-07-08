import { NextResponse } from 'next/server'

import { executePostgresReadOnlyQuery } from '@/lib/data-sources/postgres-runtime'
import { requireDatasetEntitlement } from '@/lib/security/entitlements'
import { accessContext, requireTenantAccess } from '@/lib/security/project-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { compileDatasetQueryPlan } from '@/lib/semantic/dataset-query-compiler'
import { checkQueryBudget } from '@/lib/semantic/query-budget-policy'
import { getQueryResultCache, queryResultCacheKey, setQueryResultCache } from '@/lib/semantic/query-result-cache'
import { recordSemanticQueryRun } from '@/lib/semantic/query-runtime-telemetry'
import { selectionFromRecord, validateSemanticReferencesForModel } from '@/lib/semantic/semantic-hardening'
import { getAuthedSupabase } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  context: { params: Promise<{ tenantSlug: string; id: string }> },
) {
  const { tenantSlug, id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ result: null, error: 'Unauthorized' }, { status: 401 })

    const rateLimit = await checkRuntimeRateLimit({
      key: `client-dataset:${tenantSlug}:${id}:${auth.userId}`,
      maxRequests: 60,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { result: null, error: 'Too many dataset runtime requests. Please retry shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    const { data: tenant, error: tenantError } = await auth.supabase
      .from('tenants')
      .select('id, name, slug, status')
      .eq('slug', tenantSlug)
      .eq('status', 'active')
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ result: null, error: 'Tenant not found' }, { status: 404 })
    }

    const tenantAccess = await requireTenantAccess({
      ...accessContext(auth),
      tenantId: String(tenant.id),
    })
    if (!tenantAccess.ok) {
      return NextResponse.json({ result: null, error: tenantAccess.error }, { status: tenantAccess.status })
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
    const datasetEntitlement = await requireDatasetEntitlement({
      supabase: auth.supabase,
      userId: auth.userId,
      platformRole: auth.role,
      tenantId: String(tenant.id),
      projectId: String(dataset.project_id),
      datasetId: String(dataset.id),
    })
    if (!datasetEntitlement.ok) {
      return NextResponse.json({ result: null, error: datasetEntitlement.error }, { status: datasetEntitlement.status })
    }

    const cachePolicy = dataset.cache_policy && typeof dataset.cache_policy === 'object'
      ? dataset.cache_policy as Record<string, unknown>
      : {}
    const semanticValidation = await validateSemanticReferencesForModel({
      supabase: auth.supabase,
      tenantId: String(tenant.id),
      projectId: String(dataset.project_id),
      modelId: String(dataset.model_id),
      selection: selectionFromRecord(dataset.selection),
    })
    if (!semanticValidation.ok) {
      return NextResponse.json({ result: null, error: semanticValidation.error }, { status: 422 })
    }

    const fields = semanticValidation.fields
    const metrics = semanticValidation.metrics
    const relationships = semanticValidation.relationships

    const compileResult = compileDatasetQueryPlan({
      fields,
      metrics,
      relationships,
      metricSourceFields: semanticValidation.metricSourceFields,
    })

    if (!compileResult.queryPlan.executableSql || !compileResult.dataSourceId) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(tenant.id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        actorUserId: auth.userId,
        surface: 'client_dataset',
        status: 'error',
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: 'Published dataset is not executable yet',
        warnings: compileResult.warnings,
      })
      return NextResponse.json({
        result: null,
        error: 'Published dataset is not executable yet',
        warnings: compileResult.warnings,
      }, { status: 422 })
    }

    const { data: sourceRow, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, credential_ciphertext, status, schema_hash')
      .eq('id', compileResult.dataSourceId)
      .eq('tenant_id', tenant.id)
      .eq('project_id', dataset.project_id)
      .single()

    if (sourceError) return NextResponse.json({ result: null, error: sourceError.message }, { status: 404 })
    if (sourceRow.status !== 'active') {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(tenant.id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_dataset',
        status: 'error',
        sql: compileResult.queryPlan.executableSql,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: 'Data source is not active',
        warnings: compileResult.warnings,
      })
      return NextResponse.json({ result: null, error: 'Data source is not active' }, { status: 409 })
    }

    const cacheKey = queryResultCacheKey({
      tenantId: String(tenant.id),
      projectId: String(dataset.project_id),
      datasetId: String(dataset.id),
      dataSourceId: compileResult.dataSourceId,
      sql: compileResult.queryPlan.executableSql,
      parameters: compileResult.parameters,
      datasetUpdatedAt: typeof dataset.updated_at === 'string' ? dataset.updated_at : null,
      schemaHash: typeof sourceRow.schema_hash === 'string' ? sourceRow.schema_hash : null,
    })
    const cached = await getQueryResultCache<Awaited<ReturnType<typeof executePostgresReadOnlyQuery>>>(cacheKey)
    if (cached.hit && cached.value) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(tenant.id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_dataset',
        status: 'success',
        sql: compileResult.queryPlan.executableSql,
        rowCount: cached.value.rowCount,
        elapsedMs: 0,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        warnings: [...compileResult.warnings, `cache_hit:${cached.backend}`],
      })

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
          cache: { hit: true, backend: cached.backend },
          ...cached.value,
        },
      })
    }

    const budget = await checkQueryBudget({
      supabase: auth.supabase,
      tenantId: String(tenant.id),
      projectId: String(dataset.project_id),
      dataSourceId: compileResult.dataSourceId,
    })
    if (!budget.ok) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(tenant.id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_dataset',
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
          parameters: compileResult.parameters,
          poolKey: `data-source:${String(sourceRow.id)}`,
          queryTimeoutMs: compileResult.queryPlan.limits.timeoutMs,
        },
      )
    } catch (queryError) {
      const message = queryError instanceof Error ? queryError.message : String(queryError)
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: String(tenant.id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_dataset',
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
      tenantId: String(tenant.id),
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
        tenantId: String(tenant.id),
        projectId: String(dataset.project_id),
        datasetId: String(dataset.id),
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_dataset',
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
      tenantId: String(tenant.id),
      projectId: String(dataset.project_id),
      datasetId: String(dataset.id),
      dataSourceId: compileResult.dataSourceId,
      actorUserId: auth.userId,
      surface: 'client_dataset',
      status: 'success',
      sql: compileResult.queryPlan.executableSql,
      rowCount: result.rowCount,
      elapsedMs: result.elapsedMs,
      timeoutMs: compileResult.queryPlan.limits.timeoutMs,
      warnings: compileResult.warnings,
    })
    const cacheWrite = await setQueryResultCache(cacheKey, result, cachePolicy.ttlSeconds)

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
        cache: { hit: false, backend: cacheWrite.backend, ttlSeconds: cacheWrite.ttlSeconds },
        ...result,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ result: null, error: message }, { status: 500 })
  }
}
