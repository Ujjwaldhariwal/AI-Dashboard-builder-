import { expect, test, type Page } from '@playwright/test'

const baseURL = process.env.DASHBOARDOS_BASE_URL ?? 'http://localhost:3000'
const empId = process.env.DASHBOARDOS_E2E_EMP_ID
const password = process.env.DASHBOARDOS_E2E_PASSWORD

async function signInToPreparedWorkspace(page: Page) {
  if (!empId || !password) throw new Error('DashboardOS E2E credentials are not configured.')
  await page.context().clearCookies()
  await page.goto(`${baseURL}/login?demo=1`)
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  await page.locator('#empId').fill(empId)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /sign in securely/i }).click()
  await expect(page).toHaveURL(/\/admin(?:\?|$)/, { timeout: 30_000 })
}

test.describe('authenticated senior demo path', () => {
  test.skip(!empId || !password, 'Set DASHBOARDOS_E2E_EMP_ID and DASHBOARDOS_E2E_PASSWORD to run the authenticated demo path.')

  test('moves from prepared governed assets to the immutable client release', async ({ page }) => {
    const consoleErrors: string[] = []
    const failedResponses: string[] = []

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('response', response => {
      if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`)
    })

    await signInToPreparedWorkspace(page)
    await expect(page.getByTestId('prepared-workspace-notice')).toBeVisible()
    await expect(page.getByText('Northstar Retail', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Automatic dashboard assembly remains paused.', { exact: false })).toBeVisible()

    await page.goto(`${baseURL}/admin/data-sources`)
    await expect(page.getByText('Northstar Analytics Warehouse')).toBeVisible()
    await expect(page.getByText('Governed access')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(/Sprint \d/)

    await page.goto(`${baseURL}/admin/semantic-model`)
    await expect(page.getByText('Retail Revenue Business Model')).toBeVisible()

    await page.goto(`${baseURL}/admin/datasets`)
    await expect(page.getByText('Executive Revenue Dataset')).toBeVisible()

    await page.goto(`${baseURL}/admin/charts`)
    await expect(page.getByRole('button', { name: 'Automatic assembly unavailable' })).toBeDisabled()
    await expect(page.getByText('Executive KPI Pulse')).toBeVisible()

    await page.goto(`${baseURL}/admin/publishing`)
    await expect(page.getByTestId('prepared-release-notice')).toBeVisible()
    await expect(page.getByText('Executive revenue release')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create dashboard' })).toBeDisabled()

    await page.goto(`${baseURL}/client/northstar-retail`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Executive Revenue', { exact: true })).toBeVisible()
    await expect(page.getByText('Prepared release')).toBeVisible()
    await expect(page.getByText('Revenue, Orders, and Customers', { exact: true })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/Sprint \d/)
    await expect(page.locator('body')).not.toContainText('Engineer Command Center')

    expect(failedResponses).toEqual([])
    expect(consoleErrors).toEqual([])
  })
})
