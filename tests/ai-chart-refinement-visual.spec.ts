import { expect, test, type Page, type Route } from '@playwright/test'

import { demoChart } from '../src/lib/dashboardos/demo-data'
import type { DashboardChartConfig } from '../src/types/dashboard-chart'

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

const previewChart: DashboardChartConfig = {
  ...demoChart,
  name: 'Monthly Revenue Trend',
  templateId: 'line',
  encoding: {
    ...demoChart.encoding,
    yMetricIds: ['demo-metric-revenue'],
    limit: 4,
  },
  updatedAt: '2026-07-08T09:00:00.000Z',
}

const previewPatch = {
  name: previewChart.name,
  templateId: previewChart.templateId,
  encoding: {
    yMetricIds: previewChart.encoding.yMetricIds,
    limit: previewChart.encoding.limit,
  },
}

const chartContext = {
  contractVersion: 'dashboardos.ai.chart_context.v1',
  dataset: {
    id: 'demo-dataset-executive-revenue',
    name: 'Executive Revenue Dataset',
    status: 'published',
  },
  chart: demoChart,
  allowedFields: [
    { id: 'demo-field-month', label: 'Month', semanticKey: 'month', role: 'date', classification: 'allowed' },
    { id: 'demo-field-region', label: 'Region', semanticKey: 'region', role: 'dimension', classification: 'allowed' },
    { id: 'demo-field-segment', label: 'Segment', semanticKey: 'segment', role: 'dimension', classification: 'allowed' },
  ],
  allowedMetrics: [
    { id: 'demo-metric-revenue', label: 'Revenue', semanticKey: 'revenue', aggregation: 'sum', classification: 'aggregated_only' },
    { id: 'demo-metric-orders', label: 'Orders', semanticKey: 'orders', aggregation: 'sum', classification: 'aggregated_only' },
    { id: 'demo-metric-customers', label: 'Customers', semanticKey: 'customers', aggregation: 'sum', classification: 'aggregated_only' },
  ],
  blockedFieldCount: 2,
  blockedMetricCount: 0,
  preview: {
    rows: [
      { Month: 'Jan', Revenue: 120000, Orders: 900, Customers: 220 },
      { Month: 'Feb', Revenue: 150000, Orders: 1020, Customers: 260 },
      { Month: 'Mar', Revenue: 175000, Orders: 1180, Customers: 310 },
      { Month: 'Apr', Revenue: 210000, Orders: 1300, Customers: 355 },
    ],
    fields: ['Month', 'Revenue', 'Orders', 'Customers'],
    rowCount: 4,
    elapsedMs: 18,
    warnings: [],
  },
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function hideFrameworkChrome(page: Page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-dev-tools-button],
      button[aria-label="Open Next.js Dev Tools"] {
        display: none !important;
      }
    `,
  })
}

async function mockAiRoutes(page: Page, outcome: 'success' | 'restricted' | 'validation' = 'success') {
  await page.route('**/api/ai/chart-context', route => fulfillJson(route, { context: chartContext }))
  await page.route('**/api/ai/chart-refine/preview-observed', route => fulfillJson(route, { ok: true }))
  await page.route('**/api/ai/chart-refine/reject', route => fulfillJson(route, { ok: true }))
  await page.route('**/api/ai/chart-refine', async route => {
    const body = route.request().postDataJSON() as { apply?: boolean; patch?: unknown }

    if (outcome === 'restricted' && !body.apply) {
      await fulfillJson(route, {
        patch: null,
        chart: null,
        validation: null,
        errorCode: 'restricted_field_request',
        error: 'restricted_field_request',
      }, 403)
      return
    }

    if (outcome === 'validation' && !body.apply) {
      await fulfillJson(route, {
        patch: null,
        chart: demoChart,
        validation: {
          state: 'invalid',
          issues: [{ severity: 'error', code: 'invalid_chart_patch', message: 'Patch did not pass chart validation.' }],
        },
        errorCode: 'chart_validation_failed',
        error: 'chart_validation_failed',
      }, 422)
      return
    }

    await fulfillJson(route, {
      patch: body.apply ? body.patch : previewPatch,
      chart: previewChart,
      validation: { state: 'valid', issues: [] },
    })
  })
}

async function mockPendingAiRoutes(page: Page) {
  let releaseRefinement: (() => void) | null = null
  let markStarted: () => void = () => undefined
  const started = new Promise<void>(resolve => {
    markStarted = resolve
  })

  await page.route('**/api/ai/chart-context', route => fulfillJson(route, { context: chartContext }))
  await page.route('**/api/ai/chart-refine/preview-observed', route => fulfillJson(route, { ok: true }))
  await page.route('**/api/ai/chart-refine/reject', route => fulfillJson(route, { ok: true }))
  await page.route('**/api/ai/chart-refine', async route => {
    const body = route.request().postDataJSON() as { apply?: boolean; patch?: unknown }
    const releaseSignal = new Promise<void>(resolve => {
      releaseRefinement = resolve
    })
    markStarted()
    await releaseSignal
    await fulfillJson(route, {
      patch: body.apply ? body.patch : previewPatch,
      chart: previewChart,
      validation: { state: 'valid', issues: [] },
    })
  })

  return {
    started,
    release: () => releaseRefinement?.(),
  }
}

async function openHarness(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.goto(`${baseUrl}/admin/visual-qa/ai-chart-refinement?demo=1&theme=${theme}`, {
    waitUntil: 'domcontentloaded',
  })
  await hideFrameworkChrome(page)
  await page.getByRole('button', { name: 'Open refinement dialog' }).click()
  await expect(page.getByTestId('ai-refinement-dialog')).toBeVisible()
  await expect(page.getByText('3 allowed dimensions')).toBeVisible()
}

test.use({
  viewport: { width: 1440, height: 1400 },
  deviceScaleFactor: 1,
})

test.describe('AI chart refinement visual states', () => {
  test.describe.configure({ timeout: 90_000 })

  test('gated rollout control and aggregate observability stay compact', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('dashboardos-theme-mode', 'dark'))
    await page.goto(`${baseUrl}/admin/charts?demo=1`, { waitUntil: 'domcontentloaded' })
    await hideFrameworkChrome(page)

    const rollout = page.getByTestId('ai-rollout-control')
    const observability = page.getByTestId('ai-refinement-ops')
    await expect(rollout).toContainText('AI refinement uses real governed chart IDs')
    await expect(rollout).toContainText('Effective gate')
    await expect(rollout).toContainText('Global')
    await expect(rollout).toContainText('Tenant')
    await expect(observability).toContainText('Prompts')
    await expect(observability).toContainText('Restricted requests')
    await expect(observability).toContainText('Counts cover the last')

    const rolloutBox = await rollout.boundingBox()
    const observabilityBox = await observability.boundingBox()
    expect(rolloutBox?.width).toBeGreaterThan(300)
    expect(observabilityBox?.width).toBeGreaterThan(300)
  })

  test('idle refinement dialog is stable in dark and light themes', async ({ page }) => {
    await mockAiRoutes(page)
    await openHarness(page, 'dark')
    await expect(page.getByTestId('ai-refinement-status')).toContainText('idle')
    await expect(page.getByText('Describe a safe chart edit')).toBeVisible()
    await expect(page.getByTestId('ai-refinement-error')).toHaveCount(0)

    await page.getByRole('button', { name: 'Close' }).click()
    await page.goto(`${baseUrl}/admin/visual-qa/ai-chart-refinement?demo=1&theme=light`, {
      waitUntil: 'domcontentloaded',
    })
    await hideFrameworkChrome(page)
    await page.getByRole('button', { name: 'Open refinement dialog' }).click()
    await expect(page.getByText('3 allowed dimensions')).toBeVisible()
    await expect(page.getByTestId('ai-refinement-status')).toContainText('idle')
    await expect(page.getByText('Sensitive fields stay hidden')).toBeVisible()
  })

  test('preview-ready and applied states preserve a clear review hierarchy', async ({ page }) => {
    await mockAiRoutes(page)
    await openHarness(page)
    await page.getByLabel('Natural-language refinement').fill('Create a safe monthly trend')
    await page.getByRole('button', { name: 'Generate preview' }).click()

    await expect(page.getByTestId('ai-refinement-preview-diff')).toBeVisible()
    await expect(page.getByTestId('ai-refinement-mini-preview')).toBeVisible()
    await expect(page.getByTestId('ai-refinement-status')).toContainText('preview ready')
    await expect(page.getByTestId('ai-refinement-preview-diff')).toContainText('Structured patch preview')
    await expect(page.getByTestId('ai-refinement-mini-preview')).toContainText('Monthly Revenue Trend')

    await page.getByRole('button', { name: 'Accept patch' }).click()
    await expect(page.getByTestId('ai-refinement-applied')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate preview' })).toHaveCount(0)
    await expect(page.getByTestId('ai-refinement-preview-diff')).toHaveCount(0)
    await expect(page.getByText('AI refinement applied')).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId('ai-refinement-status')).toContainText('applied')
    await expect(page.getByTestId('ai-refinement-applied')).toContainText('Reviewed patch applied')
  })

  test('generating state communicates review-safe progress', async ({ page }) => {
    const pending = await mockPendingAiRoutes(page)
    await openHarness(page)
    await page.getByLabel('Natural-language refinement').fill('Create a safe monthly trend')
    await page.getByRole('button', { name: 'Generate preview' }).click()
    await pending.started

    await expect(page.getByTestId('ai-refinement-status')).toContainText('generating')
    await expect(page.getByTestId('ai-refinement-generating')).toBeVisible()
    await expect(page.getByTestId('ai-refinement-generating')).toContainText('current chart stays unchanged')

    pending.release()
    await expect(page.getByTestId('ai-refinement-preview-diff')).toBeVisible()
  })

  test('restricted requests use a calm blocked state without field details', async ({ page }) => {
    await mockAiRoutes(page, 'restricted')
    await openHarness(page)
    await page.getByLabel('Natural-language refinement').fill('Use a restricted field')
    await page.getByRole('button', { name: 'Generate preview' }).click()

    const error = page.getByTestId('ai-refinement-error')
    await expect(error).toContainText('restricted from AI refinement')
    await expect(error).not.toContainText('customer')
    await expect(page.getByTestId('ai-refinement-status')).toContainText('restricted request')
    await expect(page.getByTestId('ai-refinement-preview-diff')).toHaveCount(0)
  })

  test('validation failures use a distinct state without raw model details', async ({ page }) => {
    await mockAiRoutes(page, 'validation')
    await openHarness(page)
    await page.getByLabel('Natural-language refinement').fill('Make a governed but invalid edit')
    await page.getByRole('button', { name: 'Generate preview' }).click()

    await expect(page.getByTestId('ai-refinement-status')).toContainText('validation failed')
    const error = page.getByTestId('ai-refinement-error')
    await expect(error).toContainText('did not pass chart validation')
    await expect(error).not.toContainText('invalid_chart_patch')
    await expect(error).not.toContainText('chart_validation_failed')
    await expect(page.getByTestId('ai-refinement-preview-diff')).toHaveCount(0)
  })

  test('mobile preview keeps governed review actions reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await mockAiRoutes(page)
    await openHarness(page)
    await page.getByLabel('Natural-language refinement').fill('Create a safe monthly trend')
    await page.getByRole('button', { name: 'Generate preview' }).click()

    await expect(page.getByTestId('ai-refinement-preview-diff')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept patch' })).toBeVisible()
    await expect(page.getByTestId('ai-refinement-mini-preview')).toBeVisible()
  })
})
