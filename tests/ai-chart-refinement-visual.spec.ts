import { expect, test, type Page, type Route } from '@playwright/test'

import { demoChart } from '../src/lib/dashboardos/demo-data'
import type { DashboardChartConfig } from '../src/types/dashboard-chart'

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const monthFieldId = '10000000-0000-4000-8000-000000000001'
const regionFieldId = '10000000-0000-4000-8000-000000000002'
const revenueMetricId = '20000000-0000-4000-8000-000000000001'
const proposalId = '30000000-0000-4000-8000-000000000001'

const previewChart: DashboardChartConfig = {
  ...demoChart,
  name: 'Monthly Revenue Trend',
  templateId: 'bar',
  encoding: {
    ...demoChart.encoding,
    xAxisFieldId: monthFieldId,
    yMetricIds: [revenueMetricId],
    tooltipFieldIds: [regionFieldId],
    labelById: {
      ...demoChart.encoding.labelById,
      [monthFieldId]: 'Month',
      [revenueMetricId]: 'Revenue',
      [regionFieldId]: 'Region',
    },
    limit: 4,
  },
  presentation: {
    ...demoChart.presentation,
    size: 'compact',
    colors: ['#EC4899', '#8B5CF6'],
    showLabels: true,
    showGrid: false,
    legendPosition: 'bottom',
    density: 'compact',
    xAxis: {
      show: true,
      title: 'Month',
      labelFontSize: 14,
      labelFontWeight: 'bold',
      labelRotation: 20,
      labelFormat: 'date-only',
      labelLocale: 'en-US',
      labelTimeZone: 'preserve',
      labelOverflow: 'truncate',
      labelMaxLength: 20,
    },
    yAxis: {
      show: true,
      title: 'Revenue',
      labelFontWeight: 'medium',
      numberFormat: {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      },
    },
    legend: {
      labelOverflow: 'truncate',
      labelMaxLength: 14,
      labelOverrides: [{ targetId: revenueMetricId, label: 'Governed Revenue Total' }],
    },
    labels: {
      color: '#BE185D',
      fontSize: 12,
      fontWeight: 'bold',
      position: 'top',
      numberFormat: { style: 'compact', maximumFractionDigits: 1 },
    },
    tooltip: {
      enabled: true,
      backgroundColor: '#111827',
      borderColor: '#EC4899',
      textColor: '#F9FAFB',
      labelOverflow: 'truncate',
      labelMaxLength: 24,
      labelOverrides: [
        { targetId: revenueMetricId, label: 'Net revenue billed' },
        { targetId: regionFieldId, label: 'Market' },
      ],
      numberFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
    },
    margins: {
      top: 20,
      right: 20,
      bottom: 32,
      left: 40,
    },
    line: {
      smooth: true,
      width: 4,
    },
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
  presentation: previewChart.presentation,
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
    { id: monthFieldId, label: 'Month', semanticKey: 'month', role: 'date', classification: 'allowed' },
    { id: regionFieldId, label: 'Region', semanticKey: 'region', role: 'dimension', classification: 'allowed' },
    { id: 'demo-field-segment', label: 'Segment', semanticKey: 'segment', role: 'dimension', classification: 'allowed' },
  ],
  allowedMetrics: [
    { id: revenueMetricId, label: 'Revenue', semanticKey: 'revenue', aggregation: 'sum', classification: 'aggregated_only' },
    { id: 'demo-metric-orders', label: 'Orders', semanticKey: 'orders', aggregation: 'sum', classification: 'aggregated_only' },
    { id: 'demo-metric-customers', label: 'Customers', semanticKey: 'customers', aggregation: 'sum', classification: 'aggregated_only' },
  ],
  blockedFieldCount: 2,
  blockedMetricCount: 0,
  preview: {
    rows: [
      { Month: '2026-01-01T08:30:00Z', Revenue: 120000, Region: 'APAC', Orders: 900, Customers: 220 },
      { Month: '2026-02-01T08:30:00Z', Revenue: 150000, Region: 'EMEA', Orders: 1020, Customers: 260 },
      { Month: '2026-03-01T08:30:00Z', Revenue: 175000, Region: 'AMER', Orders: 1180, Customers: 310 },
      { Month: '2026-04-01T08:30:00Z', Revenue: 210000, Region: 'APAC', Orders: 1300, Customers: 355 },
    ],
    fields: ['Month', 'Revenue', 'Region', 'Orders', 'Customers'],
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

async function mockAiRoutes(page: Page, outcome: 'success' | 'restricted' | 'validation' | 'stale' | 'legacy' = 'success') {
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

    if (outcome === 'stale' && body.apply) {
      await fulfillJson(route, {
        patch: body.patch,
        chart: {
          ...demoChart,
          updatedAt: '2026-07-08T10:00:00.000Z',
        },
        validation: { state: 'valid', issues: [] },
        errorCode: 'stale_chart_revision',
        error: 'stale_chart_revision',
        proposalStatus: 'rejected',
      }, 409)
      return
    }

    if (outcome === 'legacy' && body.apply) {
      await fulfillJson(route, {
        patch: null,
        chart: null,
        validation: null,
        errorCode: 'proposal_regeneration_required',
        error: 'This proposal predates transactional chart apply and must be regenerated.',
      }, 409)
      return
    }

    await fulfillJson(route, {
      patch: body.apply ? body.patch : previewPatch,
      chart: body.apply
        ? { ...previewChart, status: 'draft', publishedAt: null, updatedAt: '2026-07-08T09:05:00.000Z' }
        : previewChart,
      validation: { state: 'valid', issues: [] },
      proposalId,
      proposalStatus: body.apply ? 'applied' : 'needs_review',
      ...(!body.apply ? { baseUpdatedAt: demoChart.updatedAt } : {}),
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
      proposalId,
      ...(!body.apply ? { baseUpdatedAt: demoChart.updatedAt } : {}),
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

  test('context failure stops retrying and provides a working retry action', async ({ page }) => {
    let contextRequests = 0
    await page.route('**/api/ai/chart-context', async route => {
      contextRequests += 1
      if (contextRequests === 1) {
        await fulfillJson(route, {
          context: null,
          errorCode: 'feature_gated',
          error: 'AI chart refinement is currently gated.',
        }, 403)
        return
      }
      await fulfillJson(route, { context: chartContext })
    })

    await page.goto(`${baseUrl}/admin/visual-qa/ai-chart-refinement?demo=1&theme=dark`, {
      waitUntil: 'domcontentloaded',
    })
    await hideFrameworkChrome(page)
    await page.getByRole('button', { name: 'Open refinement dialog' }).click()

    await expect(page.getByTestId('ai-context-load-error')).toBeVisible()
    await expect(page.getByTestId('ai-refinement-status')).toContainText('context unavailable')
    await expect(page.getByTestId('ai-refinement-error')).toContainText('gated for this tenant')
    await page.getByLabel('Natural-language refinement').fill('Create a safe monthly trend')
    await expect(page.getByRole('button', { name: 'Generate preview' })).toBeDisabled()

    await page.waitForTimeout(300)
    expect(contextRequests).toBe(1)

    await page.getByRole('button', { name: 'Retry context' }).click()
    await expect(page.getByText('3 allowed dimensions')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate preview' })).toBeEnabled()
    expect(contextRequests).toBe(2)
  })

  test('preview-ready and applied states preserve a clear review hierarchy', async ({ page }) => {
    await mockAiRoutes(page)
    await openHarness(page)
    await page.getByLabel('Natural-language refinement').fill('Create a safe monthly trend')
    await page.getByRole('button', { name: 'Generate preview' }).click()

    await expect(page.getByTestId('ai-refinement-preview-diff')).toBeVisible()
    await expect(page.getByTestId('ai-refinement-mini-preview')).toBeVisible()
    await expect(page.getByTestId('ai-refinement-status')).toContainText('preview ready')
    await expect(page.getByTestId('ai-refinement-proposal-lifecycle')).toContainText('needs review')
    await expect(page.getByTestId('ai-refinement-preview-diff')).toContainText('Structured patch preview')
    await expect(page.getByTestId('ai-refinement-preview-diff')).toContainText('Palette')
    await expect(page.getByTestId('ai-refinement-preview-diff')).toContainText('#EC4899')
    await expect(page.getByTestId('ai-refinement-preview-diff')).toContainText('X axis style')
    await expect(page.getByTestId('ai-refinement-preview-diff')).toContainText('Tooltip style')
    await expect(page.getByTestId('ai-refinement-mini-preview')).toContainText('Monthly Revenue Trend')
    await expect(page.getByTestId('ai-refinement-mini-preview')).toContainText('01/01/2026')
    await expect(page.getByTestId('ai-refinement-mini-preview')).toContainText('Governed Reve…')
    await expect(page.getByTestId('ai-refinement-mini-preview')).not.toContainText('Governed Revenue Total')
    const dateLabel = page.getByTestId('ai-refinement-mini-preview').locator('svg text').filter({ hasText: '01/01/2026' }).first()
    await expect(dateLabel).toBeVisible()
    const dateLabelTransform = await dateLabel.getAttribute('transform')
    expect(dateLabelTransform).toMatch(/^matrix\(/)
    expect(dateLabelTransform).not.toBe('matrix(1,0,0,1,0,0)')
    await expect(page.getByTestId('ai-refinement-mini-preview').locator('svg [stroke-dasharray]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Accept patch' }).click()
    await expect(page.getByTestId('ai-refinement-applied')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate preview' })).toHaveCount(0)
    await expect(page.getByTestId('ai-refinement-preview-diff')).toHaveCount(0)
    await expect(page.getByText('AI refinement applied')).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId('ai-refinement-status')).toContainText('applied')
    await expect(page.getByTestId('ai-refinement-proposal-lifecycle')).toContainText('applied')
    await expect(page.getByTestId('ai-refinement-applied')).toContainText('Reviewed patch applied')
    await expect(page.getByTestId('ai-refinement-harness-chart-state')).toContainText('Source chart: draft')
  })

  test('rejects a stale proposal and refreshes the harness with the latest source revision', async ({ page }) => {
    await mockAiRoutes(page, 'stale')
    await openHarness(page)
    await page.getByLabel('Natural-language refinement').fill('Show date-only labels')
    await page.getByRole('button', { name: 'Generate preview' }).click()
    await expect(page.getByTestId('ai-refinement-preview-diff')).toBeVisible()

    await page.getByRole('button', { name: 'Accept patch' }).click()

    await expect(page.getByTestId('ai-refinement-error')).toContainText('changed after the preview was generated')
    await expect(page.getByTestId('ai-refinement-applied')).toHaveCount(0)
    await expect(page.getByTestId('ai-refinement-preview-diff')).toHaveCount(0)
    await expect(page.getByTestId('ai-refinement-harness-chart-state')).toContainText('2026-07-08T10:00:00.000Z')
    await expect(page.getByTestId('ai-refinement-harness-chart-state')).toContainText('Source chart: published')
    await expect(page.getByTestId('ai-refinement-proposal-lifecycle')).toContainText('rejected')
  })

  test('requires regeneration for proposals created before transactional nextChart storage', async ({ page }) => {
    await mockAiRoutes(page, 'legacy')
    await openHarness(page)
    await page.getByLabel('Natural-language refinement').fill('Show date-only labels')
    await page.getByRole('button', { name: 'Generate preview' }).click()
    await page.getByRole('button', { name: 'Accept patch' }).click()

    await expect(page.getByTestId('ai-refinement-error')).toContainText('created before transactional apply support')
    await expect(page.getByTestId('ai-refinement-proposal-lifecycle')).toContainText('regeneration required')
    await expect(page.getByRole('button', { name: 'Generate replacement' })).toBeVisible()
    await expect(page.getByTestId('ai-refinement-harness-chart-state')).toContainText('Source chart: published')
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

  test('keeps the dialog shell fixed while only the review workspace scrolls', async ({ page }) => {
    await mockAiRoutes(page)
    await openHarness(page)

    const dialog = page.getByTestId('ai-refinement-dialog')
    const scrollRegion = page.getByTestId('ai-refinement-scroll-region')
    await expect(dialog).toBeVisible()
    await expect(scrollRegion).toBeVisible()

    expect(await dialog.evaluate(element => getComputedStyle(element).overflowY)).toBe('hidden')
    expect(await scrollRegion.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto')
  })

  test('keeps suggestions inside their cards and resets the workspace scroll on reopen', async ({ page }) => {
    await mockAiRoutes(page)
    await openHarness(page)
    const scrollRegion = page.getByTestId('ai-refinement-scroll-region')
    await scrollRegion.evaluate(element => { element.scrollTop = 400 })
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Open refinement dialog' }).click()
    await expect.poll(() => scrollRegion.evaluate(element => element.scrollTop)).toBe(0)

    for (const suggestion of await page.locator('[aria-label="Suggested refinements"] button').all()) {
      expect(await suggestion.getAttribute('title')).toBeTruthy()
      expect(await suggestion.evaluate(element => getComputedStyle(element).overflowX)).toBe('hidden')
      expect(await suggestion.evaluate(element => getComputedStyle(element).whiteSpace)).toBe('nowrap')
    }
  })
})
