import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { buildProjectAutopilotPlan } from '../src/lib/ai/project-autopilot'

const brief = {
  objective: 'Build an executive sales dashboard with revenue and order trends.',
  audience: 'Leadership',
  chartCount: 6,
  chartTypes: ['kpi-card', 'line', 'bar'] as const,
  autoApply: true,
}

test.describe('project autopilot planner', () => {
  test('blocks safely when no schema tables are selected', () => {
    const plan = buildProjectAutopilotPlan({
      selectedRelationCount: 0,
      selectedColumnCount: 0,
      semanticModel: null,
      dataset: null,
      chartCount: 0,
    }, { ...brief, chartTypes: [...brief.chartTypes] })

    expect(plan.currentStep).toBe('schema_scope')
    expect(plan.steps[0].status).toBe('blocked')
    expect(plan.steps[1].status).toBe('blocked')
  })

  test('automates drafts but preserves semantic and publish review gates', () => {
    const semanticReview = buildProjectAutopilotPlan({
      selectedRelationCount: 2,
      selectedColumnCount: 18,
      semanticModel: { id: 'model', status: 'review', fieldCount: 14, metricCount: 4 },
      dataset: null,
      chartCount: 0,
    }, { ...brief, chartTypes: [...brief.chartTypes] })
    expect(semanticReview.currentStep).toBe('semantic_model')
    expect(semanticReview.steps[1]).toMatchObject({ status: 'awaiting_review', automatic: false })

    const publishReview = buildProjectAutopilotPlan({
      selectedRelationCount: 2,
      selectedColumnCount: 18,
      semanticModel: { id: 'model', status: 'approved', fieldCount: 14, metricCount: 4 },
      dataset: { id: 'dataset', status: 'published' },
      chartCount: 6,
    }, { ...brief, chartTypes: [...brief.chartTypes] })
    expect(publishReview.currentStep).toBe('publish_review')
    expect(publishReview.status).toBe('awaiting_review')
    expect(publishReview.steps[4].automatic).toBe(false)
  })

  test('persists resumable runs and individual idempotent steps', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260722113000_project_autopilot_runs.sql'),
      'utf8',
    )
    expect(migration).toContain('create table if not exists project_autopilot_runs')
    expect(migration).toContain('create table if not exists project_autopilot_steps')
    expect(migration).toContain('unique (run_id, step_key)')
    expect(migration).toContain('never performs final dashboard publication')
  })
})
