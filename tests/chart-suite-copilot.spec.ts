import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { buildDeterministicChartSuiteProposal } from '../src/lib/ai/chart-suite-copilot'

const fields = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Month', role: 'date' },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Region', role: 'dimension' },
]
const metrics = [
  { id: '20000000-0000-4000-8000-000000000001', name: 'Revenue', aggregation: 'sum' },
  { id: '20000000-0000-4000-8000-000000000002', name: 'Orders', aggregation: 'count' },
]

test.describe('chart suite copilot', () => {
  test('honors requested chart count and repeated visual types', () => {
    const proposal = buildDeterministicChartSuiteProposal({
      instruction: 'Create 6 charts with 2 KPIs, 1 trend, and bar comparisons',
      datasetName: 'Sales analysis',
      fields,
      metrics,
      allowedTemplateIds: ['kpi-card', 'line', 'bar'],
    })

    expect(proposal.charts).toHaveLength(6)
    expect(proposal.charts.filter(chart => chart.templateId === 'kpi-card')).toHaveLength(4)
    expect(proposal.charts[2].templateId).toBe('line')
    expect(proposal.charts.every(chart => chart.encoding.yMetricIds.length > 0)).toBeTruthy()
  })

  test('replaces incompatible requested templates and reports the exception', () => {
    const proposal = buildDeterministicChartSuiteProposal({
      instruction: 'Create 3 pie charts',
      datasetName: 'Operations',
      fields,
      metrics,
      allowedTemplateIds: ['bar'],
    })

    expect(proposal.charts).toHaveLength(3)
    expect(proposal.charts.every(chart => chart.templateId === 'bar')).toBeTruthy()
    expect(proposal.warnings).toHaveLength(1)
  })

  test('validates proposals before one atomic RPC applies the whole suite', () => {
    const proposalRoute = readFileSync(join(process.cwd(), 'src/app/api/admin/datasets/[id]/chart-suite-proposal/route.ts'), 'utf8')
    const batchRoute = readFileSync(join(process.cwd(), 'src/app/api/admin/dashboard-charts/batch/route.ts'), 'utf8')
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260722093000_atomic_chart_suite_drafts.sql'), 'utf8')
    const panel = readFileSync(join(process.cwd(), 'src/components/platform/dashboard-charts-admin-panel.tsx'), 'utf8')

    expect(proposalRoute).toContain('validateDashboardChartConfig')
    expect(proposalRoute).toContain("workflowType: 'dashboard_composition'")
    expect(batchRoute).toContain("rpc('create_dashboard_chart_drafts'")
    expect(batchRoute).toContain("validation.state === 'invalid'")
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('returns setof dashboard_chart_configs')
    expect(panel).toContain('Dashboard requirement')
    expect(panel).toContain('Create editable drafts')
    expect(panel).not.toContain('guidedChartRecommendations')
  })
})
