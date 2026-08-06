import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { buildRequirementChartSuiteProposal } from '../src/lib/ai/chart-suite-copilot'
import {
  buildRequirementMetricMaterializations,
  resolveDashboardRequirementCoverage,
} from '../src/lib/ai/dashboard-requirement-resolver'
import { buildDeterministicDatasetProposal } from '../src/lib/ai/dataset-copilot'
import { buildProjectAutopilotPlan } from '../src/lib/ai/project-autopilot'
import { DashboardBriefSchema } from '../src/types/dashboard-brief'

const ids = {
  spec: '11111111-1111-4111-8111-111111111111',
  kpi: '22222222-2222-4222-8222-222222222221',
  trend: '22222222-2222-4222-8222-222222222222',
  revenue: '33333333-3333-4333-8333-333333333331',
  revenueAlt: '33333333-3333-4333-8333-333333333332',
  orders: '33333333-3333-4333-8333-333333333333',
  month: '44444444-4444-4444-8444-444444444441',
  region: '44444444-4444-4444-8444-444444444442',
}

const spec = DashboardBriefSchema.parse({
  id: ids.spec,
  title: 'Executive revenue requirements',
  objective: 'Track governed revenue KPIs and monthly performance.',
  updatedAt: '2026-08-06T08:00:00.000Z',
  requirements: [
    {
      id: ids.kpi,
      title: 'Recognised Revenue',
      instruction: 'Headline recognised revenue KPI.',
      chartType: 'status-card',
      lockChartType: true,
      metric: { concept: 'Recognised Revenue', aggregation: 'sum' },
    },
    {
      id: ids.trend,
      title: 'Monthly Recognised Revenue',
      instruction: 'Trend recognised revenue by month.',
      chartType: 'line',
      lockChartType: true,
      metric: { concept: 'Recognised Revenue', aggregation: 'sum' },
      timeGrain: 'month',
    },
  ],
})

const fields = [
  { id: ids.month, entityId: 'sales', entityName: 'Sale', name: 'Order Month', role: 'date' as const },
  { id: ids.region, entityId: 'sales', entityName: 'Sale', name: 'Region', role: 'dimension' as const },
]

const metrics = [
  { id: ids.revenue, entityId: 'sales', name: 'Total Recognised Revenue', aggregation: 'sum' as const, description: 'Recognised sales revenue' },
  { id: ids.orders, entityId: 'sales', name: 'Order Count', aggregation: 'count' as const, description: 'Number of orders' },
]

test.describe('KPI requirement Autopilot', () => {
  test('resolves exact KPI semantics and time grain to approved IDs', () => {
    const coverage = resolveDashboardRequirementCoverage({
      spec,
      specHash: 'requirement-hash',
      fields,
      metrics,
      evaluatedAt: '2026-08-06T08:05:00.000Z',
    })

    expect(coverage).toMatchObject({ total: 2, ready: 2, needsReview: 0, blocked: 0 })
    expect(coverage.items[0]).toMatchObject({
      requirementId: ids.kpi,
      metricId: ids.revenue,
      templateId: 'kpi-card',
      fieldIds: [],
      status: 'ready',
    })
    expect(coverage.items[1]).toMatchObject({
      requirementId: ids.trend,
      metricId: ids.revenue,
      templateId: 'line',
      fieldIds: [ids.month],
      status: 'ready',
    })
  })

  test('pauses instead of guessing ambiguous metrics or changing aggregation', () => {
    const ambiguous = resolveDashboardRequirementCoverage({
      spec: DashboardBriefSchema.parse({
        ...spec,
        requirements: [{ ...spec.requirements[0], metric: null, title: 'Revenue' }],
      }),
      specHash: 'ambiguous',
      fields,
      metrics: [
        { ...metrics[0], id: ids.revenue, name: 'Revenue' },
        { ...metrics[0], id: ids.revenueAlt, name: 'Revenue' },
      ],
    })
    expect(ambiguous.items[0].status).toBe('needs_review')

    const aggregationMismatch = resolveDashboardRequirementCoverage({
      spec: DashboardBriefSchema.parse({
        ...spec,
        requirements: [{ ...spec.requirements[0], metric: { concept: 'Recognised Revenue', aggregation: 'avg' } }],
      }),
      specHash: 'aggregation',
      fields,
      metrics,
    })
    expect(aggregationMismatch.items[0]).toMatchObject({ status: 'needs_review', metricId: ids.revenue })
    expect(aggregationMismatch.items[0].reason).toContain('Requested avg')
  })

  test('blocks an explicit dimension that is absent from the approved model', () => {
    const coverage = resolveDashboardRequirementCoverage({
      spec: DashboardBriefSchema.parse({
        ...spec,
        requirements: [{ ...spec.requirements[0], chartType: 'bar', dimensions: ['Product Category'] }],
      }),
      specHash: 'missing-dimension',
      fields,
      metrics,
    })
    expect(coverage.items[0].status).toBe('blocked')
    expect(coverage.items[0].reason).toContain('Product Category')
  })

  test('materializes an explicit KPI only from a unique compatible source column', () => {
    const customerSpec = DashboardBriefSchema.parse({
      ...spec,
      requirements: [{
        ...spec.requirements[0],
        title: 'Unique Customers',
        metric: { concept: 'Customers', aggregation: 'count_distinct' },
      }],
    })
    expect(buildRequirementMetricMaterializations({
      spec: customerSpec,
      sources: [
        { columnId: 'customer-id', entityName: 'Customer', fieldName: 'Customer ID', role: 'identifier', dataType: 'uuid' },
        { columnId: 'revenue', entityName: 'Order', fieldName: 'Revenue Amount', role: 'metric_source', dataType: 'numeric' },
      ],
    })).toEqual([expect.objectContaining({
      columnId: 'customer-id',
      name: 'Customers',
      aggregation: 'count_distinct',
    })])

    expect(buildRequirementMetricMaterializations({
      spec: customerSpec,
      sources: [
        { columnId: 'customer-id', entityName: 'Customer', fieldName: 'Customer ID', role: 'identifier', dataType: 'uuid' },
        { columnId: 'customer-number', entityName: 'Customer', fieldName: 'Customer Number', role: 'identifier', dataType: 'text' },
      ],
    })).toEqual([])
  })

  test('blocks disconnected semantic entities and accepts an approved multi-hop path', () => {
    const regionSpec = DashboardBriefSchema.parse({
      ...spec,
      requirements: [{ ...spec.requirements[0], chartType: 'bar', dimensions: ['Region'] }],
    })
    const disconnected = resolveDashboardRequirementCoverage({
      spec: regionSpec,
      specHash: 'disconnected',
      fields: [{ ...fields[1], entityId: 'customer' }],
      metrics,
      relationships: [],
    })
    expect(disconnected.items[0]).toMatchObject({ status: 'blocked' })
    expect(disconnected.items[0].reason).toContain('relationship path')

    const connected = resolveDashboardRequirementCoverage({
      spec: regionSpec,
      specHash: 'connected',
      fields: [{ ...fields[1], entityId: 'customer' }],
      metrics,
      relationships: [
        { fromEntityId: 'sales', toEntityId: 'account' },
        { fromEntityId: 'account', toEntityId: 'customer' },
      ],
    })
    expect(connected.items[0]).toMatchObject({ status: 'ready', fieldIds: [ids.region] })
  })

  test('compiles exact requirement IDs into governed dataset and chart lineage', () => {
    const dataset = buildDeterministicDatasetProposal({
      instruction: 'Use the approved KPI requirements.',
      fields,
      metrics,
      relationships: [],
      preferredFieldIds: [ids.month],
      preferredMetricIds: [ids.revenue],
    })
    expect(dataset.fieldIds).toEqual([ids.month])
    expect(dataset.metricIds).toEqual([ids.revenue])

    const proposal = buildRequirementChartSuiteProposal({
      instruction: 'Compile the approved requirements.',
      datasetName: 'Revenue Dataset',
      fields,
      metrics,
      allowedTemplateIds: ['kpi-card', 'line'],
      requirements: [
        { requirementId: ids.kpi, title: 'Recognised Revenue', instruction: '', templateId: 'kpi-card', metricId: ids.revenue, fieldIds: [], confidence: 0.9, required: true, allowTemplateFallback: false },
        { requirementId: ids.trend, title: 'Monthly Recognised Revenue', instruction: '', templateId: 'line', metricId: ids.revenue, fieldIds: [ids.month], confidence: 0.9, required: true, allowTemplateFallback: false },
      ],
    })
    expect(proposal.charts.map(chart => chart.name)).toEqual(['Recognised Revenue', 'Monthly Recognised Revenue'])
    expect(proposal.charts.map(chart => chart.layout.requirementId)).toEqual([ids.kpi, ids.trend])
    expect(proposal.charts[1].encoding).toMatchObject({ xAxisFieldId: ids.month, yMetricIds: [ids.revenue] })
  })

  test('does not substitute a locked chart template', () => {
    expect(() => buildRequirementChartSuiteProposal({
      instruction: 'Compile the locked requirement.',
      datasetName: 'Revenue Dataset',
      fields,
      metrics,
      allowedTemplateIds: ['bar'],
      requirements: [{
        requirementId: ids.kpi,
        title: 'Revenue share',
        instruction: '',
        templateId: 'pie',
        metricId: ids.revenue,
        fieldIds: [ids.region],
        confidence: 0.9,
        required: true,
        allowTemplateFallback: false,
      }],
    })).toThrow('Required KPI requirement')

    const unlocked = buildRequirementChartSuiteProposal({
      instruction: 'Compile the flexible requirement.',
      datasetName: 'Revenue Dataset',
      fields,
      metrics,
      allowedTemplateIds: ['bar'],
      requirements: [{
        requirementId: ids.kpi,
        title: 'Revenue share',
        instruction: '',
        templateId: 'pie',
        metricId: ids.revenue,
        fieldIds: [ids.region],
        confidence: 0.9,
        required: true,
        allowTemplateFallback: true,
      }],
    })
    expect(unlocked.charts[0].templateId).toBe('bar')
  })

  test('makes unresolved required coverage a durable review gate', () => {
    const plan = buildProjectAutopilotPlan({
      selectedRelationCount: 2,
      selectedColumnCount: 12,
      semanticModel: { id: 'model', status: 'approved', fieldCount: 10, metricCount: 2 },
      dataset: null,
      chartCount: 0,
      requirementCoverage: {
        specId: spec.id,
        specVersion: spec.version,
        specHash: 'hash',
        total: 2,
        ready: 1,
        needsReview: 1,
        blocked: 0,
        evaluatedAt: '2026-08-06T08:05:00.000Z',
        items: [
          { requirementId: ids.kpi, title: 'Recognised Revenue', required: true, status: 'ready', metricId: ids.revenue, fieldIds: [], templateId: 'kpi-card', confidence: 0.9, reason: 'Resolved.' },
          { requirementId: ids.trend, title: 'Monthly Recognised Revenue', required: true, status: 'needs_review', metricId: ids.revenue, fieldIds: [], templateId: 'line', confidence: 0.62, reason: 'Confirm date field.' },
        ],
      },
    }, {
      objective: spec.objective,
      audience: 'Leadership',
      chartCount: 2,
      chartTypes: ['kpi-card', 'line'],
      requirementSpec: spec,
      autoApply: true,
      publicationPolicy: 'auto_publish_when_healthy',
    })

    expect(plan).toMatchObject({ status: 'awaiting_review', currentStep: 'dataset' })
    expect(plan.steps[2]).toMatchObject({ status: 'awaiting_review', automatic: false })
  })

  test('surfaces coverage in the UI and snapshots requirement evidence at publish', () => {
    const panel = readFileSync(join(process.cwd(), 'src/components/platform/project-autopilot-panel.tsx'), 'utf8')
    const server = readFileSync(join(process.cwd(), 'src/lib/ai/project-autopilot-server.ts'), 'utf8')
    expect(panel).toContain('KPI and chart requirements')
    expect(panel).toContain('Requirement coverage')
    expect(panel).toContain('requirementSpec')
    expect(server).toContain('requirementSpecHash')
    expect(server).toContain('requirementCoverage')
    expect(server).toContain('buildRequirementChartSuiteProposal')
  })
})
