import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { buildDeterministicChartSuiteProposal } from '../src/lib/ai/chart-suite-copilot'
import { validateDashboardChartConfig } from '../src/lib/semantic/chart-config-validator'
import { analyzeDatasetChartOptions } from '../src/lib/semantic/dataset-shape-analyzer'

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
    expect(proposal.charts.filter(chart => chart.templateId === 'kpi-card')).toHaveLength(2)
    expect(proposal.charts.filter(chart => chart.templateId === 'line')).toHaveLength(2)
    expect(proposal.charts.filter(chart => chart.templateId === 'bar')).toHaveLength(2)
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

    expect(proposal.charts).toHaveLength(2)
    expect(proposal.charts.every(chart => chart.templateId === 'bar')).toBeTruthy()
    expect(proposal.warnings).toHaveLength(2)
    expect(proposal.warnings.some(warning => warning.includes('Generated 2 of 3'))).toBeTruthy()
  })

  test('does not pad a wide-table fallback with duplicate KPI grids and tables', () => {
    const proposal = buildDeterministicChartSuiteProposal({
      instruction: 'Create 5 charts: KPI summaries, a time trend, and the most useful business comparisons.',
      datasetName: 'Monthly consumption and billing',
      fields,
      metrics,
      allowedTemplateIds: ['kpi-grid', 'table-grid'],
    })

    expect(proposal.charts).toHaveLength(2)
    expect(proposal.charts.map(chart => chart.templateId)).toEqual(['kpi-grid', 'table-grid'])
    expect(proposal.warnings.some(warning => warning.includes('Line could not be generated'))).toBeTruthy()
    expect(proposal.warnings.some(warning => warning.includes('Generated 2 of 5'))).toBeTruthy()
  })

  test('builds focused KPI, trend, and comparison projections from a rich dataset', () => {
    const richFields = [
      ...fields,
      { id: '10000000-0000-4000-8000-000000000003', name: 'Status', role: 'dimension' },
      { id: '10000000-0000-4000-8000-000000000004', name: 'Segment', role: 'attribute' },
    ]
    const richMetrics = [
      ...metrics,
      { id: '20000000-0000-4000-8000-000000000003', name: 'Margin', aggregation: 'avg' },
    ]
    const available = analyzeDatasetChartOptions({ fields: richFields, metrics: richMetrics })
      .compatibility.filter(item => item.status !== 'blocked').map(item => item.template.id)

    expect(available).toEqual(expect.arrayContaining(['kpi-card', 'line', 'bar']))
    expect(validateDashboardChartConfig({
      templateId: 'kpi-card',
      encoding: {
        yMetricIds: [richMetrics[0].id],
        stackMetricIds: [],
        tooltipFieldIds: [richMetrics[0].id],
        labelById: {},
        colorById: {},
        filters: [],
        limit: 1,
      },
      fields: richFields,
      metrics: richMetrics,
    }).state).toBe('valid')
    expect(validateDashboardChartConfig({
      templateId: 'line',
      encoding: {
        xAxisFieldId: richFields[0].id,
        yMetricIds: [richMetrics[0].id],
        stackMetricIds: [],
        tooltipFieldIds: [richFields[0].id, richMetrics[0].id],
        labelById: {},
        colorById: {},
        filters: [],
        limit: 25,
      },
      fields: richFields,
      metrics: richMetrics,
    }).state).toBe('valid')
  })

  test('projects every generated template with the dimensions it requires', () => {
    const richFields = [
      ...fields,
      { id: '10000000-0000-4000-8000-000000000003', name: 'Status', role: 'dimension' },
      { id: '10000000-0000-4000-8000-000000000004', name: 'Domain', role: 'dimension' },
    ]
    const richMetrics = [
      ...metrics,
      { id: '20000000-0000-4000-8000-000000000003', name: 'Open Issues', aggregation: 'sum' },
    ]
    const allowedTemplateIds = analyzeDatasetChartOptions({ fields: richFields, metrics: richMetrics })
      .compatibility.filter(item => item.status !== 'blocked').map(item => item.template.id)
    const proposal = buildDeterministicChartSuiteProposal({
      instruction: 'Create 6 charts with KPIs, a trend, and bar comparisons',
      datasetName: 'MDM quality',
      fields: richFields,
      metrics: richMetrics,
      allowedTemplateIds,
    })

    expect(proposal.charts).toHaveLength(6)
    for (const chart of proposal.charts) {
      expect(validateDashboardChartConfig({
        templateId: chart.templateId,
        encoding: chart.encoding,
        fields: richFields,
        metrics: richMetrics,
      }).state).not.toBe('invalid')
    }
    expect(proposal.charts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'drilldown-bar',
        encoding: expect.objectContaining({ seriesFieldId: expect.any(String) }),
      }),
    ]))
  })

  test('pairs chart dimensions and metrics from the same semantic entity', () => {
    const snapshotEntity = '30000000-0000-4000-8000-000000000001'
    const issueEntity = '30000000-0000-4000-8000-000000000002'
    const entityFields = [
      { id: '40000000-0000-4000-8000-000000000001', name: 'Snapshot Date', role: 'date', entityId: snapshotEntity },
      { id: '40000000-0000-4000-8000-000000000002', name: 'Domain', role: 'dimension', entityId: snapshotEntity },
      { id: '40000000-0000-4000-8000-000000000003', name: 'Detected At', role: 'date', entityId: issueEntity },
    ]
    const entityMetrics = [
      { id: '50000000-0000-4000-8000-000000000001', name: 'Duplicate Records', aggregation: 'sum', entityId: snapshotEntity },
    ]
    const proposal = buildDeterministicChartSuiteProposal({
      instruction: 'Create 3 charts with a KPI, trend, and bar comparison',
      datasetName: 'MDM quality',
      fields: entityFields,
      metrics: entityMetrics,
      allowedTemplateIds: ['kpi-card', 'line', 'bar'],
    })

    expect(proposal.charts).toHaveLength(3)
    expect(proposal.charts.find(chart => chart.templateId === 'kpi-card')?.encoding.xAxisFieldId).toBeUndefined()
    for (const chart of proposal.charts.filter(chart => chart.encoding.xAxisFieldId)) {
      expect(chart.encoding.xAxisFieldId).not.toBe(entityFields[2].id)
    }
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
