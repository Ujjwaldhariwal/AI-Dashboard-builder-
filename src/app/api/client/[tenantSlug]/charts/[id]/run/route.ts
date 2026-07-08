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
import { selectionFromRecord, validateSemanticReferencesForModel } from '@/lib/semantic/semantic-hardening'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DashboardChartConfig, DashboardChartEncoding } from '@/types/dashboard-chart'

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asEncoding(value: unknown): DashboardChartEncoding {
  const record = asRecord(value)
  return {
    xAxisFieldId: typeof record.xAxisFieldId === 'string' ? record.xAxisFieldId : undefined,
    yMetricIds: toStringArray(record.yMetricIds),
    seriesFieldId: typeof record.seriesFieldId === 'string' ? record.seriesFieldId : undefined,
    stackMetricIds: toStringArray(record.stackMetricIds),
    tooltipFieldIds: toStringArray(record.tooltipFieldIds),
    labelById: asRecord(record.labelById) as Record<string, string>,
    colorById: asRecord(record.colorById) as Record<string, string>,
    sort: asRecord(record.sort) as DashboardChartEncoding['sort'],
    limit: typeof record.limit === 'number' ? record.limit : null,
    filters: Array.isArray(record.filters)
      ? record.filters as DashboardChartEncoding['filters']
      : [],
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
    status: String(row.status ?? 'published') as DashboardChartConfig['status'],
    templateId: String(row.template_id) as DashboardChartConfig['templateId'],
    encoding: asEncoding(row.encoding),
    presentation: {
      size: String(asRecord(row.presentation).size ?? 'standard') as DashboardChartConfig['presentation']['size'],
      showLegend: asRecord(row.presentation).showLegend !== false,
      showLabels: asRecord(row.presentation).showLabels === true,
      valueFormat: typeof asRecord(row.presentation).valueFormat === 'string' ? String(asRecord(row.presentation).valueFormat) : null,
    },
    interactions: asRecord(row.interactions) as DashboardChartConfig['interactions'],
    layout: asRecord(row.layout) as DashboardChartConfig['layout'],
    validationState: String(row.validation_state ?? 'valid') as DashboardChartConfig['validationState'],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
  }
}

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

    const { data: chartRow, error: chartError } = await auth.supabase
      .from('dashboard_chart_configs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .eq('status', 'published')
      .eq('validation_state', 'valid')
      .single()

    if (chartError || !chartRow) {
      return NextResponse.json({ result: null, error: 'Published chart not found' }, { status: 404 })
    }

    const chart = mapChart(chartRow as Record<string, unknown>)
    const { data: slots, error: slotsError } = await auth.supabase
      .from('dashboard_chart_slots')
      .select('dashboard_id, version_id')
      .eq('tenant_id', tenant.id)
      .eq('project_id', chart.projectId)
      .eq('chart_config_id', chart.id)

    if (slotsError) return NextResponse.json({ result: null, error: slotsError.message }, { status: 500 })
    const slotRows = (slots ?? []) as Record<string, unknown>[]
    const dashboardIds = Array.from(new Set(slotRows.map(slot => String(slot.dashboard_id ?? '')).filter(Boolean)))
    const { data: dashboards, error: dashboardsError } = dashboardIds.length > 0
      ? await auth.supabase
        .from('published_dashboards')
        .select('id, current_version_id')
        .eq('tenant_id', tenant.id)
        .eq('project_id', chart.projectId)
        .eq('status', 'published')
        .in('id', dashboardIds)
      : { data: [], error: null }

    if (dashboardsError) return NextResponse.json({ result: null, error: dashboardsError.message }, { status: 500 })
    const currentVersionByDashboard = new Map(((dashboards ?? []) as Record<string, unknown>[])
      .map(dashboard => [String(dashboard.id), String(dashboard.current_version_id ?? '')]))
    const eligibleDashboardIds = Array.from(new Set(slotRows
      .filter(slot => currentVersionByDashboard.get(String(slot.dashboard_id)) === String(slot.version_id))
      .map(slot => String(slot.dashboard_id))))

    let authorizedDashboardId: string | null = null
    for (const dashboardId of eligibleDashboardIds) {
      const entitlement = await requireDashboardEntitlement({
        supabase: auth.supabase,
        userId: auth.userId,
        platformRole: auth.role,
        tenantId: String(tenant.id),
        projectId: chart.projectId,
        dashboardId,
        access: 'view',
      })
      if (entitlement.ok) {
        authorizedDashboardId = dashboardId
        break
      }
    }
    if (!authorizedDashboardId) {
      return NextResponse.json({ result: null, error: 'Dashboard entitlement is required' }, { status: 403 })
    }

    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('*')
      .eq('id', chart.datasetId)
      .eq('tenant_id', tenant.id)
      .eq('status', 'published')
      .single()

    if (datasetError || !datasetRow) {
      return NextResponse.json({ result: null, error: 'Published dataset not found' }, { status: 404 })
    }

    const dataset = datasetRow as Record<string, unknown>
    const cachePolicy = dataset.cache_policy && typeof dataset.cache_policy === 'object'
      ? dataset.cache_policy as Record<string, unknown>
      : {}
    const semanticValidation = await validateSemanticReferencesForModel({
      supabase: auth.supabase,
      tenantId: String(tenant.id),
      projectId: chart.projectId,
      modelId: String(dataset.model_id),
      selection: selectionFromRecord(dataset.selection),
    })
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
        datasetId: chart.datasetId,
        chartId: chart.id,
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
        datasetId: chart.datasetId,
        chartId: chart.id,
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

    if (sourceError) return NextResponse.json({ result: null, error: sourceError.message }, { status: 404 })
    if (sourceRow.status !== 'active') {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: chart.datasetId,
        chartId: chart.id,
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

    const cacheKey = queryResultCacheKey({
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      datasetId: chart.datasetId,
      chartId: chart.id,
      dataSourceId: compileResult.dataSourceId,
      sql: compileResult.queryPlan.executableSql,
      parameters: compileResult.parameters,
      datasetUpdatedAt: typeof dataset.updated_at === 'string' ? dataset.updated_at : null,
      chartUpdatedAt: chart.updatedAt,
      schemaHash: typeof sourceRow.schema_hash === 'string' ? sourceRow.schema_hash : null,
    })
    const cached = await getQueryResultCache<Awaited<ReturnType<typeof executePostgresReadOnlyQuery>>>(cacheKey)
    if (cached.hit && cached.value) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: chart.datasetId,
        chartId: chart.id,
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
      tenantId: chart.tenantId,
      projectId: chart.projectId,
      dataSourceId: compileResult.dataSourceId,
    })
    if (!budget.ok) {
      await recordSemanticQueryRun({
        supabase: auth.supabase,
        tenantId: chart.tenantId,
        projectId: chart.projectId,
        datasetId: chart.datasetId,
        chartId: chart.id,
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
        datasetId: chart.datasetId,
        chartId: chart.id,
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
        datasetId: chart.datasetId,
        chartId: chart.id,
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
      datasetId: chart.datasetId,
      chartId: chart.id,
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
    const cacheWrite = await setQueryResultCache(cacheKey, execution, cachePolicy.ttlSeconds)

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
          id: String(dataset.id),
          name: String(dataset.name ?? ''),
          status: String(dataset.status ?? 'published'),
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
