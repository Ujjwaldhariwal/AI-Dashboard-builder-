import { expect, test } from '@playwright/test'

import {
  applyGuidedReviewDecision,
  buildGuidedContinueState,
  approveGuidedSemanticDraft,
  buildGuidedChartRecommendations,
  buildGuidedDashboardDraftPlan,
  buildGuidedDatasetDraftFromRecipe,
  buildGuidedDraftLineage,
  buildGuidedDatasetRecipes,
  buildGuidedProgress,
  buildGuidedPublishReadiness,
  buildGuidedReviewState,
  buildGuidedSchemaProfile,
  buildGuidedSemanticDraft,
  guidedLineageLabel,
} from '../src/lib/dashboardos/guided-review'
import type { DataSourceColumnMetadata } from '../src/types/data-source'
import type { DashboardChartConfig } from '../src/types/dashboard-chart'

function column(tableName: string, columnName: string, dataType: string, index: number): DataSourceColumnMetadata {
  return {
    id: `${tableName}-${columnName}`,
    dataSourceId: 'source-1',
    schemaName: 'public',
    tableName,
    columnName,
    ordinalPosition: index,
    dataType,
    udtName: dataType,
    isNullable: false,
    columnDefault: null,
    createdAt: new Date(0).toISOString(),
  }
}

test.describe('guided review foundation', () => {
  const columns = [
    column('orders', 'order_id', 'uuid', 1),
    column('orders', 'customer_id', 'uuid', 2),
    column('orders', 'order_date', 'date', 3),
    column('orders', 'status', 'text', 4),
    column('orders', 'revenue_amount', 'numeric', 5),
    column('customers', 'customer_id', 'uuid', 1),
    column('customers', 'customer_name', 'text', 2),
    column('customers', 'region', 'text', 3),
  ]

  test('profiles schema into reviewable business buckets with sensitive fields hidden', () => {
    const profile = buildGuidedSchemaProfile(columns)

    expect(profile.tableCount).toBe(2)
    expect(profile.columnCount).toBe(8)
    expect(profile.facts.map(item => item.label)).toContain('Orders')
    expect(profile.dimensions.map(item => item.label)).toContain('Customers')
    expect(profile.dates.map(item => item.label)).toContain('Order Date')
    expect(profile.measures.map(item => item.label)).toContain('Revenue Amount')
    expect(profile.sensitive.map(item => item.label)).toContain('Customer Name')
    expect(profile.reviewItems.some(item => item.kind === 'sensitive_field')).toBe(true)
    expect(JSON.stringify(profile)).not.toContain('readonly_password')
  })

  test('creates a semantic auto-draft focused on approved, hidden, and review-needed items', () => {
    const draft = buildGuidedSemanticDraft(buildGuidedSchemaProfile(columns))

    expect(draft.approvedFields.some(item => item.label === 'Revenue Amount')).toBe(true)
    expect(draft.suggestedMetrics.some(item => item.label === 'Revenue Amount')).toBe(true)
    expect(draft.hiddenSensitiveFields).toEqual([
      expect.objectContaining({ label: 'Customer Name', reviewRequired: true }),
    ])
    expect(draft.needsReview.length).toBeGreaterThan(0)
  })

  test('suggests dataset recipes from approved semantic assets', () => {
    const recipes = buildGuidedDatasetRecipes({
      fields: [
        { id: 'date', name: 'Order Date', role: 'date' },
        { id: 'region', name: 'Region', role: 'dimension' },
        { id: 'status', name: 'Status', role: 'dimension' },
      ],
      metrics: [
        { id: 'revenue', name: 'Revenue Amount', aggregation: 'sum' },
        { id: 'orders', name: 'Order Count', aggregation: 'count' },
      ],
    })

    expect(recipes.map(recipe => recipe.id)).toEqual(expect.arrayContaining([
      'executive-overview',
      'regional-performance',
      'operations-health',
      'finance-summary',
    ]))
    expect(JSON.stringify(recipes)).not.toContain('Customer Name')
  })

  test('recommends charts from dataset shape without claiming unsupported manual behavior', () => {
    const recommendations = buildGuidedChartRecommendations({
      shape: {
        kind: 'time_series_many_metrics',
        fields: [],
        metrics: [],
        dimensions: [],
        dateFields: [],
        tooltipFields: [],
        metricCount: 2,
        dimensionCount: 1,
        hasDateAxis: true,
        hasMultipleMetrics: true,
        warnings: [],
      },
      fields: [{ id: 'date', name: 'Order Date', role: 'date' }],
      metrics: [{ id: 'revenue', name: 'Revenue Amount' }],
    })

    expect(recommendations.map(item => item.id)).toEqual(expect.arrayContaining([
      'trend',
      'category-bar',
      'kpi-cards',
    ]))
  })

  test('persists review state transitions without exposing sensitive values', () => {
    const state = buildGuidedReviewState(columns)
    const sensitiveItem = state.semanticDraft.hiddenSensitiveFields[0]
    expect(sensitiveItem).toBeTruthy()

    const decided = applyGuidedReviewDecision(state, {
      itemId: sensitiveItem.id,
      action: 'keep_hidden',
      decidedBy: 'user-1',
      decidedAt: '2026-07-13T00:00:00.000Z',
    })

    expect(decided.decisions).toEqual([
      expect.objectContaining({ itemId: sensitiveItem.id, action: 'keep_hidden' }),
    ])
    expect(decided.semanticDraft.needsReview.some(item => item.id === sensitiveItem.id)).toBe(false)
    expect(JSON.stringify(decided)).not.toContain('raw_prompt')
  })

  test('approves semantic draft after review decisions are saved', () => {
    const reviewed = buildGuidedReviewState(columns)
    const approved = approveGuidedSemanticDraft(reviewed, 'admin-user', '2026-07-13T01:00:00.000Z')

    expect(approved.semanticDraftStatus).toBe('approved')
    expect(approved.approvedBy).toBe('admin-user')
    expect(approved.decisions.length).toBeGreaterThanOrEqual(approved.semanticDraft.approvedFields.length)
  })

  test('links approved semantic draft state to the materialized semantic asset', () => {
    const reviewed = buildGuidedReviewState(columns, {
      profileId: 'profile-1',
      dataSourceId: 'source-1',
      schemaHash: 'schema-v1',
      generatedAt: '2026-07-13T00:00:00.000Z',
    })
    const approved = approveGuidedSemanticDraft(reviewed, 'admin-user', '2026-07-13T01:00:00.000Z', {
      modelId: 'model-1',
      modelName: 'Guided Semantic Model',
      modelVersion: 3,
      materializedAt: '2026-07-13T01:00:00.000Z',
      fieldCount: 6,
      metricCount: 2,
      relationshipCount: 1,
    })

    expect(approved.semanticAsset).toEqual(expect.objectContaining({
      modelId: 'model-1',
      modelVersion: 3,
      metricCount: 2,
    }))
    expect(approved.lineage?.semanticAsset?.modelId).toBe('model-1')
    expect(approved.lineage?.semanticDraft.status).toBe('approved')
  })

  test('builds deterministic dataset drafts from selected recipes', () => {
    const fields = [
      { id: 'date', name: 'Order Date', role: 'date' },
      { id: 'region', name: 'Region', role: 'dimension' },
      { id: 'status', name: 'Status', role: 'dimension' },
    ]
    const metrics = [
      { id: 'revenue', name: 'Revenue Amount', aggregation: 'sum' as const },
      { id: 'orders', name: 'Order Count', aggregation: 'count' as const },
    ]
    const recipe = buildGuidedDatasetRecipes({ fields, metrics })[0]
    const lineage = buildGuidedDraftLineage({
      generatedAt: '2026-07-13T02:00:00.000Z',
      profileId: 'profile-1',
      schemaHash: 'schema-v1',
      semanticDraftVersion: 2,
      semanticAsset: {
        modelId: 'model-1',
        modelName: 'Guided Semantic Model',
        modelVersion: 1,
        materializedAt: '2026-07-13T01:00:00.000Z',
        fieldCount: fields.length,
        metricCount: metrics.length,
        relationshipCount: 0,
      },
    })
    const draft = buildGuidedDatasetDraftFromRecipe({ recipe, fields, metrics, lineage })

    expect(draft.name).toBe(recipe.title)
    expect(draft.fieldIds).toEqual(expect.arrayContaining(['date']))
    expect(draft.metricIds).toEqual(expect.arrayContaining(['revenue']))
    expect(draft.reviewNotes).toEqual([])
    expect(guidedLineageLabel(draft.lineage)).toBe('Generated from approved semantic draft v2 / semantic model v1')
  })

  test('builds a coherent dashboard draft layout from recommended chart types', () => {
    const recommendations = buildGuidedChartRecommendations({
      shape: {
        kind: 'time_series_many_metrics',
        fields: [],
        metrics: [],
        dimensions: [],
        dateFields: [],
        tooltipFields: [],
        metricCount: 2,
        dimensionCount: 1,
        hasDateAxis: true,
        hasMultipleMetrics: true,
        warnings: [],
      },
      fields: [
        { id: 'date', name: 'Order Date', role: 'date' },
        { id: 'region', name: 'Region', role: 'dimension' },
      ],
      metrics: [{ id: 'revenue', name: 'Revenue Amount' }],
    })
    const dashboard = buildGuidedDashboardDraftPlan({
      datasetName: 'Executive overview',
      fields: [
        { id: 'date', name: 'Order Date', role: 'date' },
        { id: 'region', name: 'Region', role: 'dimension' },
      ],
      metrics: [{ id: 'revenue', name: 'Revenue Amount' }],
      recommendations,
    })

    expect(dashboard.layout.mode).toBe('responsive-grid')
    expect(dashboard.charts.map(chart => chart.templateId)).toEqual(expect.arrayContaining(['line', 'bar', 'kpi-card']))
    expect(dashboard.charts.every(chart => chart.metricIds.length > 0)).toBe(true)
  })

  test('computes guided progress blockers and ready states', () => {
    const steps = buildGuidedProgress({
      hasDataSource: true,
      hasProfile: true,
      openReviewCount: 0,
      semanticDraftApproved: true,
      hasDatasetDraft: true,
      hasDashboardDraft: false,
      hasPreview: false,
      hasPublishedDashboard: false,
    })

    expect(steps.find(step => step.id === 'generate_draft_dashboard')?.status).toBe('blocked')
    expect(steps.find(step => step.id === 'generate_draft_dashboard')?.detail).toContain('paused')
    expect(steps.find(step => step.id === 'publish')?.status).toBe('blocked')
  })

  test('selects one guided landing continuation action with blockers', () => {
    const steps = buildGuidedProgress({
      hasDataSource: true,
      hasProfile: true,
      openReviewCount: 2,
      semanticDraftApproved: false,
      hasDatasetDraft: false,
      hasDashboardDraft: false,
      hasPreview: false,
      hasPublishedDashboard: false,
    })
    const continueState = buildGuidedContinueState(steps)

    expect(continueState.currentStep.id).toBe('review_findings')
    expect(continueState.nextAction.href).toBe('/admin/semantic-model')
    expect(continueState.completedSteps.map(step => step.id)).toContain('connect_db')
    expect(continueState.blockerSteps.map(step => step.id)).toContain('approve_model')
  })

  test('marks real guided handoff ready when assets, version, route, and charts validate', () => {
    const approved = approveGuidedSemanticDraft(buildGuidedReviewState(columns), 'admin-user', '2026-07-13T01:00:00.000Z', {
      modelId: 'model-1',
      modelName: 'Guided Semantic Model',
      modelVersion: 1,
      materializedAt: '2026-07-13T01:00:00.000Z',
      fieldCount: 3,
      metricCount: 1,
      relationshipCount: 0,
    })
    const chart = chartConfig({ validationState: 'valid' })
    const readiness = buildGuidedPublishReadiness({
      evaluatedAt: '2026-07-13T02:00:00.000Z',
      profileState: approved,
      schemaIntrospection: completeSchemaIntrospection(),
      models: [{ id: 'model-1', status: 'approved', version: 1 }],
      activeSemanticModelId: 'model-1',
      datasets: [dataset()],
      charts: [chart],
      dashboards: [{ id: 'dashboard-1', slug: 'executive', status: 'draft', currentVersionId: null, publishedAt: null }],
      versions: [{ id: 'version-1', dashboardId: 'dashboard-1', status: 'draft', versionNumber: 1, notes: null }],
      pages: [{ id: 'page-1', versionId: 'version-1', slug: 'overview' }],
      slots: [{ id: 'slot-1', versionId: 'version-1', chartConfigId: chart.id }],
      selectedDashboardId: 'dashboard-1',
      selectedVersionId: 'version-1',
      clientUrl: '/client/northstar',
    })

    expect(readiness.status).toBe('ready_to_publish')
    expect(readiness.publishEligible).toBe(true)
    expect(readiness.blockers).toEqual([])
    expect(readiness.readyItems.map(check => check.id)).toEqual(expect.arrayContaining([
      'schema_introspection',
      'semantic_asset',
      'dataset_draft',
      'dashboard_draft',
      'publish_target',
      'runtime_validation',
    ]))
  })

  test('distinguishes warnings from blockers in publish readiness', () => {
    const approved = approveGuidedSemanticDraft(buildGuidedReviewState(columns), 'admin-user', '2026-07-13T01:00:00.000Z', {
      modelId: 'model-1',
      modelName: 'Guided Semantic Model',
      modelVersion: 1,
      materializedAt: '2026-07-13T01:00:00.000Z',
      fieldCount: 3,
      metricCount: 1,
      relationshipCount: 0,
    })
    const chart = chartConfig({ validationState: 'warning' })
    const readiness = buildGuidedPublishReadiness({
      profileState: approved,
      schemaIntrospection: completeSchemaIntrospection(),
      models: [{ id: 'model-1', status: 'approved', version: 1 }],
      activeSemanticModelId: 'model-1',
      datasets: [dataset()],
      charts: [chart],
      dashboards: [{ id: 'dashboard-1', slug: 'executive', status: 'draft', currentVersionId: null, publishedAt: null }],
      versions: [{ id: 'version-1', dashboardId: 'dashboard-1', status: 'draft', versionNumber: 1, notes: null }],
      pages: [{ id: 'page-1', versionId: 'version-1', slug: 'overview' }],
      slots: [{ id: 'slot-1', versionId: 'version-1', chartConfigId: chart.id }],
      selectedDashboardId: 'dashboard-1',
      selectedVersionId: 'version-1',
      clientUrl: '/client/northstar',
    })

    expect(readiness.publishEligible).toBe(false)
    expect(readiness.status).toBe('blocked_by_validation')
    expect(readiness.blockers.map(check => check.id)).toContain('runtime_validation')
  })

  test('blocks publish when draft is previewable but runtime validation is invalid', () => {
    const approved = approveGuidedSemanticDraft(buildGuidedReviewState(columns), 'admin-user', '2026-07-13T01:00:00.000Z', {
      modelId: 'model-1',
      modelName: 'Guided Semantic Model',
      modelVersion: 1,
      materializedAt: '2026-07-13T01:00:00.000Z',
      fieldCount: 3,
      metricCount: 1,
      relationshipCount: 0,
    })
    const invalidChart = chartConfig({ validationState: 'invalid' })
    const readiness = buildGuidedPublishReadiness({
      profileState: approved,
      schemaIntrospection: completeSchemaIntrospection(),
      models: [{ id: 'model-1', status: 'approved', version: 1 }],
      activeSemanticModelId: 'model-1',
      datasets: [dataset()],
      charts: [invalidChart],
      dashboards: [{ id: 'dashboard-1', slug: 'executive', status: 'draft', currentVersionId: null, publishedAt: null }],
      versions: [{ id: 'version-1', dashboardId: 'dashboard-1', status: 'draft', versionNumber: 1, notes: null }],
      pages: [{ id: 'page-1', versionId: 'version-1', slug: 'overview' }],
      slots: [{ id: 'slot-1', versionId: 'version-1', chartConfigId: invalidChart.id }],
      selectedDashboardId: 'dashboard-1',
      selectedVersionId: 'version-1',
      clientUrl: '/client/northstar',
    })

    expect(readiness.publishEligible).toBe(false)
    expect(readiness.status).toBe('blocked_by_validation')
    expect(readiness.blockers.map(check => check.id)).toContain('runtime_validation')
    expect(readiness.nextFixAction?.href).toBe('/admin/charts')
  })

  test('feeds readiness blockers into guided landing publish state', () => {
    const steps = buildGuidedProgress({
      hasDataSource: true,
      hasProfile: true,
      openReviewCount: 0,
      semanticDraftApproved: true,
      hasDatasetDraft: true,
      hasDashboardDraft: true,
      hasPreview: true,
      hasPublishedDashboard: false,
      publishReadiness: {
        status: 'previewable_not_publishable',
        publishEligible: false,
        summary: 'Previewable, but not publishable yet.',
      },
    })

    expect(steps.find(step => step.id === 'publish')?.status).toBe('blocked')
    expect(steps.find(step => step.id === 'publish')?.detail).toBe('Previewable, but not publishable yet.')
  })
})

function dataset() {
  return {
    id: 'dataset-1',
    modelId: 'model-1',
    status: 'published' as const,
    description: 'Generated from approved semantic draft v1',
    selection: {
      fieldIds: ['field-date'],
      metricIds: ['metric-revenue'],
      relationshipIds: [],
    },
  }
}

function completeSchemaIntrospection() {
  return {
    dataSourceId: 'source-1',
    status: 'ok',
    error: null,
    schemaHash: null,
  }
}

function chartConfig(overrides: Partial<DashboardChartConfig> = {}): DashboardChartConfig {
  return {
    id: 'chart-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    datasetId: 'dataset-1',
    name: 'Revenue trend',
    description: null,
    status: 'published',
    templateId: 'line',
    encoding: {
      xAxisFieldId: 'field-date',
      yMetricIds: ['metric-revenue'],
      tooltipFieldIds: [],
      labelById: {},
      colorById: {},
      filters: [],
      limit: 100,
    },
    presentation: { size: 'standard', showLegend: true, showLabels: false, valueFormat: null },
    interactions: {},
    layout: { order: 0, gridSpan: 2 },
    validationState: 'valid',
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  }
}
