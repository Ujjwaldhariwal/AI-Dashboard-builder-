import { expect, test } from '@playwright/test'

import {
  compileRawDashboardBrief,
  inferDashboardAudience,
  interpretRawDashboardRequirements,
} from '../src/lib/ai/raw-dashboard-brief'

function idFactory() {
  let sequence = 0
  return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
}

test.describe('raw dashboard brief compiler', () => {
  test('turns pasted client language into conservative governed intents', () => {
    const result = interpretRawDashboardRequirements([
      '1. Show total recognised revenue as a KPI',
      '2. Monthly revenue trend for the last 12 months',
      '3. Compare revenue and margin by region, include top products by revenue',
      'Optional: detailed table of overdue invoices',
    ].join('\n'), idFactory())

    expect(result.omittedCount).toBe(0)
    expect(result.requirements).toHaveLength(5)
    expect(result.requirements.map(item => item.title)).toEqual([
      'total recognised revenue as a KPI',
      'Monthly revenue trend for the last 12 months',
      'revenue and margin by region',
      'top products by revenue',
      'detailed table of overdue invoices',
    ])
    expect(result.requirements.map(item => item.chartType)).toEqual([
      'status-card',
      'auto',
      'auto',
      'auto',
      'table',
    ])
    expect(result.requirements[1].timeGrain).toBe('month')
    expect(result.requirements[4].required).toBe(false)
    expect(result.requirements.every(item => item.metric === null && item.dimensions.length === 0)).toBe(true)
  })

  test('builds a bounded versioned brief without inventing semantic mappings', () => {
    const createId = idFactory()
    const brief = compileRawDashboardBrief({
      rawBrief: 'Executive KPI for month-over-month revenue; compare churn by region',
      projectName: 'Northwind',
      createId,
      updatedAt: '2026-08-10T10:00:00.000Z',
    })

    expect(brief.version).toBe(1)
    expect(brief.title).toBe('Northwind dashboard requirements')
    expect(brief.requirements).toHaveLength(2)
    expect(brief.requirements[0]).toMatchObject({ chartType: 'status-card', timeGrain: 'month' })
    expect(brief.requirements[1]).toMatchObject({ chartType: 'auto', metric: null, dimensions: [] })
    expect(inferDashboardAudience(brief.objective)).toBe('Leadership')
  })

  test('deduplicates input and reports requirements beyond the governed limit', () => {
    const lines = Array.from({ length: 14 }, (_, index) => `Metric ${index + 1}`)
    lines.push('Metric 1')
    const result = interpretRawDashboardRequirements(lines.join('\n'), idFactory())

    expect(result.requirements).toHaveLength(12)
    expect(result.omittedCount).toBe(2)
  })
})
