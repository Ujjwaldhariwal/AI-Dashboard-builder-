import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { projectAutopilotIdempotencyKey } from '../src/lib/ai/project-autopilot-server'

const brief = {
  objective: 'Build a sales dashboard for executives using governed revenue metrics.',
  audience: 'Executives',
  chartCount: 6,
  chartTypes: ['kpi-card', 'line', 'bar'] as const,
  autoApply: true,
}

test.describe('project autopilot API', () => {
  test('uses stable request fingerprints for retry safety', () => {
    const left = projectAutopilotIdempotencyKey('project-1', { ...brief, chartTypes: [...brief.chartTypes] })
    const right = projectAutopilotIdempotencyKey('project-1', { ...brief, chartTypes: [...brief.chartTypes] })
    expect(left).toBe(right)
    expect(left).toHaveLength(64)
  })

  test('chains governed artifacts without auto-publishing a dashboard release', () => {
    const server = readFileSync(join(process.cwd(), 'src/lib/ai/project-autopilot-server.ts'), 'utf8')
    const executeRoute = readFileSync(join(process.cwd(), 'src/app/api/admin/projects/[id]/autopilot/execute/route.ts'), 'utf8')
    expect(server).toContain('buildDeterministicSemanticProposal')
    expect(server).toContain('buildDeterministicDatasetProposal')
    expect(server).toContain('buildDeterministicChartSuiteProposal')
    expect(server).toContain("rpc('create_dashboard_chart_drafts'")
    expect(server).toContain("rpc('compose_project_autopilot_dashboard_draft'")
    expect(server).toContain('buildProjectAutopilotDashboardSlots')
    expect(server).toContain('dashboardVersionId')
    expect(server).toContain("if (snapshot.dataset?.status === 'published') artifacts.datasetId = snapshot.dataset.id")
    expect(server).not.toContain("rpc('publish_dashboard'")
    expect(executeRoute).toContain('requireProjectAccess')
    expect(executeRoute).toContain('executeProjectAutopilot')
    expect(executeRoute).toContain('const latest = latestRow ? mapProjectAutopilotRun')
  })
})
