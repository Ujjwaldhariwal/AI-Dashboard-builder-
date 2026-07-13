import { expect, test } from '@playwright/test'

import {
  applyGuidedReviewDecision,
  approveGuidedSemanticDraft,
  buildGuidedChartRecommendations,
  buildGuidedDashboardDraftPlan,
  buildGuidedDatasetDraftFromRecipe,
  buildGuidedDatasetRecipes,
  buildGuidedProgress,
  buildGuidedReviewState,
  buildGuidedSchemaProfile,
  buildGuidedSemanticDraft,
} from '../src/lib/dashboardos/guided-review'
import type { DataSourceColumnMetadata } from '../src/types/data-source'

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
    const draft = buildGuidedDatasetDraftFromRecipe({ recipe, fields, metrics })

    expect(draft.name).toBe(recipe.title)
    expect(draft.fieldIds).toEqual(expect.arrayContaining(['date']))
    expect(draft.metricIds).toEqual(expect.arrayContaining(['revenue']))
    expect(draft.reviewNotes).toEqual([])
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

    expect(steps.find(step => step.id === 'generate_draft_dashboard')?.status).toBe('ready')
    expect(steps.find(step => step.id === 'publish')?.status).toBe('blocked')
  })
})
