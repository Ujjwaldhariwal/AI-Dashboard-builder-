import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'

import {
  createGuidedDashboardDraftPostHandler,
  GUIDED_DASHBOARD_GENERATION_PAUSED_CODE,
} from '../src/app/api/admin/guided-review/dashboard-draft/route'
import {
  buildSchemaRefreshPlan,
  runDataSourceSchemaIntrospection,
  schemaHashForTables,
} from '../src/lib/data-sources/schema-introspection-runner'
import {
  buildPostgresSchemaIntrospectionResult,
  type PostgresSchemaRow,
  type PostgresTableMetadata,
} from '../src/lib/data-sources/postgres-runtime'
import {
  applyGuidedReviewDecision,
  approveGuidedSemanticDraft,
  buildGuidedPublishReadiness,
  buildGuidedReviewState,
  buildGuidedSchemaProfile,
  GuidedReviewStateConflictError,
} from '../src/lib/dashboardos/guided-review'
import { GuidedProfileConflictError, updateGuidedProfileDecision } from '../src/lib/dashboardos/guided-review-store'
import { requireProjectAccess } from '../src/lib/security/project-access'
import type { DataSourceColumnMetadata } from '../src/types/data-source'

const tenantId = '11111111-1111-4111-8111-111111111111'
const otherTenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const projectId = '22222222-2222-4222-8222-222222222222'
const dataSourceId = '33333333-3333-4333-8333-333333333333'
const datasetId = '44444444-4444-4444-8444-444444444444'
const modelId = '55555555-5555-4555-8555-555555555555'
const dashboardId = '66666666-6666-4666-8666-666666666666'
const versionId = '77777777-7777-4777-8777-777777777777'
const chartId = '88888888-8888-4888-8888-888888888888'

type Mutation = { table: string; operation: string; payload?: unknown }

class FakeQuery {
  private operation = 'select'
  private payload: unknown
  private filters: Record<string, unknown> = {}
  private singleMode = false

  constructor(
    private table: string,
    private fake: FakeSupabase,
  ) {}

  select() { return this }
  order() { return this }
  limit() { return this }
  eq(column: string, value: unknown) {
    this.filters[column] = value
    return this
  }
  update(payload: unknown) {
    this.operation = 'update'
    this.payload = payload
    return this
  }
  insert(payload: unknown) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }
  delete() {
    this.operation = 'delete'
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
    if (this.operation !== 'select') {
      this.fake.mutations.push({ table: this.table, operation: this.operation, payload: this.payload })
      resolve({ data: null, error: null })
      return
    }

    const rows = (this.fake.tables[this.table] ?? []).filter(row => (
      Object.entries(this.filters).every(([column, value]) => row[column] === value)
    ))
    resolve({ data: this.singleMode ? rows[0] ?? null : rows, error: null })
  }
}

class FakeSupabase {
  readonly mutations: Mutation[] = []
  readonly rpcCalls: Array<{ name: string; payload: unknown }> = []

  constructor(readonly tables: Record<string, Record<string, unknown>[]>) {}

  from(table: string) {
    return new FakeQuery(table, this)
  }

  async rpc(name: string, payload: unknown) {
    this.rpcCalls.push({ name, payload })
    return { data: null, error: null }
  }
}

function schemaTables(): PostgresTableMetadata[] {
  return [{
    schemaName: 'public',
    tableName: 'orders',
    tableType: 'BASE TABLE',
    columns: [{
      schemaName: 'public',
      tableName: 'orders',
      columnName: 'order_id',
      ordinalPosition: 1,
      dataType: 'uuid',
      udtName: 'uuid',
      isNullable: false,
      columnDefault: null,
    }],
  }]
}

function completeIntrospection(tables = schemaTables()) {
  return {
    tables,
    completeness: {
      complete: true as const,
      reasons: [],
      observedColumnCount: 1,
      acceptedColumnCount: 1,
      maxColumns: 5_000,
      maxTables: 500,
    },
  }
}

function schemaRunnerFake(schemaHash: string) {
  return new FakeSupabase({
    data_sources: [{
      id: dataSourceId,
      tenant_id: tenantId,
      project_id: projectId,
      status: 'active',
      credential_ciphertext: 'encrypted-test-credential',
      schema_hash: schemaHash,
    }],
  })
}

function runnerDependencies(introspection: ReturnType<typeof completeIntrospection>, calls: { invalidations: number; profiles: number }) {
  return {
    testConnection: async () => ({
      ok: true as const,
      latencyMs: 3,
      database: 'test',
      user: 'readonly',
      serverTime: '2026-07-14T00:00:00.000Z',
    }),
    introspectSchema: async () => introspection,
    invalidateDependents: async () => {
      calls.invalidations += 1
      return { modelIds: [], datasetIds: [], chartIds: [] }
    },
    persistGuidedProfile: async () => {
      calls.profiles += 1
      return null as never
    },
  }
}

test.describe('release integrity hardening', () => {
  test('same-hash refresh is a no-op for schema, dependent assets, and guided review state', async () => {
    const tables = schemaTables()
    const schemaHash = schemaHashForTables(tables)
    const fake = schemaRunnerFake(schemaHash)
    const calls = { invalidations: 0, profiles: 0 }

    const first = await runDataSourceSchemaIntrospection({
      supabase: fake as never,
      dataSourceId,
      dependencies: runnerDependencies(completeIntrospection(tables), calls),
    })
    const retry = await runDataSourceSchemaIntrospection({
      supabase: fake as never,
      dataSourceId,
      dependencies: runnerDependencies(completeIntrospection(tables), calls),
    })

    expect(buildSchemaRefreshPlan({ previousSchemaHash: schemaHash, nextSchemaHash: schemaHash, complete: true })).toEqual({
      complete: true,
      schemaChanged: false,
      noOp: true,
      replaceSnapshot: false,
      invalidateDependents: false,
      persistGuidedProfile: false,
    })
    expect(first.noOp).toBe(true)
    expect(retry.noOp).toBe(true)
    expect(calls).toEqual({ invalidations: 0, profiles: 0 })
    expect(fake.rpcCalls).toEqual([])
    expect(fake.mutations.filter(mutation => mutation.table === 'data_source_columns')).toEqual([])
    expect(fake.mutations.filter(mutation => mutation.table === 'guided_schema_profiles')).toEqual([])
  })

  test('truncated introspection is explicit and preserves the previous active snapshot', async () => {
    const rows: PostgresSchemaRow[] = [1, 2, 3].map(index => ({
      schemaName: 'public',
      tableName: 'orders',
      tableType: 'BASE TABLE',
      columnName: `column_${index}`,
      ordinalPosition: index,
      dataType: 'text',
      udtName: 'text',
      isNullable: false,
      columnDefault: null,
    }))
    const truncated = buildPostgresSchemaIntrospectionResult(rows, { maxColumns: 2, maxTables: 10 })
    const fake = schemaRunnerFake('previous-complete-hash')
    const calls = { invalidations: 0, profiles: 0 }

    await expect(runDataSourceSchemaIntrospection({
      supabase: fake as never,
      dataSourceId,
      dependencies: runnerDependencies(truncated as never, calls),
    })).rejects.toMatchObject({ code: 'SCHEMA_INTROSPECTION_INCOMPLETE' })

    expect(truncated.completeness.complete).toBe(false)
    expect(truncated.completeness.reasons).toContain('column_limit')
    expect(fake.rpcCalls).toEqual([])
    expect(calls).toEqual({ invalidations: 0, profiles: 0 })
    expect(fake.mutations.filter(mutation => mutation.table === 'data_source_columns')).toEqual([])
    const sourceUpdate = fake.mutations.find(mutation => mutation.table === 'data_sources' && mutation.operation === 'update')
    expect(sourceUpdate?.payload).toMatchObject({
      schema_last_status: 'error',
      schema_refresh_reason: 'introspection_incomplete',
    })
    expect(sourceUpdate?.payload).not.toHaveProperty('status')
    expect(sourceUpdate?.payload).not.toHaveProperty('schema_hash')
  })

  test('guided dashboard generation fails closed and remains zero-write on retry', async () => {
    const fake = new FakeSupabase({
      dashboard_projects: [{ id: projectId, tenant_id: tenantId }],
    })
    const POST = createGuidedDashboardDraftPostHandler(async () => ({
      supabase: fake as never,
      userId: '99999999-9999-4999-8999-999999999999',
      role: 'admin',
    }))
    const request = () => new NextRequest('http://dashboardos.test/api/admin/guided-review/dashboard-draft', {
      method: 'POST',
      body: JSON.stringify({ tenantId, projectId, datasetId }),
    })

    const first = await POST(request())
    const retry = await POST(request())
    const body = await first.json()

    expect(first.status).toBe(409)
    expect(retry.status).toBe(409)
    expect(body.code).toBe(GUIDED_DASHBOARD_GENERATION_PAUSED_CODE)
    expect(body.error).toContain('No objects were created')
    expect(fake.mutations).toEqual([])
    expect(fake.rpcCalls).toEqual([])
  })

  test('tenant/project pairing is validated before assignment and platform shortcuts', async () => {
    const fake = new FakeSupabase({
      dashboard_projects: [{ id: projectId, tenant_id: tenantId }],
      project_assignments: [{ project_id: projectId, user_id: 'user-1', role: 'editor' }],
    })

    const assigned = await requireProjectAccess({
      supabase: fake as never,
      userId: 'user-1',
      platformRole: 'employee',
      projectId,
      tenantId: otherTenantId,
      editor: true,
    })
    const platformAdmin = await requireProjectAccess({
      supabase: fake as never,
      userId: 'admin-1',
      platformRole: 'admin',
      projectId,
      tenantId: otherTenantId,
      editor: true,
    })

    expect(assigned).toMatchObject({ ok: false, status: 404 })
    expect(platformAdmin).toMatchObject({ ok: false, status: 404 })
  })

  test('review discovery is not silently capped and approved state rejects later decisions', () => {
    const columns = Array.from({ length: 12 }, (_, index) => column(`email_${index + 1}`, index + 1))
    const profile = buildGuidedSchemaProfile(columns)
    const approved = approveGuidedSemanticDraft(buildGuidedReviewState(columns), 'admin-1', '2026-07-14T00:00:00.000Z')

    expect(profile.reviewItems.length).toBeGreaterThan(8)
    expect(() => applyGuidedReviewDecision(approved, {
      itemId: profile.reviewItems[0]!.id,
      action: 'keep_hidden',
      decidedBy: 'admin-1',
      decidedAt: '2026-07-14T01:00:00.000Z',
    })).toThrow(GuidedReviewStateConflictError)
  })

  test('concurrent guided decision writes fail with an explicit conflict instead of overwriting state', async () => {
    const state = buildGuidedReviewState([column('customer_email', 1)])
    const item = state.semanticDraft.needsReview[0]
    const fake = new FakeSupabase({
      guided_schema_profiles: [{
        id: '99999999-9999-4999-8999-999999999998',
        tenant_id: tenantId,
        project_id: projectId,
        data_source_id: dataSourceId,
        schema_hash: 'schema-v1',
        state,
        created_at: '2026-07-14T00:00:00.000Z',
        updated_at: '2026-07-14T00:00:00.000Z',
      }],
    })

    await expect(updateGuidedProfileDecision({
      supabase: fake as never,
      profileId: '99999999-9999-4999-8999-999999999998',
      decision: {
        itemId: item!.id,
        action: 'keep_hidden',
        decidedBy: 'admin-1',
        decidedAt: '2026-07-14T01:00:00.000Z',
      },
    })).rejects.toBeInstanceOf(GuidedProfileConflictError)
  })

  test('incomplete schema state is an explicit publish blocker', () => {
    const reviewed = buildGuidedReviewState([
      column('order_date', 1, 'date'),
      column('revenue_amount', 2, 'numeric'),
    ], {
      dataSourceId,
      schemaHash: 'complete-schema-v1',
      generatedAt: '2026-07-14T00:00:00.000Z',
    })
    const approved = approveGuidedSemanticDraft(reviewed, 'admin-1', '2026-07-14T01:00:00.000Z', {
      modelId,
      modelName: 'Orders',
      modelVersion: 1,
      materializedAt: '2026-07-14T01:00:00.000Z',
      fieldCount: 1,
      metricCount: 1,
      relationshipCount: 0,
    })
    const readiness = buildGuidedPublishReadiness({
      profileState: approved,
      schemaIntrospection: {
        dataSourceId,
        status: 'error',
        error: 'Schema introspection is incomplete.',
        schemaHash: 'complete-schema-v1',
      },
      models: [{ id: modelId, status: 'approved', version: 1 }],
      activeSemanticModelId: modelId,
      datasets: [{
        id: datasetId,
        modelId,
        status: 'published',
        selection: { fieldIds: ['field-1'], metricIds: ['metric-1'], relationshipIds: [] },
      }],
      charts: [{
        id: chartId,
        datasetId,
        status: 'published',
        validationState: 'valid',
        templateId: 'line',
        encoding: { yMetricIds: ['metric-1'], tooltipFieldIds: [], labelById: {}, colorById: {} },
      }],
      dashboards: [{ id: dashboardId, slug: 'orders', status: 'draft', currentVersionId: null, publishedAt: null }],
      versions: [{ id: versionId, dashboardId, status: 'draft', versionNumber: 1, notes: null }],
      pages: [{ id: 'page-1', versionId, slug: 'overview' }],
      slots: [{ id: 'slot-1', versionId, chartConfigId: chartId }],
      selectedDashboardId: dashboardId,
      selectedVersionId: versionId,
      clientUrl: '/client/acme',
    })

    expect(readiness.publishEligible).toBe(false)
    expect(readiness.blockers.map(check => check.id)).toContain('schema_introspection')
    expect(readiness.checks.find(check => check.id === 'schema_introspection')?.message).toContain('incomplete')
  })
})

function column(columnName: string, ordinalPosition: number, dataType = 'text'): DataSourceColumnMetadata {
  return {
    id: `${dataSourceId}:public.orders.${columnName}`,
    dataSourceId,
    schemaName: 'public',
    tableName: 'orders',
    columnName,
    ordinalPosition,
    dataType,
    udtName: dataType,
    isNullable: false,
    columnDefault: null,
    createdAt: '2026-07-14T00:00:00.000Z',
  }
}
