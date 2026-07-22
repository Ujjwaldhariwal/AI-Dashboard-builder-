import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { PlatformAssistantActionSchema, PlatformAssistantIntentSchema } from '../src/lib/ai/platform-assistant-contract'

test.describe('platform assistant actions', () => {
  test('accepts bounded navigation and prefill actions', () => {
    const action = PlatformAssistantActionSchema.parse({
      action: 'navigate_workflow',
      target: 'autopilot',
      path: '/admin/autopilot',
      label: 'Build dashboard',
      reason: 'Open Autopilot with the business requirement ready to run.',
      instruction: 'Create 6 charts with 2 KPIs and monthly regional trends.',
    })
    const intent = PlatformAssistantIntentSchema.parse({
      ...action,
      tenantId: '10000000-0000-4000-8000-000000000001',
      projectId: '20000000-0000-4000-8000-000000000001',
      createdAt: '2026-07-22T00:00:00.000Z',
    })

    expect(intent.target).toBe('autopilot')
    expect(intent.instruction).toContain('6 charts')
  })

  test('rejects mismatched or arbitrary routes', () => {
    expect(PlatformAssistantActionSchema.safeParse({
      action: 'navigate_workflow',
      target: 'publishing',
      path: '/admin/charts',
      label: 'Publish now',
      reason: 'Wrong route',
    }).success).toBeFalsy()
    expect(PlatformAssistantActionSchema.safeParse({
      action: 'navigate_workflow',
      target: 'charts',
      path: 'https://example.com',
      label: 'Leave app',
      reason: 'Unsafe route',
    }).success).toBeFalsy()
  })

  test('shows a preview before navigation and prefills automation workbenches', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/ai/chat/route.ts'), 'utf8')
    const dock = readFileSync(join(process.cwd(), 'src/components/platform/platform-assistant-dock.tsx'), 'utf8')
    const semantic = readFileSync(join(process.cwd(), 'src/components/platform/semantic-model-admin-panel.tsx'), 'utf8')
    const datasets = readFileSync(join(process.cwd(), 'src/components/platform/datasets-admin-panel.tsx'), 'utf8')
    const charts = readFileSync(join(process.cwd(), 'src/components/platform/dashboard-charts-admin-panel.tsx'), 'utf8')
    const autopilot = readFileSync(join(process.cwd(), 'src/components/platform/project-autopilot-panel.tsx'), 'utf8')

    expect(route).toContain('loadPlatformWorkflowSnapshot')
    expect(route).toContain('PlatformAssistantActionSchema.safeParse')
    expect(route).toContain('This action only navigates and prefills a request')
    expect(dock).toContain('Proposed next action')
    expect(dock).toContain('Open workspace')
    expect(dock).toContain('window.sessionStorage.setItem')
    expect(semantic).toContain("readPlatformAssistantIntent('semantic_model')")
    expect(datasets).toContain("readPlatformAssistantIntent('datasets')")
    expect(charts).toContain("readPlatformAssistantIntent('charts')")
    expect(autopilot).toContain("readPlatformAssistantIntent('autopilot')")
    expect(dock).toContain("target: 'autopilot'")
    expect(route).toContain('autopilot|data_sources')
  })
})
