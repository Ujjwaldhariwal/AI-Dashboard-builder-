import { expect, test } from '@playwright/test'
import { NextRequest } from 'next/server'

import { createGuidedPublishReadinessGetHandler } from '../src/app/api/admin/guided-review/publish-readiness/route'
import { createPublishedDashboardPublishPostHandler } from '../src/app/api/admin/published-dashboards/[id]/publish/route'
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

  test('distinguishes warning readiness from blocking validation failures', async () => {
    const GET = createGuidedPublishReadinessGetHandler(async () => fixture!.authed)

    await assertNoSupabaseError('set warning chart validation', await fixture!.service
      .from('dashboard_chart_configs')
      .update({ validation_state: 'warning' })
      .eq('id', fixture!.ids.chartId))
    const warningResponse = await GET(new NextRequest(guidedPublishPreflightUrl(fixture!.ids)))
    const warningBody = await warningResponse.json()

    expect(warningResponse.status).toBe(200)
    expect(warningBody.readiness.status).toBe('ready_to_publish')
    expect(warningBody.readiness.publishEligible).toBe(true)
    expect(warningBody.readiness.warnings.map((check: { id: string }) => check.id)).toContain('runtime_validation')

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

    const dashboard = await assertNoSupabaseError('read published dashboard', await fixture!.service
      .from('published_dashboards')
      .select('status, current_version_id')
      .eq('id', fixture!.ids.dashboardId)
      .single())
    if (!dashboard) throw new Error('Published dashboard row was not found.')
    expect(dashboard.status).toBe('published')
    expect(dashboard.current_version_id).toBe(fixture!.ids.versionId)

    const event = await assertNoSupabaseError('read publish event', await fixture!.service
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
