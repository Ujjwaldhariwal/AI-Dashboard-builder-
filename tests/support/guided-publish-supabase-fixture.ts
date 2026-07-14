import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { approveGuidedSemanticDraft, buildGuidedReviewState } from '../../src/lib/dashboardos/guided-review'
import { SUPABASE_URL } from '../../src/lib/supabase/config'
import type { AuthedSupabaseContext } from '../../src/lib/supabase/server'
import type { DataSourceColumnMetadata } from '../../src/types/data-source'

export type GuidedPublishSeedIds = ReturnType<typeof createGuidedPublishSeedIds>

export interface GuidedPublishSupabaseFixture {
  service: SupabaseClient
  authed: AuthedSupabaseContext
  ids: GuidedPublishSeedIds
  credentials: {
    employeeId: string
    email: string
    password: string
  }
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

export const shouldRunGuidedPublishSupabaseIntegration =
  process.env.DASHBOARDOS_INTEGRATION_SUPABASE === '1'
  && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

export const shouldRunGuidedPublishLiveHttpIntegration =
  shouldRunGuidedPublishSupabaseIntegration
  && process.env.DASHBOARDOS_LIVE_HTTP_GUIDED_PUBLISH === '1'

function createSupabase(key: string) {
  return createClient(SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as SupabaseClient
}

export function createGuidedPublishSeedIds() {
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
    revenueFieldId: randomUUID(),
    revenueMetricId: randomUUID(),
    datasetId: randomUUID(),
    chartId: randomUUID(),
    dashboardId: randomUUID(),
    versionId: randomUUID(),
    pageId: randomUUID(),
    slotId: randomUUID(),
  }
}

function column(ids: GuidedPublishSeedIds, columnName: string, dataType: string, index: number): DataSourceColumnMetadata {
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

function guidedState(ids: GuidedPublishSeedIds, userId: string) {
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
      fieldCount: 3,
      metricCount: 1,
      relationshipCount: 0,
    },
  )
}

export async function assertNoSupabaseError<T>(
  label: string,
  result: { data: T; error: null } | { data: T; error: { message: string } },
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

async function seedGuidedProject(service: SupabaseClient, ids: GuidedPublishSeedIds, userId: string) {
  const suffix = ids.tenantId.slice(0, 8)

  await assertNoSupabaseError('seed tenant', await service.from('tenants').insert({
    id: ids.tenantId,
    name: `Guided Integration ${suffix}`,
    slug: `guided-integration-${suffix}`,
    status: 'active',
    primary_domain: null,
    branding: {},
  }))
  await assertNoSupabaseError('seed projects', await service.from('dashboard_projects').insert([
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
  await assertNoSupabaseError('seed membership', await service.from('tenant_memberships').insert({
    tenant_id: ids.tenantId,
    user_id: userId,
    role: 'viewer',
  }))
  await assertNoSupabaseError('seed project assignment', await service.from('project_assignments').insert({
    project_id: ids.projectId,
    user_id: userId,
    role: 'editor',
  }))
  await assertNoSupabaseError('seed data source', await service.from('data_sources').insert({
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
    schema_last_status: 'ok',
    schema_hash: 'integration-guided-schema-v1',
    schema_table_count: 1,
    schema_column_count: 3,
  }))
  await assertNoSupabaseError('seed model', await service.from('business_models').insert({
    id: ids.modelId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    name: 'Integration Revenue Semantic Model',
    description: 'Materialized from the approved guided semantic draft.',
    status: 'approved',
    version: 1,
    approved_at: '2026-07-13T01:00:00.000Z',
  }))
  await assertNoSupabaseError('link active model', await service
    .from('dashboard_projects')
    .update({ active_business_model_id: ids.modelId })
    .eq('id', ids.projectId))
  await assertNoSupabaseError('seed guided profile', await service.from('guided_schema_profiles').insert({
    id: ids.profileId,
    tenant_id: ids.tenantId,
    project_id: ids.projectId,
    data_source_id: ids.dataSourceId,
    schema_hash: 'integration-guided-schema-v1',
    state: guidedState(ids, userId),
    created_at: '2026-07-13T01:00:00.000Z',
    updated_at: '2026-07-13T01:00:00.000Z',
  }))
  await assertNoSupabaseError('seed semantic entity', await service.from('business_entities').insert({
    id: ids.entityId,
    model_id: ids.modelId,
    name: 'Monthly Revenue',
    semantic_key: 'monthly_revenue',
    type: 'fact',
    source_ref: { schema: 'public', table: 'monthly_revenue' },
  }))
  await assertNoSupabaseError('seed semantic fields', await service.from('business_fields').insert([
    {
      id: ids.monthFieldId,
      entity_id: ids.entityId,
      name: 'Month',
      semantic_key: 'month',
      role: 'date',
      source_column: {
        dataSourceId: ids.dataSourceId,
        schemaName: 'public',
        tableName: 'monthly_revenue',
        columnName: 'month',
        dataType: 'date',
      },
      is_filterable: true,
    },
    {
      id: ids.regionFieldId,
      entity_id: ids.entityId,
      name: 'Region',
      semantic_key: 'region',
      role: 'dimension',
      source_column: {
        dataSourceId: ids.dataSourceId,
        schemaName: 'public',
        tableName: 'monthly_revenue',
        columnName: 'region',
        dataType: 'text',
      },
      is_filterable: true,
    },
    {
      id: ids.revenueFieldId,
      entity_id: ids.entityId,
      name: 'Revenue amount',
      semantic_key: 'revenue_amount',
      role: 'measure',
      source_column: {
        dataSourceId: ids.dataSourceId,
        schemaName: 'public',
        tableName: 'monthly_revenue',
        columnName: 'revenue_amount',
        dataType: 'numeric',
      },
      is_filterable: false,
    },
  ]))
  await assertNoSupabaseError('seed semantic metric', await service.from('business_metrics').insert({
    id: ids.revenueMetricId,
    model_id: ids.modelId,
    entity_id: ids.entityId,
    name: 'Revenue',
    semantic_key: 'revenue',
    aggregation: 'sum',
    expression: { fieldId: ids.revenueFieldId },
    unit: 'currency',
    display_format: 'currency',
  }))
  await assertNoSupabaseError('seed dataset', await service.from('semantic_datasets').insert({
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
  await assertNoSupabaseError('seed chart', await service.from('dashboard_chart_configs').insert({
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
  await assertNoSupabaseError('seed dashboard', await service.from('published_dashboards').insert({
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
  await assertNoSupabaseError('seed dashboard version', await service.from('dashboard_versions').insert({
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
  await assertNoSupabaseError('seed dashboard page', await service.from('dashboard_pages').insert({
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
  await assertNoSupabaseError('seed dashboard slot', await service.from('dashboard_chart_slots').insert({
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

export async function cleanupGuidedPublishSupabaseFixture(fixture: GuidedPublishSupabaseFixture | undefined, authUserId: string | null) {
  if (!fixture) return
  await fixture.service
    .from('published_dashboards')
    .update({ current_version_id: null })
    .eq('id', fixture.ids.dashboardId)
  await fixture.service.from('tenants').delete().eq('id', fixture.ids.tenantId)
  if (authUserId) await fixture.service.auth.admin.deleteUser(authUserId)
}

export async function createGuidedPublishSupabaseFixture(): Promise<GuidedPublishSupabaseFixture> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!serviceKey || !anonKey) throw new Error('Supabase integration keys are not configured.')

  const service = createSupabase(serviceKey)
  const authClient = createSupabase(anonKey)
  const emailDomain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN ?? 'company.com'
  const employeeId = `guided_${randomUUID().replace(/-/g, '').slice(0, 18)}`
  const email = `${employeeId}@${emailDomain}`
  const password = `Guided-${randomUUID()}-publish-1`
  const ids = createGuidedPublishSeedIds()

  const userResult = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { emp_id: employeeId.toUpperCase() },
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
      credentials: { employeeId, email, password },
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

export function guidedPublishPreflightPath(ids: GuidedPublishSeedIds, projectId = ids.projectId) {
  return `/api/admin/guided-review/publish-readiness?projectId=${projectId}&dashboardId=${ids.dashboardId}&versionId=${ids.versionId}`
}

export function guidedPublishPreflightUrl(ids: GuidedPublishSeedIds, projectId = ids.projectId) {
  return `http://dashboardos.test${guidedPublishPreflightPath(ids, projectId)}`
}
