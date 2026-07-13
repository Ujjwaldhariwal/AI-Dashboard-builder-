import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

import { createGuidedPublishReadinessGetHandler } from '../src/app/api/admin/guided-review/publish-readiness/route'
import { createPublishedDashboardPublishPostHandler } from '../src/app/api/admin/published-dashboards/[id]/publish/route'
import { approveGuidedSemanticDraft, buildGuidedReviewState } from '../src/lib/dashboardos/guided-review'
import { SUPABASE_URL } from '../src/lib/supabase/config'
import type { AuthedSupabaseContext } from '../src/lib/supabase/server'
import type { DataSourceColumnMetadata } from '../src/types/data-source'

type SeedIds = ReturnType<typeof createSeedIds>

interface IntegrationFixture {
  service: SupabaseClient
  authed: AuthedSupabaseContext
  ids: SeedIds
}

function loadLocalEnv() {
  const envPath = join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    if (process.env[key]) continue

    const rawValue = trimmed.slice(separator + 1).trim()
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
  }
}

loadLocalEnv()

const shouldRunIntegration =
  process.env.DASHBOARDOS_INTEGRATION_SUPABASE === '1'
  && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

function createSupabase(key: string) {
  return createClient(SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as SupabaseClient
}

function createSeedIds() {
  return {
    tenantId: randomUUID(),
    projectId: randomUUID(),
    blockedProjectId: randomUUID(),
    dataSourceId: randomUUID(),
    profileId: randomUUID(),
    modelId: randomUUID(),
    entityId: randomUUID(),
    monthFieldId: randomUUID(),
    regionFieldId: randomUUID(),
    revenueMetricId: randomUUID(),
    datasetId: randomUUID(),
    chartId: randomUUID(),
    dashboardId: randomUUID(),
    versionId: randomUUID(),
    pageId: randomUUID(),
    slotId: randomUUID(),
  }
}

function column(ids: SeedIds, columnName: string, dataType: string, index: number): DataSourceColumnMetadata {
  return {
    id: `${ids.dataSourceId}-${columnName}`,
    dataSourceId: ids.dataSourceId,
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

function guidedState(ids: SeedIds, userId: string) {
  return approveGuidedSemanticDraft(
    buildGuidedReviewState([
      column(ids, 'month', 'date', 1),
      column(ids, 'region', 'text', 2),
      column(ids, 'revenue_amount', 'numeric', 3),
    ], {
      profileId: ids.profileId,
      dataSourceId: ids.dataSourceId,
      schemaHash: 'integration-guided-schema-v1',
      generatedAt: '2026-07-13T00:00:00.000Z',
    }),
    userId,
    '2026-07-13T01:00:00.000Z',
    {
      modelId: ids.modelId,
      modelName: 'Integration Revenue Semantic Model',
      modelVersion: 1,
      materializedAt: '2026-07-13T01:00:00.000Z',
      fieldCount: 2,
      metricCount: 1,
      relationshipCount: 0,
    },
  )
}

async function assertNoError<T>(
  label: string,
  result: { data: T; error: null } | { data: T; error: { message: string } },
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

async function seedGuidedProject(service: SupabaseClient, ids: SeedIds, userId: string) {
  const suffix = ids.tenantId.slice(0, 8)

  await assertNoError('seed tenant', await service.from('tenants').insert({
    id: ids.tenantId,
    name: `Guided Integration ${suffix}`,
    slug: `guided-integration-${suffix}`,
    status: 'active',
    primary_domain: null,
    branding: {},
  }))
  await assertNoError('seed projects', await service.from('dashboard_projects').insert([
    {
      id: ids.projectId,
      tenant_id: ids.tenantId,
      name: 'Integration Guided Project',
      description: 'Seeded non-demo guided publish integration project.',
      status: 'active',
    },
    {
      id: ids.blockedProjectId,
      tenant_id: ids.tenantId,
      name: 'Unassigned Guided Project',
      description: 'Wrong-project access fixture.',
      status: 'active',
    },
  ]))
  await assertNoError('seed membership', await service.from('tenant_memberships').insert({
    tenant_id: ids.tenantId,
    user_id: userId,
    role: 'viewer',
  }))
  await assertNoError('seed project assignment', await service.from('project_assignments').insert({
    project_id: ids.projectId,
    user_id: userId,
    role: 'editor',
  }))
  await assertNoError('seed data source', await service.from('data_sources').insert({
    id: ids.dataSourceId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    name: 'Integration Warehouse',
    type: 'postgres',
    status: 'active',
    connection_config: { host: 'integration.local', database: 'warehouse' },
    credential_ciphertext: 'integration-fixture',
    credential_key_id: 'integration-test',
    last_test_status: 'success',
  }))
  await assertNoError('seed model', await service.from('business_models').insert({
    id: ids.modelId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    name: 'Integration Revenue Semantic Model',
    description: 'Materialized from the approved guided semantic draft.',
    status: 'approved',
    version: 1,
    approved_at: '2026-07-13T01:00:00.000Z',
  }))
  await assertNoError('link active model', await service
    .from('dashboard_projects')
    .update({ active_business_model_id: ids.modelId })
    .eq('id', ids.projectId))
  await assertNoError('seed guided profile', await service.from('guided_schema_profiles').insert({
    id: ids.profileId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    data_source_id: ids.dataSourceId,
    schema_hash: 'integration-guided-schema-v1',
    state: guidedState(ids, userId),
    created_at: '2026-07-13T01:00:00.000Z',
    updated_at: '2026-07-13T01:00:00.000Z',
  }))
  await assertNoError('seed semantic entity', await service.from('business_entities').insert({
    id: ids.entityId,
    model_id: ids.modelId,
    name: 'Monthly Revenue',
    semantic_key: 'monthly_revenue',
    type: 'fact',
    source_ref: { schema: 'public', table: 'monthly_revenue' },
  }))
  await assertNoError('seed semantic fields', await service.from('business_fields').insert([
    {
      id: ids.monthFieldId,
      entity_id: ids.entityId,
      name: 'Month',
      semantic_key: 'month',
      role: 'date',
      source_column: { column: 'month' },
      is_filterable: true,
    },
    {
      id: ids.regionFieldId,
      entity_id: ids.entityId,
      name: 'Region',
      semantic_key: 'region',
      role: 'dimension',
      source_column: { column: 'region' },
      is_filterable: true,
    },
  ]))
  await assertNoError('seed semantic metric', await service.from('business_metrics').insert({
    id: ids.revenueMetricId,
    model_id: ids.modelId,
    entity_id: ids.entityId,
    name: 'Revenue',
    semantic_key: 'revenue',
    aggregation: 'sum',
    expression: { field: 'revenue_amount' },
    unit: 'currency',
    display_format: 'currency',
  }))
  await assertNoError('seed dataset', await service.from('semantic_datasets').insert({
    id: ids.datasetId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    model_id: ids.modelId,
    name: 'Integration Revenue Dataset',
    description: 'Generated from approved semantic draft v1.',
    status: 'published',
    selection: {
      fieldIds: [ids.monthFieldId, ids.regionFieldId],
      metricIds: [ids.revenueMetricId],
      relationshipIds: [],
    },
    cache_policy: { ttlSeconds: 300 },
  }))
  await assertNoError('seed chart', await service.from('dashboard_chart_configs').insert({
    id: ids.chartId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    dataset_id: ids.datasetId,
    name: 'Integration Revenue Trend',
    description: 'Published guided draft chart.',
    status: 'published',
    template_id: 'line',
    encoding: {
      xAxisFieldId: ids.monthFieldId,
      yMetricIds: [ids.revenueMetricId],
      tooltipFieldIds: [ids.regionFieldId],
      labelById: {},
      colorById: {},
      filters: [],
      limit: 100,
    },
    presentation: {
      size: 'standard',
      showLegend: true,
      showLabels: false,
      valueFormat: 'currency',
    },
    interactions: {},
    layout: { order: 0, gridSpan: 1 },
    validation_state: 'valid',
    last_validated_at: '2026-07-13T01:00:00.000Z',
    published_at: '2026-07-13T01:00:00.000Z',
  }))
  await assertNoError('seed dashboard', await service.from('published_dashboards').insert({
    id: ids.dashboardId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    name: 'Integration Revenue Dashboard',
    slug: 'integration-revenue',
    description: 'Seeded non-demo guided dashboard.',
    status: 'draft',
    current_version_id: null,
    created_by: userId,
    updated_by: userId,
  }))
  await assertNoError('seed dashboard version', await service.from('dashboard_versions').insert({
    id: ids.versionId,
    dashboard_id: ids.dashboardId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    version_number: 1,
    status: 'draft',
    title: 'Integration guided release',
    notes: 'Seeded non-demo guided publish handoff.',
    layout: { mode: 'responsive-grid' },
    created_by: userId,
  }))
  await assertNoError('seed dashboard page', await service.from('dashboard_pages').insert({
    id: ids.pageId,
    version_id: ids.versionId,
    dashboard_id: ids.dashboardId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    title: 'Overview',
    slug: 'overview',
    sort_order: 0,
    layout: { columns: 12 },
  }))
  await assertNoError('seed dashboard slot', await service.from('dashboard_chart_slots').insert({
    id: ids.slotId,
    page_id: ids.pageId,
    version_id: ids.versionId,
    dashboard_id: ids.dashboardId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    chart_config_id: ids.chartId,
    title: 'Revenue trend',
    slot_key: 'revenue-trend',
    row_index: 0,
    column_index: 0,
    width: 8,
    height: 4,
    settings: {},
  }))
}

async function cleanupFixture(fixture: IntegrationFixture | undefined, authUserId: string | null) {
  if (!fixture) return
  await fixture.service
    .from('published_dashboards')
    .update({ current_version_id: null })
    .eq('id', fixture.ids.dashboardId)
  await fixture.service.from('tenants').delete().eq('id', fixture.ids.tenantId)
  if (authUserId) await fixture.service.auth.admin.deleteUser(authUserId)
}

async function createFixture(): Promise<IntegrationFixture> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!serviceKey || !anonKey) throw new Error('Supabase integration keys are not configured.')

  const service = createSupabase(serviceKey)
  const authClient = createSupabase(anonKey)
  const email = `guided-publish-${randomUUID()}@dashboardos.test`
  const password = `Guided-${randomUUID()}-publish-1`
  const ids = createSeedIds()

  const userResult = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (userResult.error) throw new Error(`create auth user: ${userResult.error.message}`)
  const userId = userResult.data.user?.id
  if (!userId) throw new Error('Supabase did not return a created auth user id.')

  try {
    await seedGuidedProject(service, ids, userId)
    const signInResult = await authClient.auth.signInWithPassword({ email, password })
    if (signInResult.error) throw new Error(`sign in integration user: ${signInResult.error.message}`)
    return {
      service,
      ids,
      authed: {
        supabase: authClient,
        userId,
        role: 'employee',
      },
    }
  } catch (error) {
    await service.from('tenants').delete().eq('id', ids.tenantId)
    await service.auth.admin.deleteUser(userId)
    throw error
  }
}

function preflightUrl(ids: SeedIds, projectId = ids.projectId) {
  return `http://dashboardos.test/api/admin/guided-review/publish-readiness?projectId=${projectId}&dashboardId=${ids.dashboardId}&versionId=${ids.versionId}`
}

test.describe.serial('guided publish Supabase integration', () => {
  test.skip(!shouldRunIntegration, 'Set DASHBOARDOS_INTEGRATION_SUPABASE=1 with Supabase anon and service keys to run DB-backed guided publish integration.')

  let fixture: IntegrationFixture | undefined
  let authUserId: string | null = null

  test.beforeAll(async () => {
    fixture = await createFixture()
    authUserId = fixture.authed.userId
  })

  test.afterAll(async () => {
    await cleanupFixture(fixture, authUserId)
  })

  test('blocks unauthenticated preflight requests', async () => {
    const GET = createGuidedPublishReadinessGetHandler(async () => null)
    const response = await GET(new NextRequest(preflightUrl(fixture!.ids)))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  test('blocks wrong-project scoped preflight access through RLS-aware auth context', async () => {
    const GET = createGuidedPublishReadinessGetHandler(async () => fixture!.authed)
    const response = await GET(new NextRequest(preflightUrl(fixture!.ids, fixture!.ids.blockedProjectId)))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain('Project editor access is required')
  })

  test('returns ready preflight for the seeded non-demo guided project', async () => {
    const GET = createGuidedPublishReadinessGetHandler(async () => fixture!.authed)
    const response = await GET(new NextRequest(preflightUrl(fixture!.ids)))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.readiness.status).toBe('ready_to_publish')
    expect(body.readiness.publishEligible).toBe(true)
    expect(body.metadata.projectId).toBe(fixture!.ids.projectId)
    expect(body.metadata.datasetCount).toBe(1)
    expect(body.metadata.slotCount).toBe(1)
    expect(body.persistence.strategy).toBe('recomputed')
  })

  test('distinguishes warning readiness from blocking validation failures', async () => {
    const GET = createGuidedPublishReadinessGetHandler(async () => fixture!.authed)

    await assertNoError('set warning chart validation', await fixture!.service
      .from('dashboard_chart_configs')
      .update({ validation_state: 'warning' })
      .eq('id', fixture!.ids.chartId))
    const warningResponse = await GET(new NextRequest(preflightUrl(fixture!.ids)))
    const warningBody = await warningResponse.json()

    expect(warningResponse.status).toBe(200)
    expect(warningBody.readiness.status).toBe('ready_to_publish')
    expect(warningBody.readiness.publishEligible).toBe(true)
    expect(warningBody.readiness.warnings.map((check: { id: string }) => check.id)).toContain('runtime_validation')

    await assertNoError('set invalid chart validation', await fixture!.service
      .from('dashboard_chart_configs')
      .update({ validation_state: 'invalid' })
      .eq('id', fixture!.ids.chartId))
    const invalidResponse = await GET(new NextRequest(preflightUrl(fixture!.ids)))
    const invalidBody = await invalidResponse.json()

    expect(invalidResponse.status).toBe(200)
    expect(invalidBody.readiness.status).toBe('blocked_by_validation')
    expect(invalidBody.readiness.publishEligible).toBe(false)
    expect(invalidBody.readiness.blockers.map((check: { id: string }) => check.id)).toContain('runtime_validation')

    await assertNoError('restore chart validation', await fixture!.service
      .from('dashboard_chart_configs')
      .update({ validation_state: 'valid' })
      .eq('id', fixture!.ids.chartId))
  })

  test('revalidates readiness during publish and records the persisted handoff', async () => {
    const POST = createPublishedDashboardPublishPostHandler(async () => fixture!.authed)
    const response = await POST(
      new Request(`http://dashboardos.test/api/admin/published-dashboards/${fixture!.ids.dashboardId}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          versionId: fixture!.ids.versionId,
          notes: 'DB-backed guided publish integration.',
        }),
      }),
      { params: Promise.resolve({ id: fixture!.ids.dashboardId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dashboard.status).toBe('published')
    expect(body.version.status).toBe('published')

    const dashboard = await assertNoError('read published dashboard', await fixture!.service
      .from('published_dashboards')
      .select('status, current_version_id')
      .eq('id', fixture!.ids.dashboardId)
      .single())
    if (!dashboard) throw new Error('Published dashboard row was not found.')
    expect(dashboard.status).toBe('published')
    expect(dashboard.current_version_id).toBe(fixture!.ids.versionId)

    const event = await assertNoError('read publish event', await fixture!.service
      .from('dashboard_publish_events')
      .select('event_type, metadata')
      .eq('dashboard_id', fixture!.ids.dashboardId)
      .eq('event_type', 'published')
      .single())
    if (!event) throw new Error('Publish event row was not found.')
    expect(event.metadata.readinessStatus).toBe('ready_to_publish')
    expect(event.metadata.preflightStrategy).toBe('recomputed')
  })
})
