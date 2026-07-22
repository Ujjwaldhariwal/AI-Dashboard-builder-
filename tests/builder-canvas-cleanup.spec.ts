import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

test.describe('clean builder canvas', () => {
  test('keeps workflow guidance out of the active builder surface', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(builder)/builder/page.tsx'), 'utf8')
    const canvas = readFileSync(join(process.cwd(), 'src/components/builder/canvas/drag-drop-canvas.tsx'), 'utf8')

    expect(page).not.toContain('<BuilderGuideDialog')
    expect(page).not.toContain('Open builder guide')
    expect(page).not.toContain('Builder guide')

    expect(page).not.toContain('Connection checklist')
    expect(page).not.toContain('Studio setup')
    expect(page).not.toContain('12-column grid')
    expect(page).not.toContain('Drag widgets to reorder')
    expect(canvas).not.toContain('Build sequence')
    expect(canvas).not.toContain('Map dimensions and measures')
  })

  test('removes global and page-level guided walkthroughs', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/platform/platform-admin-shell.tsx'), 'utf8')
    const overview = readFileSync(join(process.cwd(), 'src/app/(admin)/admin/page.tsx'), 'utf8')
    const semantic = readFileSync(join(process.cwd(), 'src/components/platform/semantic-model-admin-panel.tsx'), 'utf8')
    const datasets = readFileSync(join(process.cwd(), 'src/components/platform/datasets-admin-panel.tsx'), 'utf8')
    const charts = readFileSync(join(process.cwd(), 'src/components/platform/dashboard-charts-admin-panel.tsx'), 'utf8')

    expect(shell).not.toContain('<BuilderFlowIndicator')
    expect(overview).not.toContain('<GuidedWorkflowLanding')
    expect(semantic).not.toContain('<GuidedProgressStepper')
    expect(semantic).not.toContain('Semantic model flow chart')
    expect(semantic).not.toContain('Electricity mapping checklist')
    expect(datasets).not.toContain('Guided mode')
    expect(charts).not.toContain('Guided mode')
    expect(charts).not.toContain('Automatic assembly unavailable')
  })

  test('keeps the empty canvas action-first', () => {
    const canvas = readFileSync(join(process.cwd(), 'src/components/builder/canvas/drag-drop-canvas.tsx'), 'utf8')
    expect(canvas).toContain('Start the canvas')
    expect(canvas).toContain('Add widget')
    expect(canvas).toContain('Generate draft')
    expect(canvas).not.toContain('Choose a data source')
  })
})
