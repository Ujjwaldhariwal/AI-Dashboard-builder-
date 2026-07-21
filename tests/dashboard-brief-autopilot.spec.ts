import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { buildDashboardBriefPlan } from '../src/lib/builder/dashboard-brief-planner'
import { DashboardBriefSchema } from '../src/types/dashboard-brief'
import type { Widget } from '../src/types/widget'

const brief = DashboardBriefSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Electricity overview',
  objective: 'Monitor total consumption, cost, monthly trends, and regional performance.',
  updatedAt: '2026-07-21T10:00:00.000Z',
  requirements: [
    {
      id: '22222222-2222-4222-8222-222222222221',
      title: 'Total consumption',
      instruction: 'Headline KPI using consumption',
      chartType: 'status-card',
      lockChartType: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Monthly consumption trend',
      instruction: 'Group total consumption by month',
      chartType: 'line',
      lockChartType: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222223',
      title: 'Regional cost',
      instruction: 'Compare total cost by region',
      chartType: 'bar',
      lockChartType: true,
    },
  ],
})

const profiles = [{
  endpointId: '33333333-3333-4333-8333-333333333333',
  endpointName: 'Electricity usage',
  fields: [
    { name: 'month', type: 'date' },
    { name: 'region', type: 'string' },
    { name: 'total_consumption', type: 'number' },
    { name: 'total_cost', type: 'number' },
    { name: 'customer_id', type: 'string' },
  ],
}]

test.describe('dashboard brief Autopilot', () => {
  test('maps pinned requirements into ordinary editable widget drafts', () => {
    const plan = buildDashboardBriefPlan({ brief, profiles, widgets: [] })

    expect(plan.drafts).toHaveLength(3)
    expect(plan.drafts.map(item => item.type)).toEqual(['status-card', 'line', 'bar'])
    expect(plan.drafts[0].yAxis).toBe('total_consumption')
    expect(plan.drafts[1].xAxis).toBe('month')
    expect(plan.drafts[2].xAxis).toBe('region')
    expect(plan.drafts[2].yAxis).toBe('total_cost')
    expect(plan.drafts.every(item => item.locked)).toBe(true)
    expect(plan.unresolved).toEqual([])
  })

  test('preserves previously generated charts so manual edits are not overwritten', () => {
    const existing: Widget = {
      id: '44444444-4444-4444-8444-444444444444',
      dashboardId: '55555555-5555-4555-8555-555555555555',
      title: 'Engineer renamed this chart',
      type: 'donut',
      deps: 'echarts',
      endpointId: profiles[0].endpointId,
      dataMapping: {
        xAxis: 'region',
        yAxis: 'total_cost',
        autopilot: {
          briefId: brief.id,
          requirementId: brief.requirements[2].id,
          confidence: 90,
          locked: true,
          generatedAt: '2026-07-21T10:05:00.000Z',
        },
      },
      style: { colors: ['#3b82f6'] },
    }

    const plan = buildDashboardBriefPlan({ brief, profiles, widgets: [existing] })
    expect(plan.retainedRequirementIds).toContain(brief.requirements[2].id)
    expect(plan.drafts.map(item => item.requirementId)).not.toContain(brief.requirements[2].id)
    expect(plan.drafts).toHaveLength(2)
  })

  test('reports unresolved requirements instead of inventing numeric measures', () => {
    const plan = buildDashboardBriefPlan({
      brief,
      profiles: [{
        endpointId: profiles[0].endpointId,
        endpointName: 'Labels only',
        fields: [{ name: 'region', type: 'string' }],
      }],
      widgets: [],
    })

    expect(plan.drafts).toHaveLength(0)
    expect(plan.unresolved).toHaveLength(3)
    expect(plan.unresolved[0].reason).toContain('no usable numeric measure')
  })

  test('persists a bounded versioned brief on dashboards', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260721143000_dashboard_briefs.sql'),
      'utf8',
    )

    expect(migration).toContain('add column if not exists dashboard_brief jsonb')
    expect(migration).toContain('jsonb_array_length')
    expect(migration).toContain('between 1 and 24')
  })
})

