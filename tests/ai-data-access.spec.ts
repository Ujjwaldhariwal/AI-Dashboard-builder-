import { expect, test } from '@playwright/test'

import {
  AI_CHART_PATCH_SCHEMA_VERSION,
  ChartAiPatchSchema,
  applyChartAiPatch,
  buildAiChartContextAuditMetadata,
  doesPromptReferenceBlockedAiDescriptors,
  parseChartAiPatchPayload,
  validateChartAiPatchAgainstAllowlist,
} from '../src/lib/ai/chart-ai-contract'
import {
  buildAiChartRefinementRolloutAuditMetadata,
  createEnvAiChartRefinementGatePolicy,
  inspectAiChartRefinementGatePolicy,
  resolveAiChartRefinementGate,
  resolveAiChartRefinementGateFromDbPolicies,
} from '../src/lib/ai/chart-refinement-gate'
import {
  buildAiChartRefinementEventMetadata,
  classifyAiChartRefinementPrompt,
  summarizeAiChartRefinementMetrics,
} from '../src/lib/ai/chart-refinement-observability'
import { compileDatasetQueryPlan } from '../src/lib/semantic/dataset-query-compiler'
import { queryResultCacheKey } from '../src/lib/semantic/query-result-cache'
import {
  buildAiChartExamplePrompts,
  canRenderAiChartPreview,
  describeAiChartDiff,
  type AiChartContext,
} from '../src/components/platform/ai-chart-refinement-dialog'
import { aiRolloutPolicyStateLabel } from '../src/components/platform/dashboard-charts-admin-panel'
import {
  classifyFieldForAi,
  isFieldAllowedForAiPreview,
  isMetricAllowedForAi,
  sanitizedFieldDescriptor,
  sanitizedMetricDescriptor,
} from '../src/lib/ai/field-classification'
import type { DashboardChartConfig } from '../src/types/dashboard-chart'

const safeCityField = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'City',
  semantic_key: 'customer.city',
  role: 'dimension',
  source_column: {
    dataSourceId: '99999999-9999-4999-8999-999999999998',
    dataType: 'text',
    schemaName: 'public',
    tableName: 'electricity_customers',
    columnName: 'city',
  },
}

const piiNameField = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Customer Name',
  semantic_key: 'customer.name',
  role: 'dimension',
  source_column: {
    dataSourceId: '99999999-9999-4999-8999-999999999998',
    dataType: 'text',
    schemaName: 'public',
    tableName: 'electricity_customers',
    columnName: 'customer_name',
  },
}

const billAmountField = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Bill Amount',
  semantic_key: 'reading.bill_amount',
  role: 'metric_source',
  source_column: {
    dataSourceId: '99999999-9999-4999-8999-999999999998',
    dataType: 'numeric',
    schemaName: 'public',
    tableName: 'electricity_readings',
    columnName: 'bill_amount',
  },
}

const billMetric = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Total Bill Amount',
  semantic_key: 'metric.total_bill_amount',
  aggregation: 'sum',
  expression: { fieldId: billAmountField.id },
}

const currentChart: DashboardChartConfig = {
  id: '55555555-5555-4555-8555-555555555555',
  tenantId: '66666666-6666-4666-8666-666666666666',
  projectId: '77777777-7777-4777-8777-777777777777',
  datasetId: '88888888-8888-4888-8888-888888888888',
  name: 'Billing by City',
  description: null,
  status: 'draft',
  templateId: 'bar',
  encoding: {
    xAxisFieldId: safeCityField.id,
    yMetricIds: [billMetric.id],
    tooltipFieldIds: [],
    labelById: {},
    colorById: {},
    sort: null,
    limit: null,
  },
  presentation: {
    size: 'standard',
    showLegend: true,
    showLabels: false,
    valueFormat: null,
  },
  interactions: {},
  layout: { order: 0, gridSpan: 2 },
  validationState: 'valid',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
}

test.describe('AI data access guardrails', () => {
  test('blocks sensitive fields from AI preview descriptors', () => {
    expect(classifyFieldForAi(piiNameField).classification).toBe('pii_blocked')
    expect(isFieldAllowedForAiPreview(piiNameField)).toBe(false)

    const descriptor = sanitizedFieldDescriptor(piiNameField)
    expect(descriptor.allowedInPreview).toBe(false)
    expect(JSON.stringify(descriptor)).not.toContain('electricity_customers')
    expect(JSON.stringify(descriptor)).not.toContain('customer_name')
  })

  test('allows financial values only as aggregated metrics', () => {
    expect(classifyFieldForAi(billAmountField).classification).toBe('aggregated_only')
    expect(isFieldAllowedForAiPreview(billAmountField)).toBe(false)
    expect(isMetricAllowedForAi(billMetric, billAmountField)).toBe(true)

    const descriptor = sanitizedMetricDescriptor(billMetric, billAmountField)
    expect(descriptor.classification).toBe('aggregated_only')
    expect(descriptor.allowedInPreview).toBe(true)
  })

  test('rejects arbitrary fields in structured chart patches without mutating the current chart', () => {
    const patch = ChartAiPatchSchema.parse({
      encoding: {
        xAxisFieldId: piiNameField.id,
        yMetricIds: [billMetric.id],
      },
    })

    const result = validateChartAiPatchAgainstAllowlist({
      currentChart,
      patch,
      allowedFieldIds: new Set([safeCityField.id]),
      allowedMetricIds: new Set([billMetric.id]),
      fields: [safeCityField],
      metrics: [billMetric],
    })

    expect(result.ok).toBe(false)
    expect(currentChart.encoding.xAxisFieldId).toBe(safeCityField.id)
  })

  test('rejects SQL or component generation in AI patches', () => {
    const parsed = ChartAiPatchSchema.safeParse({
      encoding: {
        yMetricIds: [billMetric.id],
      },
      sql: 'select * from electricity_customers',
      component: 'CustomReactChart',
    })

    expect(parsed.success).toBe(false)
    expect(applyChartAiPatch(currentChart, { name: 'Updated Billing' }).name).toBe('Updated Billing')
  })

  test('builds an audit payload for AI context requests', () => {
    const metadata = buildAiChartContextAuditMetadata({
      purpose: 'chart_refinement',
      datasetId: currentChart.datasetId,
      chartId: currentChart.id,
      allowedFields: [safeCityField],
      allowedMetrics: [billMetric],
      blockedFields: [piiNameField],
      blockedMetrics: [],
      allFields: [safeCityField, piiNameField],
      allMetrics: [billMetric],
      rowCount: 4,
    })

    expect(metadata).toMatchObject({
      purpose: 'chart_refinement',
      datasetId: currentChart.datasetId,
      chartId: currentChart.id,
      allowedFieldsReturned: ['City'],
      allowedMetricsReturned: ['Total Bill Amount'],
      rowCount: 4,
      maxPreviewRows: 10,
      maxPreviewColumns: 6,
    })
    expect(metadata.blockedFieldsRequested).toEqual([{
      id: piiNameField.id,
      label: 'Customer Name',
      classification: 'pii_blocked',
    }])
  })

  test('detects blocked-field prompts before model refinement', () => {
    expect(doesPromptReferenceBlockedAiDescriptors({
      instruction: 'Group this by customer name',
      blockedFields: [sanitizedFieldDescriptor(piiNameField)],
      blockedMetrics: [],
    })).toBe(true)

    expect(doesPromptReferenceBlockedAiDescriptors({
      instruction: 'Group this by city',
      blockedFields: [sanitizedFieldDescriptor(piiNameField)],
      blockedMetrics: [],
    })).toBe(false)
  })

  test('supports valid prompt preview then deterministic patch apply', () => {
    const patch = ChartAiPatchSchema.parse({
      name: 'Monthly Billing Trend',
      templateId: 'bar',
      encoding: {
        xAxisFieldId: safeCityField.id,
        yMetricIds: [billMetric.id],
        limit: 6,
      },
    })

    const preview = validateChartAiPatchAgainstAllowlist({
      currentChart,
      patch,
      allowedFieldIds: new Set([safeCityField.id]),
      allowedMetricIds: new Set([billMetric.id]),
      fields: [safeCityField],
      metrics: [billMetric],
    })
    expect(preview.ok).toBe(true)

    const applied = applyChartAiPatch(currentChart, patch)
    expect(applied.name).toBe('Monthly Billing Trend')
    expect(applied.templateId).toBe('bar')
    expect(applied.encoding.limit).toBe(6)
    expect(currentChart.name).toBe('Billing by City')
  })

  test('builds AI prompt suggestions only from allowed fields and metrics', () => {
    const context: AiChartContext = {
      contractVersion: 'dashboardos.ai.chart_context.v1',
      dataset: { id: currentChart.datasetId, name: 'Electricity Operations', status: 'published' },
      chart: currentChart,
      allowedFields: [sanitizedFieldDescriptor(safeCityField)],
      allowedMetrics: [sanitizedMetricDescriptor(billMetric, billAmountField)],
      blockedFieldCount: 1,
      blockedMetricCount: 0,
    }

    const prompts = buildAiChartExamplePrompts(currentChart, context)
    expect(prompts.join(' ')).toContain('City')
    expect(prompts.join(' ')).toContain('Total Bill Amount')
    expect(prompts.join(' ')).not.toContain('Customer Name')

    const nextChart = applyChartAiPatch(currentChart, { name: 'Monthly Billing Trend', templateId: 'line' })
    const diff = describeAiChartDiff({ before: currentChart, after: nextChart, context })
    expect(diff).toEqual(expect.arrayContaining([
      { label: 'Title', before: 'Billing by City', after: 'Monthly Billing Trend' },
      { label: 'Chart type', before: 'bar', after: 'line' },
    ]))
  })

  test('validates narrow AI filter patches against allowed fields only', () => {
    const safePatch = ChartAiPatchSchema.parse({
      encoding: {
        filters: [{ fieldId: safeCityField.id, operator: 'eq', value: 'Pune' }],
      },
    })
    const safeResult = validateChartAiPatchAgainstAllowlist({
      currentChart,
      patch: safePatch,
      allowedFieldIds: new Set([safeCityField.id]),
      allowedMetricIds: new Set([billMetric.id]),
      fields: [safeCityField],
      metrics: [billMetric],
    })
    expect(safeResult.ok).toBe(true)
    expect(applyChartAiPatch(currentChart, safePatch).encoding.filters).toEqual([
      { fieldId: safeCityField.id, operator: 'eq', value: 'Pune' },
    ])

    const blockedPatch = ChartAiPatchSchema.parse({
      encoding: {
        filters: [{ fieldId: piiNameField.id, operator: 'contains', value: 'A' }],
      },
    })
    const blockedResult = validateChartAiPatchAgainstAllowlist({
      currentChart,
      patch: blockedPatch,
      allowedFieldIds: new Set([safeCityField.id]),
      allowedMetricIds: new Set([billMetric.id]),
      fields: [safeCityField],
      metrics: [billMetric],
    })
    expect(blockedResult.ok).toBe(false)
  })

  test('identifies when rendered AI preview can use sanitized preview rows', () => {
    const context: AiChartContext = {
      contractVersion: 'dashboardos.ai.chart_context.v1',
      dataset: { id: currentChart.datasetId, name: 'Electricity Operations', status: 'published' },
      chart: currentChart,
      allowedFields: [sanitizedFieldDescriptor(safeCityField)],
      allowedMetrics: [sanitizedMetricDescriptor(billMetric, billAmountField)],
      preview: {
        rows: [
          { City: 'Pune', 'Total Bill Amount': 1200 },
          { City: 'Mumbai', 'Total Bill Amount': 1800 },
        ],
        fields: ['City', 'Total Bill Amount'],
        rowCount: 2,
        elapsedMs: 12,
        warnings: [],
      },
    }

    expect(canRenderAiChartPreview(currentChart, context)).toBe(true)
    expect(canRenderAiChartPreview({
      ...currentChart,
      templateId: 'table-grid',
    }, context)).toBe(false)
  })

  test('keeps AI chart refinement gated off unless an explicit allowlist enables it', () => {
    const previousGlobal = process.env.DASHBOARDOS_AI_CHART_REFINEMENT_ENABLED
    const previousTenantIds = process.env.DASHBOARDOS_AI_CHART_REFINEMENT_TENANT_IDS
    const previousUserIds = process.env.DASHBOARDOS_AI_CHART_REFINEMENT_USER_IDS
    const previousProjectIds = process.env.DASHBOARDOS_AI_CHART_REFINEMENT_PROJECT_IDS

    delete process.env.DASHBOARDOS_AI_CHART_REFINEMENT_ENABLED
    delete process.env.DASHBOARDOS_AI_CHART_REFINEMENT_TENANT_IDS
    delete process.env.DASHBOARDOS_AI_CHART_REFINEMENT_USER_IDS
    delete process.env.DASHBOARDOS_AI_CHART_REFINEMENT_PROJECT_IDS

    const gated = resolveAiChartRefinementGate({
      tenantId: currentChart.tenantId,
      projectId: currentChart.projectId,
      userId: '99999999-9999-4999-8999-999999999999',
    })
    expect(gated.enabled).toBe(false)

    process.env.DASHBOARDOS_AI_CHART_REFINEMENT_TENANT_IDS = currentChart.tenantId
    const enabled = resolveAiChartRefinementGate({
      tenantId: currentChart.tenantId,
      projectId: currentChart.projectId,
      userId: '99999999-9999-4999-8999-999999999999',
    })
    expect(enabled).toMatchObject({ enabled: true, source: 'tenant_allowlist' })

    if (previousGlobal === undefined) delete process.env.DASHBOARDOS_AI_CHART_REFINEMENT_ENABLED
    else process.env.DASHBOARDOS_AI_CHART_REFINEMENT_ENABLED = previousGlobal
    if (previousTenantIds === undefined) delete process.env.DASHBOARDOS_AI_CHART_REFINEMENT_TENANT_IDS
    else process.env.DASHBOARDOS_AI_CHART_REFINEMENT_TENANT_IDS = previousTenantIds
    if (previousUserIds === undefined) delete process.env.DASHBOARDOS_AI_CHART_REFINEMENT_USER_IDS
    else process.env.DASHBOARDOS_AI_CHART_REFINEMENT_USER_IDS = previousUserIds
    if (previousProjectIds === undefined) delete process.env.DASHBOARDOS_AI_CHART_REFINEMENT_PROJECT_IDS
    else process.env.DASHBOARDOS_AI_CHART_REFINEMENT_PROJECT_IDS = previousProjectIds
  })

  test('returns inspectable gate reason codes from the env policy abstraction', () => {
    const env = {
      DASHBOARDOS_AI_CHART_REFINEMENT_TENANT_IDS: currentChart.tenantId,
      DASHBOARDOS_AI_CHART_REFINEMENT_PROJECT_IDS: '',
      DASHBOARDOS_AI_CHART_REFINEMENT_USER_IDS: '',
    }
    const policy = createEnvAiChartRefinementGatePolicy(env)
    const inspection = policy.inspect()

    expect(inspection).toMatchObject({
      policy: 'env',
      globalEnabled: false,
      allowlistCounts: { tenantIds: 1, projectIds: 0, userIds: 0 },
    })
    expect(inspectAiChartRefinementGatePolicy(env).allowlistCounts.tenantIds).toBe(1)
    expect(policy.resolve({
      tenantId: currentChart.tenantId,
      projectId: currentChart.projectId,
      userId: '99999999-9999-4999-8999-999999999999',
    })).toMatchObject({
      enabled: true,
      source: 'tenant_allowlist',
      reasonCode: 'tenant_allowlisted',
      policy: 'env',
    })

    expect(createEnvAiChartRefinementGatePolicy({}).resolve({
      tenantId: currentChart.tenantId,
      projectId: currentChart.projectId,
      userId: '99999999-9999-4999-8999-999999999999',
    })).toMatchObject({
      enabled: false,
      source: 'off',
      reasonCode: 'rollout_not_enabled',
    })
  })

  test('resolves DB-backed rollout policies before env fallback with safe reason codes', () => {
    const fallback = createEnvAiChartRefinementGatePolicy({
      DASHBOARDOS_AI_CHART_REFINEMENT_TENANT_IDS: currentChart.tenantId,
    })
    const disabledProjectPolicy = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scopeType: 'project' as const,
      scopeId: currentChart.projectId,
      tenantId: currentChart.tenantId,
      projectId: currentChart.projectId,
      userId: null,
      enabled: false,
      reason: 'customer_name = Pune should not appear in gate reason',
      createdBy: null,
      updatedBy: null,
      createdAt: '2026-07-08T10:00:00.000Z',
      updatedAt: '2026-07-08T10:00:00.000Z',
    }

    const projectDisabled = resolveAiChartRefinementGateFromDbPolicies({
      tenantId: currentChart.tenantId,
      projectId: currentChart.projectId,
      userId: '99999999-9999-4999-8999-999999999999',
    }, [disabledProjectPolicy], fallback)

    expect(projectDisabled).toMatchObject({
      enabled: false,
      source: 'db_project_policy',
      reasonCode: 'db_project_disabled',
      policy: 'database',
    })
    expect(projectDisabled.reason).not.toContain('customer_name')

    const userEnabled = resolveAiChartRefinementGateFromDbPolicies({
      tenantId: currentChart.tenantId,
      projectId: currentChart.projectId,
      userId: '99999999-9999-4999-8999-999999999999',
    }, [
      disabledProjectPolicy,
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        scopeType: 'user' as const,
        scopeId: '99999999-9999-4999-8999-999999999999',
        tenantId: currentChart.tenantId,
        projectId: currentChart.projectId,
        userId: '99999999-9999-4999-8999-999999999999',
        enabled: true,
        reason: null,
        createdBy: null,
        updatedBy: null,
        createdAt: '2026-07-08T10:01:00.000Z',
        updatedAt: '2026-07-08T10:01:00.000Z',
      },
    ], fallback)

    expect(userEnabled).toMatchObject({
      enabled: true,
      source: 'db_user_policy',
      reasonCode: 'db_user_enabled',
      policy: 'database',
    })
  })

  test('falls back to env allowlists when no DB rollout policy matches', () => {
    const fallback = createEnvAiChartRefinementGatePolicy({
      DASHBOARDOS_AI_CHART_REFINEMENT_PROJECT_IDS: currentChart.projectId,
    })

    expect(resolveAiChartRefinementGateFromDbPolicies({
      tenantId: currentChart.tenantId,
      projectId: currentChart.projectId,
      userId: '99999999-9999-4999-8999-999999999999',
    }, [], fallback)).toMatchObject({
      enabled: true,
      source: 'project_allowlist',
      reasonCode: 'project_allowlisted',
      policy: 'env',
    })
  })

  test('builds privacy-safe audit metadata for rollout policy changes', () => {
    const previousPolicy = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scopeType: 'tenant' as const,
      scopeId: currentChart.tenantId,
      tenantId: currentChart.tenantId,
      projectId: null,
      userId: null,
      enabled: false,
      reason: 'customer_name filter value Pune',
      createdBy: null,
      updatedBy: null,
      createdAt: '2026-07-08T10:00:00.000Z',
      updatedAt: '2026-07-08T10:00:00.000Z',
    }
    const nextPolicy = { ...previousPolicy, enabled: true, updatedAt: '2026-07-08T10:05:00.000Z' }

    const metadata = buildAiChartRefinementRolloutAuditMetadata({
      scopeType: 'tenant',
      scopeId: currentChart.tenantId,
      previousPolicy,
      nextPolicy,
    })

    expect(metadata).toMatchObject({
      scopeType: 'tenant',
      scopeId: currentChart.tenantId,
      previous: { enabled: false, notePresent: true },
      next: { enabled: true, notePresent: true },
    })
    expect(JSON.stringify(metadata)).not.toContain('customer_name')
    expect(JSON.stringify(metadata)).not.toContain('Pune')
  })

  test('renders safe rollout UI state labels without policy note content', () => {
    const unsafePolicy = {
      enabled: false,
      reason: 'customer_name = Pune',
    }

    expect(aiRolloutPolicyStateLabel(null)).toBe('Env fallback')
    expect(aiRolloutPolicyStateLabel(unsafePolicy)).toBe('Disabled override')
    expect(aiRolloutPolicyStateLabel({ enabled: true })).toBe('Enabled override')
  })

  test('accepts current AI patch schema version and rejects explicit mismatches', () => {
    const current = parseChartAiPatchPayload({
      schemaVersion: AI_CHART_PATCH_SCHEMA_VERSION,
      name: 'Monthly Billing Trend',
    })
    expect(current.ok).toBe(true)

    const legacyMissingVersion = parseChartAiPatchPayload({
      name: 'Monthly Billing Trend',
    })
    expect(legacyMissingVersion.ok).toBe(true)
    if (legacyMissingVersion.ok) expect(legacyMissingVersion.patch.schemaVersion).toBe(AI_CHART_PATCH_SCHEMA_VERSION)

    const future = parseChartAiPatchPayload({
      schemaVersion: 'dashboardos.ai.chart_patch.v99',
      name: 'Monthly Billing Trend',
    })
    expect(future).toMatchObject({ ok: false, errorCode: 'schema_version_mismatch' })
  })

  test('rejects malformed AI model patches without changing the chart', () => {
    const malformed = parseChartAiPatchPayload({
      schemaVersion: AI_CHART_PATCH_SCHEMA_VERSION,
      encoding: {
        filters: [{ fieldId: safeCityField.id, operator: 'raw_sql', value: '1=1' }],
      },
    })

    expect(malformed).toMatchObject({ ok: false, errorCode: 'invalid_model_patch' })
    expect(currentChart.encoding.filters).toBeUndefined()
  })

  test('emits sanitized AI refinement observability metadata', () => {
    expect(classifyAiChartRefinementPrompt('rename this to Customer Name rollup')).toBe('rename')
    const metadata = buildAiChartRefinementEventMetadata({
      eventType: 'blocked_sensitive_request',
      instruction: 'group by customer name',
      errorCode: 'restricted_field_request',
      schemaVersion: AI_CHART_PATCH_SCHEMA_VERSION,
      previewAvailable: false,
      gateSource: 'tenant_allowlist',
    })

    expect(metadata).toMatchObject({
      eventType: 'blocked_sensitive_request',
      promptType: 'grouping',
      errorCode: 'restricted_field_request',
      schemaVersion: AI_CHART_PATCH_SCHEMA_VERSION,
      previewAvailable: false,
      gateSource: 'tenant_allowlist',
    })
    expect(JSON.stringify(metadata)).not.toContain('customer name')
  })

  test('summarizes AI refinement observability counts without prompt content', () => {
    const rows = [
      { action: 'ai.chart_refine.metric.prompt_submitted', metadata: { eventType: 'prompt_submitted', promptType: 'grouping' }, created_at: '2026-07-08T10:00:00.000Z' },
      { action: 'ai.chart_refine.metric.proposal_success', metadata: { eventType: 'proposal_success' }, created_at: '2026-07-08T10:01:00.000Z' },
      { action: 'ai.chart_refine.metric.blocked_sensitive_request', metadata: { eventType: 'blocked_sensitive_request', errorCode: 'restricted_field_request' }, created_at: '2026-07-08T10:02:00.000Z' },
      { action: 'ai.chart_refine.metric.unsupported_schema_version', metadata: { eventType: 'unsupported_schema_version', errorCode: 'schema_version_mismatch' }, created_at: '2026-07-08T10:03:00.000Z' },
      { action: 'ai.chart_refine.metric.patch_validation_failure', metadata: { eventType: 'patch_validation_failure', errorCode: 'chart_validation_failed' }, created_at: '2026-07-08T10:04:00.000Z' },
      { action: 'ai.chart_refine.metric.apply_success', metadata: { eventType: 'apply_success' }, created_at: '2026-07-08T10:05:00.000Z' },
      { action: 'ai.chart_refine.metric.preview_render_unavailable', metadata: { eventType: 'preview_render_unavailable' }, created_at: '2026-07-08T10:06:00.000Z' },
      { action: 'ai.chart_refine.metric.model_parse_failure', metadata: { eventType: 'model_parse_failure', errorCode: 'model_parse_failure' }, created_at: '2026-07-08T10:07:00.000Z' },
      { action: 'ai.chart_refine.metric.gated_off_access', metadata: { eventType: 'gated_off_access', errorCode: 'rollout_not_enabled' }, created_at: '2026-07-08T10:08:00.000Z' },
    ]

    const summary = summarizeAiChartRefinementMetrics(rows)
    expect(summary).toMatchObject({
      promptsSubmitted: 1,
      proposalsSucceeded: 1,
      blockedSensitiveRequests: 1,
      validationFailures: 1,
      applySuccesses: 1,
      previewUnavailableCases: 1,
      unsupportedSchemaVersions: 1,
      modelParseFailures: 1,
      gatedOffAccess: 1,
      lastEventAt: '2026-07-08T10:08:00.000Z',
      outcomeCategories: {
        restrictedFieldRequests: 1,
        unsupportedSchemaVersions: 1,
        modelParseFailures: 1,
        validationFailures: 1,
        gatedOffAccess: 1,
        previewUnavailableCases: 1,
      },
    })
    expect(summary.buckets).toEqual([expect.objectContaining({
      bucketStart: '2026-07-08T00:00:00.000Z',
      totalEvents: 9,
      promptsSubmitted: 1,
      proposalsSucceeded: 1,
      applySuccesses: 1,
      validationFailures: 1,
      gatedOffAccess: 1,
      previewUnavailableCases: 1,
    })])
    expect(JSON.stringify(summary)).not.toContain('customer name')
  })

  test('compiles narrow chart filters into parameterized runtime SQL and cache keys', () => {
    const dataSourceId = '99999999-9999-4999-8999-999999999998'
    const runtimeCityField = {
      ...safeCityField,
      source_column: {
        ...safeCityField.source_column,
        dataSourceId,
      },
    }
    const metricSourceField = {
      ...billAmountField,
      source_column: {
        ...billAmountField.source_column,
        dataSourceId,
        tableName: 'electricity_customers',
      },
    }
    const runtimeBillMetric = {
      ...billMetric,
      expression: { fieldId: metricSourceField.id },
    }
    const result = compileDatasetQueryPlan({
      fields: [runtimeCityField],
      metrics: [runtimeBillMetric],
      relationships: [],
      metricSourceFields: [metricSourceField],
      filters: [{ fieldId: runtimeCityField.id, operator: 'eq', value: 'Pune' }],
    })

    expect(result.queryPlan.executableSql).toContain('where "t1"."city" = $1')
    expect(result.queryPlan.executableSql).not.toContain('Pune')
    expect(result.parameters).toEqual(['Pune'])
    expect(result.queryPlan.filters).toEqual([{
      fieldId: runtimeCityField.id,
      operator: 'eq',
      parameterIndexes: [1],
    }])

    const baseKey = {
      tenantId: currentChart.tenantId,
      projectId: currentChart.projectId,
      datasetId: currentChart.datasetId,
      chartId: currentChart.id,
      dataSourceId,
      sql: result.queryPlan.executableSql ?? '',
    }
    expect(queryResultCacheKey({ ...baseKey, parameters: ['Pune'] }))
      .not.toBe(queryResultCacheKey({ ...baseKey, parameters: ['Mumbai'] }))
  })
})
