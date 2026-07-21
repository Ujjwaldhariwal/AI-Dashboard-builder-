import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  BuilderWidgetPatchSchema,
  describeBuilderWidgetPatch,
  validateBuilderWidgetPatch,
} from '../src/lib/ai/builder-assistant-contract'
import type { Widget } from '../src/types/widget'

const widget: Widget = {
  id: '11111111-1111-4111-8111-111111111111',
  dashboardId: '22222222-2222-4222-8222-222222222222',
  title: 'Consumption by month',
  type: 'line',
  deps: 'echarts',
  endpointId: '33333333-3333-4333-8333-333333333333',
  dataMapping: {
    xAxis: 'month',
    yAxis: 'consumption',
    autopilot: {
      briefId: '44444444-4444-4444-8444-444444444444',
      requirementId: '55555555-5555-4555-8555-555555555555',
      confidence: 88,
      locked: true,
      generatedAt: '2026-07-21T10:00:00.000Z',
    },
  },
  style: { colors: ['#3b82f6'], showLegend: true, showGrid: true },
}

test.describe('builder assistant chart patches', () => {
  test('applies an allowlisted natural-language chart proposal without losing lineage', () => {
    const patch = BuilderWidgetPatchSchema.parse({
      action: 'update_widget',
      changes: {
        title: 'Regional electricity cost',
        type: 'horizontal-bar',
        xAxis: 'region',
        yAxis: 'cost',
        style: { labelFormat: 'currency', showLegend: false },
      },
      description: 'Compare cost across regions and format values as currency.',
    })

    const result = validateBuilderWidgetPatch({
      widget,
      patch,
      allowedFields: ['month', 'region', 'consumption', 'cost'],
    })

    expect(result.ok).toBe(true)
    expect(result.updates?.type).toBe('horizontal-bar')
    expect(result.updates?.dataMapping?.xAxis).toBe('region')
    expect(result.updates?.dataMapping?.yAxis).toBe('cost')
    expect(result.updates?.dataMapping?.autopilot).toEqual(widget.dataMapping.autopilot)
    expect(result.updates?.style?.labelFormat).toBe('currency')
    expect(describeBuilderWidgetPatch(widget, patch)).toContain('Chart: line → horizontal-bar')
  })

  test('rejects invented fields before a proposal reaches the store', () => {
    const patch = BuilderWidgetPatchSchema.parse({
      action: 'update_widget',
      changes: { xAxis: 'imaginary_region' },
      description: 'Use a different region field.',
    })

    const result = validateBuilderWidgetPatch({ widget, patch, allowedFields: ['month', 'region', 'consumption'] })
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toContain('not available')
    expect(result.updates).toBeNull()
  })

  test('does not allow value removal from a metric chart', () => {
    const patch = BuilderWidgetPatchSchema.parse({
      action: 'update_widget',
      changes: { yAxis: null },
      description: 'Remove the value field.',
    })

    const result = validateBuilderWidgetPatch({ widget, patch, allowedFields: ['month', 'consumption'] })
    expect(result.ok).toBe(false)
    expect(result.issues).toContain('line requires a value field.')
  })

  test('wires persistent help and reviewed widget patches through the platform', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/ai/chat/route.ts'), 'utf8')
    const shell = readFileSync(join(process.cwd(), 'src/components/platform/platform-admin-shell.tsx'), 'utf8')
    const chatbot = readFileSync(join(process.cwd(), 'src/components/builder/ai-assistant/config-chatbot.tsx'), 'utf8')

    expect(route).toContain("assistantMode: z.enum(['builder', 'platform_help'])")
    expect(route).toContain('BuilderWidgetPatchSchema.safeParse')
    expect(route).toContain('buildPlatformHelpPrompt')
    expect(shell).toContain('<PlatformAssistantDock />')
    expect(chatbot).toContain('validateBuilderWidgetPatch')
    expect(chatbot).toContain('Apply validated change')
    expect(chatbot).toContain('activeDashboard?.tenantId && activeDashboard.projectId')
  })
})
