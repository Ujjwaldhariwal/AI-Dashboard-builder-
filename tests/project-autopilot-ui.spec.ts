import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

test.describe('project autopilot workspace', () => {
  test('provides one brief and resumes the governed run without guided clutter', () => {
    const panel = readFileSync(join(process.cwd(), 'src/components/platform/project-autopilot-panel.tsx'), 'utf8')
    const shell = readFileSync(join(process.cwd(), 'src/components/layout/app-layout.tsx'), 'utf8')
    expect(panel).toContain('Build the governed dashboard from one brief')
    expect(panel).toContain('Start Autopilot')
    expect(panel).toContain('Resume Autopilot')
    expect(panel).toContain('/autopilot/execute')
    expect(panel).toContain("readPlatformAssistantIntent('autopilot')")
    expect(panel).toContain('Review and publish')
    expect(panel).not.toContain('Step 1 of')
    expect(shell).toContain("href: '/admin/autopilot'")
  })
})
