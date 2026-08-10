import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

test.describe('project autopilot workspace', () => {
  test('accepts one raw client brief and resumes the governed run without form-builder clutter', () => {
    const panel = readFileSync(join(process.cwd(), 'src/components/platform/project-autopilot-panel.tsx'), 'utf8')
    const shell = readFileSync(join(process.cwd(), 'src/components/platform/platform-admin-shell.tsx'), 'utf8')
    const publishing = readFileSync(join(process.cwd(), 'src/components/platform/published-dashboards-admin-panel.tsx'), 'utf8')
    expect(panel).toContain('Describe the dashboard. Autopilot handles the rest.')
    expect(panel).toContain('What should this dashboard answer?')
    expect(panel).toContain('Build dashboard')
    expect(panel).toContain('Ambiguous meaning pauses for review')
    expect(panel).toContain('compileRawDashboardBrief')
    expect(panel).toContain('Resume Autopilot')
    expect(panel).toContain('/autopilot/execute')
    expect(panel).toContain("readPlatformAssistantIntent('autopilot')")
    expect(panel).toContain('Review dashboard and publish')
    expect(panel).toContain('setBuilderDashboardId(run.artifacts.dashboardId)')
    expect(panel).toContain('20260722130000_autopilot_dashboard_composition.sql')
    expect(publishing).toContain('builderDashboardId')
    expect(panel).not.toContain('Step 1 of')
    expect(panel).not.toContain('Release mode')
    expect(panel).not.toContain('KPI and chart requirements')
    expect(panel).not.toContain('aggregation')
    expect(shell).toContain("href: '/admin/autopilot'")
    expect(shell).toContain("label: 'Autopilot'")
  })
})
