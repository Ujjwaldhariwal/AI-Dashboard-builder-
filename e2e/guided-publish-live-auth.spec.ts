import { expect, test, type Page } from '@playwright/test'

import {
  cleanupGuidedPublishSupabaseFixture,
  createGuidedPublishSupabaseFixture,
  guidedPublishPreflightPath,
  shouldRunGuidedPublishLiveHttpIntegration,
  type GuidedPublishSupabaseFixture,
} from '../tests/support/guided-publish-supabase-fixture'

const baseURL = process.env.DASHBOARDOS_BASE_URL ?? 'http://localhost:3000'

async function signIn(page: Page, fixture: GuidedPublishSupabaseFixture) {
  await page.context().clearCookies()
  await page.goto(`${baseURL}/login`)
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  await page.locator('#empId').fill(fixture.credentials.employeeId)
  await page.locator('#password').fill(fixture.credentials.password)
  await page.getByRole('button', { name: /continue to admin/i }).click()
  await expect(page).toHaveURL(/\/admin(?:\?|$)/, { timeout: 30_000 })
}

test.describe.serial('guided publish live HTTP auth integration', () => {
  test.skip(
    !shouldRunGuidedPublishLiveHttpIntegration,
    'Set DASHBOARDOS_INTEGRATION_SUPABASE=1, Supabase keys, and DASHBOARDOS_LIVE_HTTP_GUIDED_PUBLISH=1 to run live cookie-auth guided publish integration.',
  )

  let fixture: GuidedPublishSupabaseFixture | undefined
  let authUserId: string | null = null

  test.beforeAll(async () => {
    fixture = await createGuidedPublishSupabaseFixture()
    authUserId = fixture.authed.userId
  })

  test.afterAll(async () => {
    await cleanupGuidedPublishSupabaseFixture(fixture, authUserId)
  })

  test('preflights, publishes, and reaches the client route through browser cookies', async ({ page }) => {
    await signIn(page, fixture!)

    const preflightPath = guidedPublishPreflightPath(fixture!.ids)
    const preflight = await page.evaluate(async path => {
      const response = await fetch(path, { credentials: 'same-origin' })
      return { status: response.status, body: await response.json() }
    }, preflightPath)

    expect(preflight.status).toBe(200)
    expect(preflight.body.readiness.status).toBe('ready_to_publish')
    expect(preflight.body.readiness.publishEligible).toBe(true)
    expect(preflight.body.metadata.projectId).toBe(fixture!.ids.projectId)

    const publish = await page.evaluate(async ids => {
      const response = await fetch(`/api/admin/published-dashboards/${ids.dashboardId}/publish`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          versionId: ids.versionId,
          notes: 'Live HTTP guided publish integration.',
        }),
      })
      return { status: response.status, body: await response.json() }
    }, fixture!.ids)

    expect(publish.status).toBe(200)
    expect(publish.body.dashboard.status).toBe('published')
    expect(publish.body.version.status).toBe('published')

    const tenantSlug = preflight.body.metadata.tenantSlug
    expect(typeof tenantSlug).toBe('string')
    await page.goto(`${baseURL}/client/${tenantSlug}`)
    await page.waitForLoadState('networkidle')

    await expect(page).not.toHaveTitle(/404/)
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.getByText('Integration Revenue Dashboard')).toBeVisible({ timeout: 30_000 })
  })
})
