import { expect, test, type Page } from '@playwright/test'

const baseURL = process.env.DASHBOARDOS_BASE_URL ?? 'http://localhost:3000'
const empId = process.env.DASHBOARDOS_E2E_EMP_ID ?? 'dashboardos_e2e'
const password = process.env.DASHBOARDOS_E2E_PASSWORD ?? 'DashboardOS-e2e-2026!'
const tenantSlug = process.env.DASHBOARDOS_E2E_TENANT_SLUG ?? 'demo'

const chartNames = [
  'Monthly Consumption and Billing Trend',
  'Customer Base by City',
  'Payment Status Mix',
  'Average Outage Hours by Payment Status',
  'Connection Load Profile',
]

async function signIn(page: Page) {
  await page.context().clearCookies()
  await page.goto(`${baseURL}/login`)
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  await page.locator('#empId').fill(empId)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /continue to admin/i }).click()
  await expect(page).toHaveURL(/\/admin(?:\?|$)/, { timeout: 30_000 })
}

test.describe('signed-in DashboardOS demo runtime', () => {
  test('renders the real published electricity dashboard or a governed access boundary', async ({ page }) => {
    const consoleErrors: string[] = []
    const failedResponses: string[] = []

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('response', response => {
      const url = response.url()
      if ((url.includes('/api/client/') || url.includes(`/client/${tenantSlug}`)) && response.status() >= 400) {
        failedResponses.push(`${response.status()} ${url}`)
      }
    })

    await signIn(page)
    await page.goto(`${baseURL}/client/${tenantSlug}`)
    await page.waitForLoadState('networkidle')

    await expect(page).not.toHaveTitle(/404/)
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.locator('body')).not.toContainText('Northstar Retail')
    await expect(page.locator('body')).not.toContainText('Read-only demo')

    const accessDenied = await page.getByText('Dashboard access required').isVisible()
    if (accessDenied) {
      await expect(page.getByText('You do not have access to this dashboard yet')).toBeVisible()
      expect(failedResponses).toEqual([])
      expect(consoleErrors).toEqual([])
      return
    }

    await expect(page.locator('body')).not.toContainText('Chart is preparing')
    await expect(page.locator('body')).not.toContainText('Published chart dataset is not executable yet')
    await expect(page.locator('body')).not.toContainText('column ')

    for (const chartName of chartNames) {
      await expect(page.getByText(chartName, { exact: true })).toBeVisible()
    }

    await expect(page.getByText('5 live charts')).toBeVisible()
    await expect(page.getByText('Live')).toHaveCount(5)
    expect(failedResponses).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('publishing transition reaches the signed-in client runtime cleanly when admin publishing is available', async ({ page }) => {
    await signIn(page)
    await page.goto(`${baseURL}/admin/publishing`)
    await page.waitForLoadState('networkidle')

    const accessDenied = await page.getByText(/platform admin access is required|forbidden|unauthorized/i).isVisible()
    test.skip(accessDenied, 'The configured E2E account is not allowed to publish dashboards.')

    const publishButton = page.getByRole('button', { name: /^publish$/i }).first()
    const canPublish = await publishButton.isVisible({ timeout: 5_000 }).catch(() => false)
    test.skip(!canPublish, 'The configured E2E account can sign in but has no visible publish action.')

    await expect(publishButton).toBeVisible({ timeout: 30_000 })
    await publishButton.click()

    await expect(page.getByText(/publishing/i).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/publish failed/i)).toHaveCount(0)

    await page.goto(`${baseURL}/client/${tenantSlug}`)
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveTitle(/404/)
  })
})
