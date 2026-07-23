import { expect, test } from '@playwright/test'

import { approveGuidedSemanticDraft, buildGuidedReviewState } from '../src/lib/dashboardos/guided-review'
import { evaluateGuidedPublishReadinessForProject } from '../src/lib/dashboardos/guided-publish-readiness-server'
import type { DataSourceColumnMetadata } from '../src/types/data-source'

const tenantId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const modelId = '33333333-3333-4333-8333-333333333333'
const datasetId = '44444444-4444-4444-8444-444444444444'
const chartId = '55555555-5555-4555-8555-555555555555'
const dashboardId = '66666666-6666-4666-8666-666666666666'
const versionId = '77777777-7777-4777-8777-777777777777'
const pageId = '88888888-8888-4888-8888-888888888888'
const slotId = '99999999-9999-4999-8999-999999999999'

function column(columnName: string, dataType: string, index: number): DataSourceColumnMetadata {
  return {
    id: `seed-${columnName}`,
    dataSourceId: 'seed-source',
    schemaName: 'public',
    tableName: 'monthly_revenue',
    columnName,
    ordinalPosition: index,
    dataType,
    udtName: dataType,
    isNullable: false,
    columnDefault: null,
    createdAt: '2026-07-13T00:00:00.000Z',
  }
}

function approvedGuidedState() {
  return approveGuidedSemanticDraft(
    buildGuidedReviewState([
      column('month', 'date', 1),
      column('region', 'text', 2),
      column('revenue_amount', 'numeric', 3),
    ], {
      profileId: 'seed-profile',
      dataSourceId: 'seed-source',
      schemaHash: 'seed-schema-v1',
      generatedAt: '2026-07-13T00:00:00.000Z',
    }),
    'seed-admin',
    '2026-07-13T01:00:00.000Z',
    {
      modelId,
      modelName: 'Seeded Revenue Semantic Model',
      modelVersion: 2,
      materializedAt: '2026-07-13T01:00:00.000Z',
      fieldCount: 2,
      metricCount: 1,
      relationshipCount: 0,
    },
  )
}

function seededTables(overrides: {
  chartValidationState?: string
  chartStatus?: string
  includeVersion?: boolean
  includeSlot?: boolean
} = {}) {
  const includeVersion = overrides.includeVersion ?? true
  const includeSlot = overrides.includeSlot ?? true
  return {
    dashboard_projects: [{
      id: projectId,
      tenant_id: tenantId,
      active_business_model_id: modelId,
      tenant: { slug: 'seeded-client' },
    }],
    data_sources: [{
      id: 'seed-source',
      tenant_id: tenantId,
      project_id: projectId,
      schema_last_status: 'ok',
      schema_last_error: null,
      schema_hash: 'seed-schema-v1',
    }],
    guided_schema_profiles: [{
      tenant_id: tenantId,
      project_id: projectId,
      state: approvedGuidedState(),
      updated_at: '2026-07-13T01:00:00.000Z',
    }],
    business_models: [{
      id: modelId,
      tenant_id: tenantId,
      project_id: projectId,
      status: 'approved',
      version: 2,
    }],
    business_entities: [{
      id: 'entity-revenue',
      model_id: modelId,
    }],
    business_fields: [
      {
        id: 'field-month',
        entity_id: 'entity-revenue',
        source_column: { dataSourceId: 'seed-source', schemaName: 'public', tableName: 'monthly_revenue', columnName: 'month' },
      },
      {
        id: 'field-region',
        entity_id: 'entity-revenue',
        source_column: { dataSourceId: 'seed-source', schemaName: 'public', tableName: 'monthly_revenue', columnName: 'region' },
      },
      {
        id: 'field-revenue',
        entity_id: 'entity-revenue',
        source_column: { dataSourceId: 'seed-source', schemaName: 'public', tableName: 'monthly_revenue', columnName: 'revenue_amount' },
      },
    ],
    business_metrics: [{
      id: 'metric-revenue',
      model_id: modelId,
      entity_id: 'entity-revenue',
      expression: { type: 'field_aggregation', fieldId: 'field-revenue' },
    }],
    business_relationships: [],
    data_source_columns: [
      { id: 'column-month', tenant_id: tenantId, project_id: projectId, data_source_id: 'seed-source', schema_name: 'public', table_name: 'monthly_revenue', column_name: 'month', relation_id: 'relation-revenue' },
      { id: 'column-region', tenant_id: tenantId, project_id: projectId, data_source_id: 'seed-source', schema_name: 'public', table_name: 'monthly_revenue', column_name: 'region', relation_id: 'relation-revenue' },
      { id: 'column-revenue', tenant_id: tenantId, project_id: projectId, data_source_id: 'seed-source', schema_name: 'public', table_name: 'monthly_revenue', column_name: 'revenue_amount', relation_id: 'relation-revenue' },
    ],
    data_source_relation_selections: [{ relation_id: 'relation-revenue', status: 'included' }],
    semantic_datasets: [{
      id: datasetId,
      tenant_id: tenantId,
      project_id: projectId,
      model_id: modelId,
      status: 'published',
      description: 'Generated from approved semantic draft v2',
      selection: {
        fieldIds: ['field-month', 'field-region'],
        metricIds: ['metric-revenue'],
        relationshipIds: [],
      },
    }],
    dashboard_chart_configs: [{
      id: chartId,
      tenant_id: tenantId,
      project_id: projectId,
      dataset_id: datasetId,
      status: overrides.chartStatus ?? 'published',
      validation_state: overrides.chartValidationState ?? 'valid',
      template_id: 'line',
      encoding: {
        xAxisFieldId: 'field-month',
        yMetricIds: ['metric-revenue'],
        tooltipFieldIds: [],
        labelById: {},
        colorById: {},
        filters: [],
        limit: 100,
      },
    }],
    published_dashboards: [{
      id: dashboardId,
      tenant_id: tenantId,
      project_id: projectId,
      name: 'Seeded Revenue Dashboard',
      slug: 'seeded-revenue',
      description: 'Seeded non-demo dashboard.',
      status: 'draft',
      current_version_id: null,
      created_at: '2026-07-13T01:00:00.000Z',
      updated_at: '2026-07-13T01:00:00.000Z',
    }],
    dashboard_versions: includeVersion ? [{
      id: versionId,
      dashboard_id: dashboardId,
      tenant_id: tenantId,
      project_id: projectId,
      version_number: 1,
      status: 'draft',
      title: 'Seeded release',
      notes: 'Seeded non-demo preflight release.',
      layout: { mode: 'responsive-grid' },
      created_at: '2026-07-13T01:05:00.000Z',
    }] : [],
    dashboard_pages: includeVersion ? [{
      id: pageId,
      version_id: versionId,
      dashboard_id: dashboardId,
      tenant_id: tenantId,
      project_id: projectId,
      title: 'Overview',
      slug: 'overview',
      sort_order: 0,
      layout: { columns: 12 },
      created_at: '2026-07-13T01:05:00.000Z',
    }] : [],
    dashboard_chart_slots: includeVersion && includeSlot ? [{
      id: slotId,
      page_id: pageId,
      version_id: versionId,
      dashboard_id: dashboardId,
      tenant_id: tenantId,
      project_id: projectId,
      chart_config_id: chartId,
      title: 'Revenue trend',
      slot_key: 'revenue-trend',
      row_index: 0,
      column_index: 0,
      width: 8,
      height: 4,
      settings: {},
      created_at: '2026-07-13T01:05:00.000Z',
    }] : [],
  }
}

class Query {
  private filters: Array<(row: Record<string, unknown>) => boolean> = []
  private singleMode = false
  private limitCount: number | null = null

  constructor(private rows: Record<string, unknown>[]) {}

  select() { return this }
  order() { return this }
  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value)
    return this
  }
  in(column: string, values: unknown[]) {
    const allowed = new Set(values)
    this.filters.push(row => allowed.has(row[column]))
    return this
  }
  filter(column: string, operator: string, value: unknown) {
    if (operator === 'eq') this.filters.push(row => row[column] === value)
    return this
  }
  limit(count: number) {
    this.limitCount = count
    return this
  }
  single() {
    this.singleMode = true
    return this
  }
  maybeSingle() {
    this.singleMode = true
    return this
  }
  then(resolve: (value: { data: unknown; error: null }) => void) {
    let data = this.filters.reduce((rows, filter) => rows.filter(filter), this.rows)
    if (this.limitCount !== null) data = data.slice(0, this.limitCount)
    resolve({ data: this.singleMode ? data[0] ?? null : data, error: null })
  }
}

function createSupabase(tables: Record<string, Record<string, unknown>[]>, options: {
  missingGuidedReviewSchema?: boolean
  missingReleaseStorage?: boolean
} = {}) {
  return {
    from(table: string) {
      if (options.missingGuidedReviewSchema && table === 'guided_schema_profiles') {
        return new MissingTableQuery('guided_schema_profiles')
      }
      if (options.missingReleaseStorage && table === 'dashboard_release_chart_snapshots') {
        return new MissingTableQuery('dashboard_release_chart_snapshots')
      }
      return new Query(tables[table] ?? [])
    },
  }
}

class MissingTableQuery {
  constructor(private table: string) {}
  select() { return this }
  order() { return this }
  eq() { return this }
  limit() { return this }
  then(resolve: (value: { data: null; error: { code: string; message: string } }) => void) {
    resolve({
      data: null,
      error: {
        code: 'PGRST205',
        message: `Could not find the table 'public.${this.table}' in the schema cache`,
      },
    })
  }
}

test.describe('guided publish preflight', () => {
  test('evaluates a seeded non-demo project as ready to publish', async () => {
    const result = await evaluateGuidedPublishReadinessForProject({
      supabase: createSupabase(seededTables()) as never,
      projectId,
      selectedDashboardId: dashboardId,
      selectedVersionId: versionId,
      evaluatedAt: '2026-07-13T02:00:00.000Z',
    })

    expect(result.readiness.status).toBe('ready_to_publish')
    expect(result.readiness.publishEligible).toBe(true)
    expect(result.metadata.strategy).toBe('recomputed')
    expect(result.metadata.tenantSlug).toBe('seeded-client')
    expect(result.metadata.datasetCount).toBe(1)
    expect(result.metadata.slotCount).toBe(1)
  })

  test('blocks warning charts because the client runtime only serves valid charts', async () => {
    const result = await evaluateGuidedPublishReadinessForProject({
      supabase: createSupabase(seededTables({ chartValidationState: 'warning' })) as never,
      projectId,
      selectedDashboardId: dashboardId,
      selectedVersionId: versionId,
      evaluatedAt: '2026-07-13T02:00:00.000Z',
    })

    expect(result.readiness.status).toBe('blocked_by_validation')
    expect(result.readiness.publishEligible).toBe(false)
    expect(result.readiness.blockers.map(check => check.id)).toContain('runtime_validation')
    expect(result.readiness.checks.find(check => check.id === 'runtime_validation')?.message).toContain('preview-only')
  })

  test('blocks a seeded non-demo project when runtime validation fails', async () => {
    const result = await evaluateGuidedPublishReadinessForProject({
      supabase: createSupabase(seededTables({ chartValidationState: 'invalid' })) as never,
      projectId,
      selectedDashboardId: dashboardId,
      selectedVersionId: versionId,
      evaluatedAt: '2026-07-13T02:00:00.000Z',
    })

    expect(result.readiness.status).toBe('blocked_by_validation')
    expect(result.readiness.publishEligible).toBe(false)
    expect(result.readiness.blockers.map(check => check.id)).toContain('runtime_validation')
  })

  test('blocks publication when a published dataset contains stale semantic field ids', async () => {
    const tables = seededTables()
    tables.semantic_datasets[0].selection = {
      fieldIds: ['field-month', 'deleted-field'],
      metricIds: ['metric-revenue'],
      relationshipIds: [],
    }

    const result = await evaluateGuidedPublishReadinessForProject({
      supabase: createSupabase(tables) as never,
      projectId,
      selectedDashboardId: dashboardId,
      selectedVersionId: versionId,
      evaluatedAt: '2026-07-13T02:00:00.000Z',
    })

    expect(result.readiness.publishEligible).toBe(false)
    expect(result.readiness.blockers.find(check => check.id === 'dataset_draft')?.message)
      .toContain('stale semantic references')
  })

  test('recomputes preflight instead of caching stale results', async () => {
    const first = await evaluateGuidedPublishReadinessForProject({
      supabase: createSupabase(seededTables({ chartValidationState: 'invalid' })) as never,
      projectId,
      selectedDashboardId: dashboardId,
      selectedVersionId: versionId,
      evaluatedAt: '2026-07-13T02:00:00.000Z',
    })
    const second = await evaluateGuidedPublishReadinessForProject({
      supabase: createSupabase(seededTables()) as never,
      projectId,
      selectedDashboardId: dashboardId,
      selectedVersionId: versionId,
      evaluatedAt: '2026-07-13T02:05:00.000Z',
    })

    expect(first.readiness.publishEligible).toBe(false)
    expect(second.readiness.publishEligible).toBe(true)
    expect(second.readiness.evaluatedAt).toBe('2026-07-13T02:05:00.000Z')
  })

  test('keeps project assets visible and fails closed when guided review storage is not migrated', async () => {
    const result = await evaluateGuidedPublishReadinessForProject({
      supabase: createSupabase(seededTables(), { missingGuidedReviewSchema: true }) as never,
      projectId,
      selectedDashboardId: dashboardId,
      selectedVersionId: versionId,
      evaluatedAt: '2026-07-13T02:10:00.000Z',
    })

    expect(result.readiness.publishEligible).toBe(false)
    expect(result.readiness.blockers.find(check => check.id === 'schema_introspection')?.message)
      .toContain('20260713090000_guided_review_state.sql')
    expect(result.metadata.guidedReviewStorage).toBe('migration_required')
    expect(result.metadata.dashboardCount).toBe(1)
    expect(result.metadata.chartCount).toBe(1)
    expect(result.metadata.slotCount).toBe(1)
  })

  test('blocks publication before the client route when immutable release storage is not migrated', async () => {
    const result = await evaluateGuidedPublishReadinessForProject({
      supabase: createSupabase(seededTables(), { missingReleaseStorage: true }) as never,
      projectId,
      selectedDashboardId: dashboardId,
      selectedVersionId: versionId,
      evaluatedAt: '2026-07-13T02:15:00.000Z',
    })

    expect(result.readiness.publishEligible).toBe(false)
    expect(result.readiness.blockers.find(check => check.id === 'release_storage')?.message)
      .toContain('20260714160000_immutable_dashboard_releases.sql')
    expect(result.metadata.releaseStorage).toBe('migration_required')
    expect(result.metadata.releaseStorageMigration).toBe('20260714160000_immutable_dashboard_releases.sql')
  })
})
