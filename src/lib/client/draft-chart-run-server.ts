import { NextResponse } from 'next/server'

import {
  executeDataSourceReadOnlyQuery,
  resolveDataSourceType,
} from '@/lib/data-sources/data-source-runtime'
import { mapPublishedChartEditableSource } from '@/lib/client/published-chart-runtime'
import { mapDashboardReleaseChartSnapshot } from '@/lib/publishing/dashboard-release-snapshots'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import {
  compileDatasetQueryPlan,
  projectChartQueryInputs,
} from '@/lib/semantic/dataset-query-compiler'
import { checkQueryBudget } from '@/lib/semantic/query-budget-policy'
import { getQueryResultCache, queryResultCacheKey, setQueryResultCache } from '@/lib/semantic/query-result-cache'
import { recordSemanticQueryRun } from '@/lib/semantic/query-runtime-telemetry'
import { selectionFromRecord, validateSemanticReferencesForModel } from '@/lib/semantic/semantic-hardening'
import { getAuthedSupabase } from '@/lib/supabase/server'

const DRAFT_RUNTIME_CACHE_TTL_SECONDS = 60

function labelForId(rows: Record<string, unknown>[], id?: string) {
  if (!id) return ''
  const row = rows.find(item => String(item.id) === id)
  return row ? String(row.name ?? id) : id
}

function resolvedChartFields({
  fields,
  metrics,
  chart,
}: {
  fields: Record<string, unknown>[]
  metrics: Record<string, unknown>[]
  chart: ReturnType<typeof mapPublishedChartEditableSource>
}) {
  return {
    xField: labelForId(fields, chart.encoding.xAxisFieldId),
    yFields: chart.encoding.yMetricIds.map(metricId => labelForId(metrics, metricId)).filter(Boolean),
    tooltipFields: chart.encoding.tooltipFieldIds.map(itemId => (
      labelForId(fields, itemId) || labelForId(metrics, itemId)
    )).filter(Boolean),
    sortField: labelForId([...fields, ...metrics], chart.encoding.sort?.byId),
  }
}

/**
 * Executes the current source-chart draft for an editor preview. The active
 * release chart is still loaded first so a source chart cannot be queried by
 * guessing its ID from another project or dashboard.
 */
export async function runDraftChartRequest({
  tenantSlug,
  releaseChartId,
  sourceChartId,
}: {
  tenantSlug: string
  releaseChartId: string
  sourceChartId: string
}) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ result: null, error: 'Unauthorized' }, { status: 401 })

    const rateLimit = await checkRuntimeRateLimit({
      key: `client-chart-draft:${tenantSlug}:${releaseChartId}:${auth.userId}`,
      maxRequests: 30,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { result: null, error: 'Too many draft chart requests. Please retry shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    const { data: tenant, error: tenantError } = await auth.supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .eq('status', 'active')
      .single()
    if (tenantError || !tenant) return NextResponse.json({ result: null, error: 'Tenant not found' }, { status: 404 })

    const tenantAccess = await requireTenantAccess({ ...accessContext(auth), tenantId: String(tenant.id) })
    if (!tenantAccess.ok) return NextResponse.json({ result: null, error: tenantAccess.error }, { status: tenantAccess.status })

    const { data: releaseChartRow, error: releaseChartError } = await auth.supabase
      .from('dashboard_release_chart_snapshots')
      .select('*')
      .eq('id', releaseChartId)
      .eq('tenant_id', tenant.id)
      .single()
    if (releaseChartError || !releaseChartRow) {
      return NextResponse.json({ result: null, error: 'Released chart not found' }, { status: 404 })
    }

    const releaseChart = mapDashboardReleaseChartSnapshot(releaseChartRow as Record<string, unknown>)
    if (releaseChart.sourceChartConfigId !== sourceChartId) {
      return NextResponse.json({ result: null, error: 'Draft chart does not belong to this release chart' }, { status: 403 })
    }

    const { data: dashboardRow, error: dashboardError } = await auth.supabase
      .from('published_dashboards')
      .select('id, current_version_id, status')
      .eq('id', releaseChart.dashboardId)
      .eq('tenant_id', tenant.id)
      .eq('project_id', releaseChart.projectId)
      .eq('status', 'published')
      .single()
    if (dashboardError || !dashboardRow || String(dashboardRow.current_version_id ?? '') !== releaseChart.versionId) {
      return NextResponse.json({ result: null, error: 'Released chart is not part of the active dashboard release' }, { status: 404 })
    }

    const editorAccess = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(tenant.id),
      projectId: releaseChart.projectId,
      editor: true,
    })
    if (!editorAccess.ok) {
      return NextResponse.json({ result: null, error: 'Editor access is required to preview a chart draft' }, { status: 403 })
    }

    const { data: chartRow, error: chartError } = await auth.supabase
      .from('dashboard_chart_configs')
      .select('*')
      .eq('id', sourceChartId)
      .eq('tenant_id', tenant.id)
      .eq('project_id', releaseChart.projectId)
      .neq('status', 'archived')
      .single()
    if (chartError || !chartRow) return NextResponse.json({ result: null, error: 'Saved chart draft not found' }, { status: 404 })

    const chart = mapPublishedChartEditableSource(chartRow as Record<string, unknown>)
    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('*')
      .eq('id', chart.datasetId)
      .eq('tenant_id', tenant.id)
      .eq('project_id', chart.projectId)
      .single()
    if (datasetError || !datasetRow) return NextResponse.json({ result: null, error: 'Draft chart dataset not found' }, { status: 404 })

    const dataset = datasetRow as Record<string, unknown>
    const semanticValidation = await validateSemanticReferencesForModel({
      supabase: auth.supabase,
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      modelId: String(dataset.model_id),
      selection: selectionFromRecord(dataset.selection),
    })
    if (!semanticValidation.ok) {
      return NextResponse.json({ result: null, error: semanticValidation.error ?? 'Draft semantic references failed validation' }, { status: 422 })
    }

    const { fields, metrics, relationships, metricSourceFields } = semanticValidation
    const validation = validateDashboardChartConfig({
      templateId: chart.templateId,
      encoding: chart.encoding,
      presentation: chart.presentation,
      fields,
      metrics,
    })
    if (validation.state !== 'valid') {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: chart.datasetId,
        chartId: chart.id,
        actorUserId: auth.userId,
        surface: 'client_chart',
        status: 'error',
        errorMessage: 'Saved chart draft is not valid',
        warnings: validation.issues.map(issue => issue.message),
      })
      return NextResponse.json({ result: null, error: 'Saved chart draft is not valid', validation }, { status: 422 })
    }

    const queryInputs = projectChartQueryInputs({
      encoding: chart.encoding,
      fields,
      metrics,
      relationships,
      metricSourceFields,
    })
    let compileResult = compileDatasetQueryPlan(queryInputs)
    if (!compileResult.queryPlan.executableSql || !compileResult.dataSourceId) {
      return NextResponse.json({
        result: null,
        error: 'Saved chart draft dataset is not executable yet',
        warnings: compileResult.warnings,
      }, { status: 422 })
    }
    const dataSourceId = compileResult.dataSourceId

    const { data: sourceRow, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, type, credential_ciphertext, status, schema_hash')
      .eq('id', dataSourceId)
      .eq('tenant_id', tenant.id)
      .eq('project_id', chart.projectId)
      .single()
    if (sourceError || !sourceRow) return NextResponse.json({ result: null, error: 'Draft data source not found' }, { status: 404 })
    const sourceType = resolveDataSourceType(sourceRow.type)
    if (sourceType === 'oracle') compileResult = compileDatasetQueryPlan({ ...queryInputs, dialect: 'oracle' })
    if (!compileResult.queryPlan.executableSql) {
      return NextResponse.json({ result: null, error: 'Saved chart draft is not executable for this data source' }, { status: 422 })
    }
    if (sourceRow.status !== 'active') return NextResponse.json({ result: null, error: 'Draft data source is not active' }, { status: 409 })

    const warnings = [...compileResult.warnings, 'draft_runtime:editor_preview']
    const cacheKey = queryResultCacheKey({
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      datasetId: chart.datasetId,
      chartId: chart.id,
      dataSourceId,
      sql: compileResult.queryPlan.executableSql,
      parameters: compileResult.parameters,
      datasetUpdatedAt: typeof dataset.updated_at === 'string' ? dataset.updated_at : null,
      chartUpdatedAt: chart.updatedAt,
      schemaHash: typeof sourceRow.schema_hash === 'string' ? sourceRow.schema_hash : null,
    })
    const cached = await getQueryResultCache<Awaited<ReturnType<typeof executeDataSourceReadOnlyQuery>>>(cacheKey)
    const chartResult = {
      id: chart.id,
      name: chart.name,
      templateId: chart.templateId,
      encoding: chart.encoding,
      presentation: chart.presentation,
      layout: chart.layout,
      resolved: resolvedChartFields({ fields, metrics, chart }),
    }
    if (cached.hit && cached.value) {
      return NextResponse.json({
        result: {
          chart: chartResult,
          dataset: { id: chart.datasetId, name: String(dataset.name ?? ''), status: 'draft' },
          warnings,
          cache: { hit: true, backend: cached.backend },
          ...cached.value,
        },
      })
    }

    const budget = await checkQueryBudget({
      supabase: auth.supabase,
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      dataSourceId,
    })
    if (!budget.ok) {
      return NextResponse.json({ result: null, error: budget.reason ?? 'Query budget exceeded', budget }, {
        status: 429,
        headers: { 'Retry-After': String(budget.retryAfterSeconds) },
      })
    }

    let execution: Awaited<ReturnType<typeof executeDataSourceReadOnlyQuery>>
    try {
      execution = await executeDataSourceReadOnlyQuery(
        sourceType,
        String(sourceRow.credential_ciphertext),
        compileResult.queryPlan.executableSql,
        {
          parameters: compileResult.parameters,
          poolKey: `draft-chart:${String(sourceRow.id)}`,
          queryTimeoutMs: compileResult.queryPlan.limits.timeoutMs,
        },
      )
    } catch (queryError) {
      const message = queryError instanceof Error ? queryError.message : String(queryError)
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: chart.datasetId,
        chartId: chart.id,
        dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_chart',
        status: 'error',
        sql: compileResult.queryPlan.executableSql,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: message,
        warnings,
      })
      throw queryError
    }

    const projectedBudget = await checkQueryBudget({
      supabase: auth.supabase,
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      dataSourceId,
      projection: { queries: 1, rows: execution.rowCount, elapsedMs: execution.elapsedMs },
    })
    if (!projectedBudget.ok) {
      return NextResponse.json({ result: null, error: projectedBudget.reason ?? 'Query budget exceeded', budget: projectedBudget }, {
        status: 429,
        headers: { 'Retry-After': String(projectedBudget.retryAfterSeconds) },
      })
    }

    await recordSemanticQueryRun({
      supabase: auth.supabase,
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      datasetId: chart.datasetId,
      chartId: chart.id,
      dataSourceId,
      actorUserId: auth.userId,
      surface: 'client_chart',
      status: 'success',
      sql: compileResult.queryPlan.executableSql,
      rowCount: execution.rowCount,
      elapsedMs: execution.elapsedMs,
      timeoutMs: compileResult.queryPlan.limits.timeoutMs,
      warnings,
    })
    const cacheWrite = await setQueryResultCache(cacheKey, execution, DRAFT_RUNTIME_CACHE_TTL_SECONDS)

    return NextResponse.json({
      result: {
        chart: chartResult,
        dataset: { id: chart.datasetId, name: String(dataset.name ?? ''), status: 'draft' },
        warnings,
        cache: { hit: false, backend: cacheWrite.backend, ttlSeconds: cacheWrite.ttlSeconds },
        ...execution,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ result: null, error: message }, { status: 500 })
  }
}
