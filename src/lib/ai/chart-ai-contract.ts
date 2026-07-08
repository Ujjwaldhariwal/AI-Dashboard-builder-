import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { executePostgresReadOnlyQuery } from '@/lib/data-sources/postgres-runtime'
import {
  classifyFieldForAi,
  isFieldAllowedForAiPreview,
  isMetricAllowedForAi,
  sanitizedFieldDescriptor,
  sanitizedMetricDescriptor,
} from '@/lib/ai/field-classification'
import { compileDatasetQueryPlan } from '@/lib/semantic/dataset-query-compiler'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { selectionFromRecord, validateSemanticReferencesForModel } from '@/lib/semantic/semantic-hardening'
import type { DashboardChartConfig, DashboardChartEncoding } from '@/types/dashboard-chart'

export const AI_PREVIEW_MAX_ROWS = 10
export const AI_PREVIEW_MAX_COLUMNS = 6
export const AI_CHART_PATCH_SCHEMA_VERSION = 'dashboardos.ai.chart_patch.v1'

export const ChartAiPatchSchema = z.object({
  schemaVersion: z.literal(AI_CHART_PATCH_SCHEMA_VERSION).optional(),
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  templateId: z.string().min(2).max(80).optional(),
  encoding: z.object({
    xAxisFieldId: z.string().uuid().optional(),
    yMetricIds: z.array(z.string().uuid()).max(6).optional(),
    seriesFieldId: z.string().uuid().nullable().optional(),
    stackMetricIds: z.array(z.string().uuid()).max(6).optional(),
    tooltipFieldIds: z.array(z.string().uuid()).max(8).optional(),
    sort: z.object({
      byId: z.string().uuid(),
      direction: z.enum(['asc', 'desc']),
    }).nullable().optional(),
    limit: z.number().int().min(1).max(100).nullable().optional(),
    filters: z.array(z.object({
      fieldId: z.string().uuid(),
      operator: z.enum(['eq', 'not_eq', 'in', 'contains', 'gte', 'lte']),
      value: z.union([
        z.string().max(120),
        z.number(),
        z.boolean(),
        z.array(z.union([z.string().max(120), z.number(), z.boolean()])).min(1).max(12),
      ]),
    }).strict()).max(4).optional(),
  }).strict().optional(),
  presentation: z.object({
    size: z.enum(['compact', 'standard', 'wide', 'full']).optional(),
    showLegend: z.boolean().optional(),
    showLabels: z.boolean().optional(),
    valueFormat: z.string().max(80).nullable().optional(),
  }).strict().optional(),
}).strict()

export type ChartAiPatch = z.infer<typeof ChartAiPatchSchema>

export type ChartAiPatchParseResult =
  | { ok: true; patch: ChartAiPatch }
  | { ok: false; errorCode: 'schema_version_mismatch' | 'invalid_model_patch'; error: string; issues?: unknown }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function parseChartAiPatchPayload(value: unknown): ChartAiPatchParseResult {
  const record = asRecord(value)
  const schemaVersion = record.schemaVersion
  if (typeof schemaVersion === 'string' && schemaVersion !== AI_CHART_PATCH_SCHEMA_VERSION) {
    return {
      ok: false,
      errorCode: 'schema_version_mismatch',
      error: `Unsupported AI chart patch schema version. Expected ${AI_CHART_PATCH_SCHEMA_VERSION}.`,
    }
  }

  const parsed = ChartAiPatchSchema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'invalid_model_patch',
      error: 'AI patch failed schema validation',
      issues: parsed.error.flatten(),
    }
  }

  return { ok: true, patch: { ...parsed.data, schemaVersion: parsed.data.schemaVersion ?? AI_CHART_PATCH_SCHEMA_VERSION } }
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function metricFieldId(metric: Record<string, unknown>) {
  const expression = asRecord(metric.expression)
  return typeof expression.fieldId === 'string' ? expression.fieldId : ''
}

function labelForId(rows: Record<string, unknown>[], id: string) {
  const row = rows.find(item => String(item.id) === id)
  return row ? String(row.name ?? id) : id
}

export function buildAiChartContextAuditMetadata({
  purpose,
  datasetId,
  chartId,
  allowedFields,
  allowedMetrics,
  blockedFields,
  blockedMetrics,
  allFields,
  allMetrics,
  rowCount,
}: {
  purpose: string
  datasetId: string
  chartId?: string | null
  allowedFields: Record<string, unknown>[]
  allowedMetrics: Record<string, unknown>[]
  blockedFields: Record<string, unknown>[]
  blockedMetrics: Record<string, unknown>[]
  allFields: Record<string, unknown>[]
  allMetrics: Record<string, unknown>[]
  rowCount: number
}) {
  return {
    purpose,
    datasetId,
    chartId: chartId ?? null,
    allowedFieldsReturned: allowedFields.map(field => labelForId(allFields, String(field.id))),
    allowedMetricsReturned: allowedMetrics.map(metric => labelForId(allMetrics, String(metric.id))),
    blockedFieldsRequested: blockedFields.map(field => ({
      id: String(field.id),
      label: String(field.name ?? field.id),
      classification: classifyFieldForAi(field).classification,
    })),
    blockedMetricsRequested: blockedMetrics.map(metric => String(metric.name ?? metric.id)),
    rowCount,
    maxPreviewRows: AI_PREVIEW_MAX_ROWS,
    maxPreviewColumns: AI_PREVIEW_MAX_COLUMNS,
  }
}

function descriptorSearchTerms(value: Record<string, unknown>) {
  return [
    value.label,
    value.semanticKey,
    value.name,
    value.semantic_key,
  ].map(item => String(item ?? '').toLowerCase()).filter(item => item.length >= 3)
}

export function doesPromptReferenceBlockedAiDescriptors({
  instruction,
  blockedFields,
  blockedMetrics,
}: {
  instruction: string
  blockedFields: Record<string, unknown>[]
  blockedMetrics: Record<string, unknown>[]
}) {
  const normalized = instruction.toLowerCase()
  return [...blockedFields, ...blockedMetrics].some(descriptor => (
    descriptorSearchTerms(descriptor).some(term => normalized.includes(term))
  ))
}

function mapChart(row: Record<string, unknown>): DashboardChartConfig {
  const encoding = asRecord(row.encoding)
  const presentation = asRecord(row.presentation)
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    datasetId: String(row.dataset_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as DashboardChartConfig['status'],
    templateId: String(row.template_id) as DashboardChartConfig['templateId'],
    encoding: {
      xAxisFieldId: typeof encoding.xAxisFieldId === 'string' ? encoding.xAxisFieldId : undefined,
      yMetricIds: toStringArray(encoding.yMetricIds),
      seriesFieldId: typeof encoding.seriesFieldId === 'string' ? encoding.seriesFieldId : undefined,
      stackMetricIds: toStringArray(encoding.stackMetricIds),
      tooltipFieldIds: toStringArray(encoding.tooltipFieldIds),
      labelById: asRecord(encoding.labelById) as Record<string, string>,
      colorById: asRecord(encoding.colorById) as Record<string, string>,
      sort: encoding.sort && typeof encoding.sort === 'object' && !Array.isArray(encoding.sort)
        ? encoding.sort as DashboardChartEncoding['sort']
        : null,
      limit: typeof encoding.limit === 'number' ? encoding.limit : null,
      filters: Array.isArray(encoding.filters)
        ? encoding.filters as DashboardChartEncoding['filters']
        : [],
    },
    presentation: {
      size: typeof presentation.size === 'string'
        ? presentation.size as DashboardChartConfig['presentation']['size']
        : 'standard',
      showLegend: typeof presentation.showLegend === 'boolean' ? presentation.showLegend : true,
      showLabels: typeof presentation.showLabels === 'boolean' ? presentation.showLabels : false,
      valueFormat: typeof presentation.valueFormat === 'string' ? presentation.valueFormat : null,
    },
    interactions: asRecord(row.interactions) as DashboardChartConfig['interactions'],
    layout: asRecord(row.layout) as DashboardChartConfig['layout'],
    validationState: String(row.validation_state ?? 'unknown') as DashboardChartConfig['validationState'],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
  }
}

function mergeEncoding(current: DashboardChartEncoding, patch?: ChartAiPatch['encoding']): DashboardChartEncoding {
  if (!patch) return current
  return {
    ...current,
    ...patch,
    seriesFieldId: patch.seriesFieldId === null ? undefined : patch.seriesFieldId ?? current.seriesFieldId,
    yMetricIds: patch.yMetricIds ?? current.yMetricIds,
    stackMetricIds: patch.stackMetricIds ?? current.stackMetricIds ?? [],
    tooltipFieldIds: patch.tooltipFieldIds ?? current.tooltipFieldIds,
    labelById: current.labelById ?? {},
    colorById: current.colorById ?? {},
    sort: patch.sort === undefined ? current.sort ?? null : patch.sort,
    limit: patch.limit === undefined ? current.limit ?? null : patch.limit,
    filters: patch.filters ?? current.filters ?? [],
  }
}

export function applyChartAiPatch(chart: DashboardChartConfig, patch: ChartAiPatch): DashboardChartConfig {
  return {
    ...chart,
    name: patch.name ?? chart.name,
    description: patch.description === undefined ? chart.description ?? null : patch.description,
    templateId: (patch.templateId ?? chart.templateId) as DashboardChartConfig['templateId'],
    encoding: mergeEncoding(chart.encoding, patch.encoding),
    presentation: {
      ...chart.presentation,
      ...(patch.presentation ?? {}),
    },
  }
}

export function serializeGovernedAiChartContext<
  T extends Awaited<ReturnType<typeof buildGovernedAiChartContext>>,
>(context: T) {
  const {
    allowedFieldIds: _allowedFieldIds,
    allowedMetricIds: _allowedMetricIds,
    fields: _fields,
    metrics: _metrics,
    blockedFields,
    blockedMetrics,
    ...publicContext
  } = context

  return {
    ...publicContext,
    blockedFieldCount: blockedFields.length,
    blockedMetricCount: blockedMetrics.length,
  }
}

export function validateChartAiPatchAgainstAllowlist({
  currentChart,
  patch,
  allowedFieldIds,
  allowedMetricIds,
  fields,
  metrics,
}: {
  currentChart: DashboardChartConfig
  patch: ChartAiPatch
  allowedFieldIds: Set<string>
  allowedMetricIds: Set<string>
  fields: Record<string, unknown>[]
  metrics: Record<string, unknown>[]
}) {
  const nextChart = applyChartAiPatch(currentChart, patch)
  const idsToCheck = [
    nextChart.encoding.xAxisFieldId,
    nextChart.encoding.seriesFieldId,
    nextChart.encoding.sort?.byId,
    ...(nextChart.encoding.filters ?? []).map(filter => filter.fieldId),
    ...(nextChart.encoding.tooltipFieldIds ?? []),
  ].filter(Boolean) as string[]
  const metricIdsToCheck = [
    ...(nextChart.encoding.yMetricIds ?? []),
    ...(nextChart.encoding.stackMetricIds ?? []),
  ]

  const blockedFields = idsToCheck.filter(id => !allowedFieldIds.has(id) && !allowedMetricIds.has(id))
  const blockedMetrics = metricIdsToCheck.filter(id => !allowedMetricIds.has(id))
  if (blockedFields.length > 0 || blockedMetrics.length > 0) {
    return {
      ok: false as const,
      nextChart,
      error: 'AI patch referenced fields or metrics outside the AI allowlist',
      blockedIds: [...blockedFields, ...blockedMetrics],
    }
  }

  const validation = validateDashboardChartConfig({
    templateId: nextChart.templateId,
    encoding: nextChart.encoding,
    fields,
    metrics,
  })
  if (validation.state === 'invalid') {
    return {
      ok: false as const,
      nextChart,
      error: 'AI patch failed chart validation',
      validation,
      blockedIds: [],
    }
  }

  return { ok: true as const, nextChart, validation, blockedIds: [] }
}

export async function buildGovernedAiChartContext({
  supabase,
  tenantId,
  projectId,
  datasetId,
  chartId,
  actorUserId,
  purpose,
  includePreview = false,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  datasetId?: string
  chartId?: string
  actorUserId: string
  purpose: string
  includePreview?: boolean
}) {
  const { data: chartRow, error: chartError } = chartId
    ? await supabase
      .from('dashboard_chart_configs')
      .select('*')
      .eq('id', chartId)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .single()
    : { data: null, error: null }

  if (chartError) throw new Error(chartError.message)
  const chart = chartRow ? mapChart(chartRow as Record<string, unknown>) : null
  const resolvedDatasetId = datasetId ?? chart?.datasetId
  if (!resolvedDatasetId) throw new Error('datasetId or chartId is required')

  const { data: datasetRow, error: datasetError } = await supabase
    .from('semantic_datasets')
    .select('*')
    .eq('id', resolvedDatasetId)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .single()

  if (datasetError || !datasetRow) throw new Error(datasetError?.message ?? 'Dataset not found')
  const dataset = datasetRow as Record<string, unknown>
  const semanticValidation = await validateSemanticReferencesForModel({
    supabase,
    tenantId,
    projectId,
    modelId: String(dataset.model_id),
    selection: selectionFromRecord(dataset.selection),
  })
  if (!semanticValidation.ok) throw new Error(semanticValidation.error ?? 'Semantic references failed validation')

  const fields = semanticValidation.fields
  const metrics = semanticValidation.metrics
  const relationships = semanticValidation.relationships
  const metricSourceFields = semanticValidation.metricSourceFields
  const fieldById = new Map([...fields, ...metricSourceFields].map(field => [String(field.id), field]))
  const allowedFields = fields.filter(isFieldAllowedForAiPreview)
  const blockedFields = fields.filter(field => !isFieldAllowedForAiPreview(field))
  const allowedMetrics = metrics.filter(metric => isMetricAllowedForAi(metric, fieldById.get(metricFieldId(metric))))
  const blockedMetrics = metrics.filter(metric => !isMetricAllowedForAi(metric, fieldById.get(metricFieldId(metric))))
  const allowedFieldIds = new Set(allowedFields.map(field => String(field.id)))
  const allowedMetricIds = new Set(allowedMetrics.map(metric => String(metric.id)))

  let preview: null | {
    rows: Record<string, unknown>[]
    fields: string[]
    rowCount: number
    elapsedMs: number
    warnings: string[]
  } = null
  const previewWarnings: string[] = []

  if (includePreview && (allowedFields.length > 0 || allowedMetrics.length > 0)) {
    const previewFields = allowedFields.slice(0, AI_PREVIEW_MAX_COLUMNS)
    const previewMetrics = allowedMetrics.slice(0, Math.max(0, AI_PREVIEW_MAX_COLUMNS - previewFields.length))
    const compileResult = compileDatasetQueryPlan({
      fields: previewFields,
      metrics: previewMetrics,
      relationships,
      metricSourceFields,
    })
    previewWarnings.push(...compileResult.warnings)
    if (compileResult.queryPlan.executableSql && compileResult.dataSourceId) {
      const { data: sourceRow, error: sourceError } = await supabase
        .from('data_sources')
        .select('id, credential_ciphertext, status')
        .eq('id', compileResult.dataSourceId)
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
        .single()
      if (sourceError) throw new Error(sourceError.message)
      if (sourceRow.status === 'active') {
        const result = await executePostgresReadOnlyQuery(
          String(sourceRow.credential_ciphertext),
          compileResult.queryPlan.executableSql,
          {
            poolKey: `ai-preview:${String(sourceRow.id)}`,
            queryTimeoutMs: Math.min(compileResult.queryPlan.limits.timeoutMs, 8_000),
          },
        )
        const allowedLabels = new Set([
          ...previewFields.map(field => String(field.name ?? field.id)),
          ...previewMetrics.map(metric => String(metric.name ?? metric.id)),
        ])
        preview = {
          rows: result.rows.slice(0, AI_PREVIEW_MAX_ROWS).map(row => Object.fromEntries(
            Object.entries(row).filter(([key]) => allowedLabels.has(key)),
          )),
          fields: result.fields.map(field => String(field.name)).filter(name => allowedLabels.has(name)),
          rowCount: Math.min(result.rowCount, AI_PREVIEW_MAX_ROWS),
          elapsedMs: result.elapsedMs,
          warnings: previewWarnings,
        }
      }
    }
  }

  const nowIso = new Date().toISOString()
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    project_id: projectId,
    actor_user_id: actorUserId,
    action: 'ai.chart_context.requested',
    target_type: chartId ? 'dashboard_chart_config' : 'semantic_dataset',
    target_id: chartId ?? resolvedDatasetId,
    metadata: buildAiChartContextAuditMetadata({
      purpose,
      datasetId: resolvedDatasetId,
      chartId,
      allowedFields,
      allowedMetrics,
      blockedFields,
      blockedMetrics,
      allFields: fields,
      allMetrics: metrics,
      rowCount: preview?.rowCount ?? 0,
    }),
    created_at: nowIso,
  })

  return {
    contractVersion: 'dashboardos.ai.chart_context.v1',
    purpose,
    tenantId,
    projectId,
    dataset: {
      id: String(dataset.id),
      name: String(dataset.name ?? ''),
      status: String(dataset.status ?? ''),
    },
    chart,
    allowedFields: allowedFields.map(sanitizedFieldDescriptor),
    allowedMetrics: allowedMetrics.map(metric => sanitizedMetricDescriptor(metric, fieldById.get(metricFieldId(metric)))),
    blockedFields: blockedFields.map(sanitizedFieldDescriptor),
    blockedMetrics: blockedMetrics.map(metric => sanitizedMetricDescriptor(metric, fieldById.get(metricFieldId(metric)))),
    preview,
    allowedFieldIds,
    allowedMetricIds,
    fields,
    metrics,
  }
}
