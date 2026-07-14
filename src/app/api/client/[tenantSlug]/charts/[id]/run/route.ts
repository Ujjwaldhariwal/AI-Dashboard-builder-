import { NextResponse } from 'next/server'

import { executePostgresReadOnlyQuery } from '@/lib/data-sources/postgres-runtime'
import { requireDashboardEntitlement } from '@/lib/security/entitlements'
import { accessContext, requireTenantAccess } from '@/lib/security/project-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { compileDatasetQueryPlan } from '@/lib/semantic/dataset-query-compiler'
import { checkQueryBudget } from '@/lib/semantic/query-budget-policy'
import { getQueryResultCache, queryResultCacheKey, setQueryResultCache } from '@/lib/semantic/query-result-cache'
import { recordSemanticQueryRun } from '@/lib/semantic/query-runtime-telemetry'
import {
  mapReleasedChartConfig,
  mapDashboardReleaseChartSnapshot,
  mapDashboardReleaseDatasetSnapshot,
  releasedDatasetCacheTtl,
  releasedSourceSchemaHash,
  resolveReleasedSemanticReferences,
} from '@/lib/publishing/dashboard-release-snapshots'
import { getAuthedSupabase } from '@/lib/supabase/server'

function labelForId(rows: Record<string, unknown>[], id?: string) {
  if (!id) return ''
  const row = rows.find(item => String(item.id) === id)
  return row ? String(row.name ?? id) : id
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ tenantSlug: string; id: string }> },
) {
  const { tenantSlug, id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ result: null, error: 'Unauthorized' }, { status: 401 })

    const rateLimit = await checkRuntimeRateLimit({
      key: `client-chart:${tenantSlug}:${id}:${auth.userId}`,
      maxRequests: 60,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { result: null, error: 'Too many chart runtime requests. Please retry shortly.' },
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

    const { data: releaseChartRow, error: releaseChartError } = await auth.supabase
      .from('dashboard_release_chart_snapshots')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .single()

    if (releaseChartError || !releaseChartRow) {
      return NextResponse.json({ result: null, error: 'Released chart not found' }, { status: 404 })
    }

    const releaseChart = mapDashboardReleaseChartSnapshot(releaseChartRow as Record<string, unknown>)
    const { data: dashboardRow, error: dashboardError } = await auth.supabase
      .from('published_dashboards')
      .select('id, current_version_id, status')
      .eq('id', releaseChart.dashboardId)
      .eq('tenant_id', tenant.id)
      .eq('project_id', releaseChart.projectId)
      .eq('status', 'published')
      .single()

    if (dashboardError || !dashboardRow
      || String(dashboardRow.current_version_id ?? '') !== releaseChart.versionId) {
      return NextResponse.json({ result: null, error: 'Released chart is not part of the active dashboard release' }, { status: 404 })
    }

    const entitlement = await requireDashboardEntitlement({
      supabase: auth.supabase,
      userId: auth.userId,
      platformRole: auth.role,
      tenantId: String(tenant.id),
      projectId: releaseChart.projectId,
      dashboardId: releaseChart.dashboardId,
      access: 'view',
    })
    if (!entitlement.ok) {
      return NextResponse.json({ result: null, error: 'Dashboard entitlement is required' }, { status: 403 })
    }

    const { data: releaseDatasetRow, error: releaseDatasetError } = await auth.supabase
      .from('dashboard_release_dataset_snapshots')
      .select('*')
      .eq('id', releaseChart.datasetSnapshotId)
      .eq('tenant_id', tenant.id)
      .eq('project_id', releaseChart.projectId)
      .eq('dashboard_id', releaseChart.dashboardId)
      .eq('version_id', releaseChart.versionId)
      .single()

    if (releaseDatasetError || !releaseDatasetRow) {
      return NextResponse.json({ result: null, error: 'Released dataset snapshot not found' }, { status: 404 })
    }

    const releaseDataset = mapDashboardReleaseDatasetSnapshot(releaseDatasetRow as Record<string, unknown>)
    const chart = mapReleasedChartConfig(releaseChart)
    const dataset = releaseDataset.datasetConfig
    const telemetryDatasetId = releaseDataset.sourceDatasetId
    const telemetryChartId = releaseChart.sourceChartConfigId
    const semanticValidation = resolveReleasedSemanticReferences(releaseDataset)
    if (!semanticValidation.ok) {
      return NextResponse.json({ result: null, error: semanticValidation.error }, { status: 422 })
    }

    const fields = semanticValidation.fields
    const metrics = semanticValidation.metrics
    const relationships = semanticValidation.relationships
    const validation = validateDashboardChartConfig({
      templateId: chart.templateId,
      encoding: chart.encoding,
      fields,
      metrics,
    })

    if (validation.state !== 'valid') {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: telemetryDatasetId,
        chartId: telemetryChartId,
        actorUserId: auth.userId,
        surface: 'client_chart',
        status: 'error',
        errorMessage: 'Published chart config is no longer valid',
        warnings: validation.issues.map(issue => issue.message),
      })
      return NextResponse.json({
        result: null,
        error: 'Published chart config is no longer valid',
        validation,
      }, { status: 422 })
    }

    const compileResult = compileDatasetQueryPlan({
      fields,
      metrics,
      relationships,
      metricSourceFields: semanticValidation.metricSourceFields,
      filters: chart.encoding.filters ?? [],
    })

    if (!compileResult.queryPlan.executableSql || !compileResult.dataSourceId) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: telemetryDatasetId,
        chartId: telemetryChartId,
        actorUserId: auth.userId,
        surface: 'client_chart',
        status: 'error',
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: 'Published chart dataset is not executable yet',
        warnings: compileResult.warnings,
      })
      return NextResponse.json({
        result: null,
        error: 'Published chart dataset is not executable yet',
        warnings: compileResult.warnings,
      }, { status: 422 })
    }

    const { data: sourceRow, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, credential_ciphertext, status, schema_hash')
      .eq('id', compileResult.dataSourceId)
      .eq('tenant_id', tenant.id)
      .eq('project_id', chart.projectId)
      .single()

    if (sourceError || !sourceRow) {
      return NextResponse.json({ result: null, error: sourceError?.message ?? 'Released data source not found' }, { status: 404 })
    }
    if (sourceRow.status !== 'active') {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: telemetryDatasetId,
        chartId: telemetryChartId,
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_chart',
        status: 'error',
        sql: compileResult.queryPlan.executableSql,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: 'Data source is not active',
        warnings: compileResult.warnings,
      })
      return NextResponse.json({ result: null, error: 'Data source is not active' }, { status: 409 })
    }

    const expectedSchemaHash = releasedSourceSchemaHash(releaseDataset, compileResult.dataSourceId)
    const currentSchemaHash = typeof sourceRow.schema_hash === 'string' ? sourceRow.schema_hash : null
    if (!expectedSchemaHash || !currentSchemaHash || expectedSchemaHash !== currentSchemaHash) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: telemetryDatasetId,
        chartId: telemetryChartId,
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_chart',
        status: 'error',
        sql: compileResult.queryPlan.executableSql,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        errorMessage: 'Released semantic inputs no longer match the active source schema',
        warnings: compileResult.warnings,
      })
      return NextResponse.json({
        result: null,
        error: 'This release is blocked because its captured semantic inputs do not match the active source schema. Publish a validated replacement release.',
      }, { status: 409 })
    }

    const cacheKey = queryResultCacheKey({
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      datasetId: chart.datasetId,
      chartId: chart.id,
      dataSourceId: compileResult.dataSourceId,
      sql: compileResult.queryPlan.executableSql,
      parameters: compileResult.parameters,
      datasetUpdatedAt: releaseDataset.createdAt,
      chartUpdatedAt: releaseChart.createdAt,
      schemaHash: currentSchemaHash,
    })
    const cached = await getQueryResultCache<Awaited<ReturnType<typeof executePostgresReadOnlyQuery>>>(cacheKey)
    if (cached.hit && cached.value) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: telemetryDatasetId,
        chartId: telemetryChartId,
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_chart',
        status: 'success',
        sql: compileResult.queryPlan.executableSql,
        rowCount: cached.value.rowCount,
        elapsedMs: 0,
        timeoutMs: compileResult.queryPlan.limits.timeoutMs,
        warnings: [...compileResult.warnings, `cache_hit:${cached.backend}`],
      })

      return NextResponse.json({
        result: {
          chart: {
            id: chart.id,
            name: chart.name,
            templateId: chart.templateId,
            encoding: chart.encoding,
            presentation: chart.presentation,
            layout: chart.layout,
            resolved: {
              xField: labelForId(fields, chart.encoding.xAxisFieldId),
              yFields: chart.encoding.yMetricIds.map(metricId => labelForId(metrics, metricId)).filter(Boolean),
              tooltipFields: chart.encoding.tooltipFieldIds.map(itemId => (
                labelForId(fields, itemId) || labelForId(metrics, itemId)
              )).filter(Boolean),
              sortField: labelForId([...fields, ...metrics], chart.encoding.sort?.byId),
            },
          },
          dataset: {
            id: releaseDataset.id,
            sourceId: releaseDataset.sourceDatasetId,
            name: String(dataset.name ?? ''),
            status: 'released',
          },
          warnings: compileResult.warnings,
          cache: { hit: true, backend: cached.backend },
          ...cached.value,
        },
      })
    }

    const budget = await checkQueryBudget({
      supabase: auth.supabase,
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      dataSourceId: compileResult.dataSourceId,
    })
    if (!budget.ok) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: telemetryDatasetId,
        chartId: telemetryChartId,
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_chart',
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

    let execution: Awaited<ReturnType<typeof executePostgresReadOnlyQuery>>
    try {
      execution = await executePostgresReadOnlyQuery(
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
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: telemetryDatasetId,
        chartId: telemetryChartId,
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_chart',
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
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      dataSourceId: compileResult.dataSourceId,
      projection: {
        queries: 1,
        rows: execution.rowCount,
        elapsedMs: execution.elapsedMs,
      },
    })
    if (!projectedBudget.ok) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: telemetryDatasetId,
        chartId: telemetryChartId,
        dataSourceId: compileResult.dataSourceId,
        actorUserId: auth.userId,
        surface: 'client_chart',
        status: 'error',
        sql: compileResult.queryPlan.executableSql,
        rowCount: execution.rowCount,
        elapsedMs: execution.elapsedMs,
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
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      datasetId: telemetryDatasetId,
      chartId: telemetryChartId,
      dataSourceId: compileResult.dataSourceId,
      actorUserId: auth.userId,
      surface: 'client_chart',
      status: 'success',
      sql: compileResult.queryPlan.executableSql,
      rowCount: execution.rowCount,
      elapsedMs: execution.elapsedMs,
      timeoutMs: compileResult.queryPlan.limits.timeoutMs,
      warnings: compileResult.warnings,
    })
    const cacheWrite = await setQueryResultCache(cacheKey, execution, releasedDatasetCacheTtl(releaseDataset))

    return NextResponse.json({
      result: {
        chart: {
          id: chart.id,
          name: chart.name,
          templateId: chart.templateId,
          encoding: chart.encoding,
          presentation: chart.presentation,
          layout: chart.layout,
          resolved: {
            xField: labelForId(fields, chart.encoding.xAxisFieldId),
            yFields: chart.encoding.yMetricIds.map(metricId => labelForId(metrics, metricId)).filter(Boolean),
            tooltipFields: chart.encoding.tooltipFieldIds.map(itemId => (
              labelForId(fields, itemId) || labelForId(metrics, itemId)
            )).filter(Boolean),
            sortField: labelForId([...fields, ...metrics], chart.encoding.sort?.byId),
          },
        },
        dataset: {
          id: releaseDataset.id,
          sourceId: releaseDataset.sourceDatasetId,
          name: String(dataset.name ?? ''),
          status: 'released',
        },
        warnings: compileResult.warnings,
        cache: { hit: false, backend: cacheWrite.backend, ttlSeconds: cacheWrite.ttlSeconds },
        ...execution,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ result: null, error: message }, { status: 500 })
  }
}
