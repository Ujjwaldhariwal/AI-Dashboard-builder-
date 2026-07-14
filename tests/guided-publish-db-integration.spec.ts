import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

import { createGuidedPublishReadinessGetHandler } from '../src/app/api/admin/guided-review/publish-readiness/route'
import { createPublishedDashboardPublishPostHandler } from '../src/app/api/admin/published-dashboards/[id]/publish/route'
import { createPublishedDashboardRollbackPostHandler } from '../src/app/api/admin/published-dashboards/[id]/rollback/route'
import {
  assertNoSupabaseError,
  cleanupGuidedPublishSupabaseFixture,
  createGuidedPublishSupabaseFixture,
  guidedPublishPreflightUrl,
  shouldRunGuidedPublishSupabaseIntegration,
  type GuidedPublishSupabaseFixture,
} from './support/guided-publish-supabase-fixture'

test.describe.serial('guided publish Supabase integration', () => {
  test.skip(!shouldRunGuidedPublishSupabaseIntegration, 'Set DASHBOARDOS_INTEGRATION_SUPABASE=1 with Supabase anon and service keys to run DB-backed guided publish integration.')

  let fixture: GuidedPublishSupabaseFixture | undefined
  let authUserId: string | null = null

  test.beforeAll(async () => {
    fixture = await createGuidedPublishSupabaseFixture()
    authUserId = fixture.authed.userId
  })

  test.afterAll(async () => {
    await cleanupGuidedPublishSupabaseFixture(fixture, authUserId)
  })

  test('blocks unauthenticated preflight requests', async () => {
    const GET = createGuidedPublishReadinessGetHandler(async () => null)
    const response = await GET(new NextRequest(guidedPublishPreflightUrl(fixture!.ids)))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  test('blocks wrong-project scoped preflight access through RLS-aware auth context', async () => {
    const GET = createGuidedPublishReadinessGetHandler(async () => fixture!.authed)
    const response = await GET(new NextRequest(guidedPublishPreflightUrl(fixture!.ids, fixture!.ids.blockedProjectId)))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain('Project editor access is required')
  })

  test('returns ready preflight for the seeded non-demo guided project', async () => {
    const GET = createGuidedPublishReadinessGetHandler(async () => fixture!.authed)
    const response = await GET(new NextRequest(guidedPublishPreflightUrl(fixture!.ids)))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.readiness.status).toBe('ready_to_publish')
    expect(body.readiness.publishEligible).toBe(true)
    expect(body.metadata.projectId).toBe(fixture!.ids.projectId)
    expect(body.metadata.datasetCount).toBe(1)
    expect(body.metadata.slotCount).toBe(1)
    expect(body.persistence.strategy).toBe('recomputed')
  })

  test('blocks warning and invalid chart states that the client runtime will not serve', async () => {
    const GET = createGuidedPublishReadinessGetHandler(async () => fixture!.authed)

    await assertNoSupabaseError('set warning chart validation', await fixture!.service
      .from('dashboard_chart_configs')
      .update({ validation_state: 'warning' })
      .eq('id', fixture!.ids.chartId))
    const warningResponse = await GET(new NextRequest(guidedPublishPreflightUrl(fixture!.ids)))
    const warningBody = await warningResponse.json()

    expect(warningResponse.status).toBe(200)
    expect(warningBody.readiness.status).toBe('blocked_by_validation')
    expect(warningBody.readiness.publishEligible).toBe(false)
    expect(warningBody.readiness.blockers.map((check: { id: string }) => check.id)).toContain('runtime_validation')

    await assertNoSupabaseError('set invalid chart validation', await fixture!.service
      .from('dashboard_chart_configs')
      .update({ validation_state: 'invalid' })
      .eq('id', fixture!.ids.chartId))
    const invalidResponse = await GET(new NextRequest(guidedPublishPreflightUrl(fixture!.ids)))
    const invalidBody = await invalidResponse.json()

    expect(invalidResponse.status).toBe(200)
    expect(invalidBody.readiness.status).toBe('blocked_by_validation')
    expect(invalidBody.readiness.publishEligible).toBe(false)
    expect(invalidBody.readiness.blockers.map((check: { id: string }) => check.id)).toContain('runtime_validation')

    await assertNoSupabaseError('restore chart validation', await fixture!.service
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
    expect(body.version.releaseSnapshotStatus).toBe('complete')
    expect(body.release).toMatchObject({ immutable: true, datasetSnapshotCount: 1, chartSnapshotCount: 1 })

    const dashboard = await assertNoSupabaseError('read published dashboard', await fixture!.service
      .from('published_dashboards')
      .select('status, current_version_id')
      .eq('id', fixture!.ids.dashboardId)
      .single())
    if (!dashboard) throw new Error('Published dashboard row was not found.')
    expect(dashboard.status).toBe('published')
    expect(dashboard.current_version_id).toBe(fixture!.ids.versionId)

    const firstReleaseChart = await assertNoSupabaseError('read immutable release chart', await fixture!.service
      .from('dashboard_release_chart_snapshots')
      .select('id, slot_id, source_chart_config_id, chart_config')
      .eq('version_id', fixture!.ids.versionId)
      .single())
    if (!firstReleaseChart) throw new Error('Release chart snapshot was not found.')
    expect(firstReleaseChart.slot_id).toBe(fixture!.ids.slotId)
    expect(firstReleaseChart.source_chart_config_id).toBe(fixture!.ids.chartId)
    expect(firstReleaseChart.chart_config.name).toBe('Integration Revenue Trend')

    const firstReleaseDataset = await assertNoSupabaseError('read immutable release dataset', await fixture!.service
      .from('dashboard_release_dataset_snapshots')
      .select('source_dataset_id, source_model_id, dataset_config, semantic_snapshot')
      .eq('version_id', fixture!.ids.versionId)
      .single())
    if (!firstReleaseDataset) throw new Error('Release dataset snapshot was not found.')
    expect(firstReleaseDataset.source_dataset_id).toBe(fixture!.ids.datasetId)
    expect(firstReleaseDataset.source_model_id).toBe(fixture!.ids.modelId)
    expect(firstReleaseDataset.semantic_snapshot.sourceSchemaHashes[fixture!.ids.dataSourceId]).toBe('integration-guided-schema-v1')

    await assertNoSupabaseError('apply post-publish AI-style source edit', await fixture!.service
      .from('dashboard_chart_configs')
      .update({
        name: 'AI-refined Revenue Trend',
        presentation: {
          size: 'standard',
          showLegend: false,
          showLabels: true,
          valueFormat: 'currency',
        },
      })
      .eq('id', fixture!.ids.chartId))

    const unchangedFirstRelease = await assertNoSupabaseError('re-read immutable release chart', await fixture!.service
      .from('dashboard_release_chart_snapshots')
      .select('chart_config')
      .eq('id', firstReleaseChart.id)
      .single())
    if (!unchangedFirstRelease) throw new Error('Release chart snapshot disappeared after source edit.')
    expect(unchangedFirstRelease.chart_config.name).toBe('Integration Revenue Trend')
    expect(unchangedFirstRelease.chart_config.presentation.showLegend).toBe(true)

    const secondVersionId = randomUUID()
    const secondPageId = randomUUID()
    const secondSlotId = randomUUID()
    await assertNoSupabaseError('seed second dashboard version', await fixture!.service.from('dashboard_versions').insert({
      id: secondVersionId,
      dashboard_id: fixture!.ids.dashboardId,
      tenant_id: fixture!.ids.tenantId,
      project_id: fixture!.ids.projectId,
      version_number: 2,
      status: 'draft',
      title: 'AI-refined release',
      notes: 'Second immutable publish for rollback coverage.',
      layout: { mode: 'responsive-grid' },
      created_by: fixture!.authed.userId,
    }))
    await assertNoSupabaseError('seed second dashboard page', await fixture!.service.from('dashboard_pages').insert({
      id: secondPageId,
      version_id: secondVersionId,
      dashboard_id: fixture!.ids.dashboardId,
      tenant_id: fixture!.ids.tenantId,
      project_id: fixture!.ids.projectId,
      title: 'Overview',
      slug: 'overview',
      sort_order: 0,
      layout: { columns: 12 },
    }))
    await assertNoSupabaseError('seed second dashboard slot', await fixture!.service.from('dashboard_chart_slots').insert({
      id: secondSlotId,
      page_id: secondPageId,
      version_id: secondVersionId,
      dashboard_id: fixture!.ids.dashboardId,
      tenant_id: fixture!.ids.tenantId,
      project_id: fixture!.ids.projectId,
      chart_config_id: fixture!.ids.chartId,
      title: 'Revenue trend',
      slot_key: 'revenue-trend',
      row_index: 0,
      column_index: 0,
      width: 8,
      height: 4,
      settings: {},
    }))

    const secondPublishResponse = await POST(
      new Request(`http://dashboardos.test/api/admin/published-dashboards/${fixture!.ids.dashboardId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ versionId: secondVersionId, notes: 'Publish refined source state.' }),
      }),
      { params: Promise.resolve({ id: fixture!.ids.dashboardId }) },
    )
    const secondPublishBody = await secondPublishResponse.json()
    expect(secondPublishResponse.status).toBe(200)
    expect(secondPublishBody.version.id).toBe(secondVersionId)

    const secondReleaseChart = await assertNoSupabaseError('read second immutable release chart', await fixture!.service
      .from('dashboard_release_chart_snapshots')
      .select('chart_config')
      .eq('version_id', secondVersionId)
      .single())
    if (!secondReleaseChart) throw new Error('Second release chart snapshot was not found.')
    expect(secondReleaseChart.chart_config.name).toBe('AI-refined Revenue Trend')

    const ROLLBACK = createPublishedDashboardRollbackPostHandler(async () => fixture!.authed)
    const rollbackResponse = await ROLLBACK(
      new Request(`http://dashboardos.test/api/admin/published-dashboards/${fixture!.ids.dashboardId}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ versionId: fixture!.ids.versionId, notes: 'Restore original immutable release.' }),
      }),
      { params: Promise.resolve({ id: fixture!.ids.dashboardId }) },
    )
    const rollbackBody = await rollbackResponse.json()
    expect(rollbackResponse.status).toBe(200)
    expect(rollbackBody.dashboard.currentVersionId).toBe(fixture!.ids.versionId)
    expect(rollbackBody.release).toMatchObject({ immutable: true, snapshotStatus: 'complete', chartSnapshotCount: 1 })

    const rolledBackDashboard = await assertNoSupabaseError('read rolled-back dashboard pointer', await fixture!.service
      .from('published_dashboards')
      .select('current_version_id')
      .eq('id', fixture!.ids.dashboardId)
      .single())
    expect(rolledBackDashboard?.current_version_id).toBe(fixture!.ids.versionId)

    const restoredReleaseChart = await assertNoSupabaseError('read restored release content', await fixture!.service
      .from('dashboard_release_chart_snapshots')
      .select('chart_config')
      .eq('id', firstReleaseChart.id)
      .single())
    expect(restoredReleaseChart?.chart_config.name).toBe('Integration Revenue Trend')

    const event = await assertNoSupabaseError('read publish event', await fixture!.service
      .from('dashboard_publish_events')
      .select('event_type, metadata')
      .eq('dashboard_id', fixture!.ids.dashboardId)
      .eq('version_id', fixture!.ids.versionId)
      .eq('event_type', 'published')
      .single())
    if (!event) throw new Error('Publish event row was not found.')
    expect(event.metadata.readinessStatus).toBe('ready_to_publish')
    expect(event.metadata.preflightStrategy).toBe('recomputed')
  })
})
