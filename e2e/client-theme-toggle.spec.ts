import { expect, test, type Page } from '@playwright/test'

const baseURL = process.env.DASHBOARDOS_BASE_URL ?? 'http://localhost:3000'
const empId = process.env.DASHBOARDOS_E2E_EMP_ID ?? 'dashboardos_e2e'
const password = process.env.DASHBOARDOS_E2E_PASSWORD ?? 'DashboardOS-e2e-2026!'
const tenantSlug = process.env.DASHBOARDOS_E2E_TENANT_SLUG ?? 'demo'

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

test('client runtime theme toggle persists and updates chart shell mode', async ({ page }) => {
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

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(shell).toHaveAttribute('data-dashboardos-theme', 'light')

  await page.getByRole('button', { name: /switch to dark mode/i }).click()
  await expect(shell).toHaveAttribute('data-dashboardos-theme', 'dark')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('dashboardos-theme-mode'))).toBe('dark')
  expect(consoleErrors).toEqual([])
})
