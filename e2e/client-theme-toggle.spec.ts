import { expect, test, type Page } from '@playwright/test'

const baseURL = process.env.DASHBOARDOS_BASE_URL ?? 'http://localhost:3000'
const empId = process.env.DASHBOARDOS_E2E_EMP_ID
const password = process.env.DASHBOARDOS_E2E_PASSWORD
const tenantSlug = process.env.DASHBOARDOS_E2E_TENANT_SLUG ?? 'northstar-retail'

async function signIn(page: Page) {
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

test('client runtime theme toggle persists and updates chart shell mode', async ({ page }) => {
  test.skip(!empId || !password, 'Set DashboardOS E2E credentials to run the authenticated client theme check.')
  const consoleErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await signIn(page)
  await page.goto(`${baseURL}/client/${tenantSlug}`)
  await page.waitForLoadState('networkidle')

  const shell = page.locator('.dashboardos-client').first()
  await expect(shell).toHaveAttribute('data-dashboardos-theme', 'dark')

  await page.getByRole('button', { name: /switch to light mode/i }).click()
  await expect(shell).toHaveAttribute('data-dashboardos-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('data-dashboardos-theme', 'light')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('dashboardos-theme-mode'))).toBe('light')

  await page.getByRole('button', { name: /switch to dark mode/i }).click()
  await expect(shell).toHaveAttribute('data-dashboardos-theme', 'dark')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('dashboardos-theme-mode'))).toBe('dark')
  expect(consoleErrors).toEqual([])
})
