import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

test.describe('clean builder canvas', () => {
  test('keeps workflow guidance in one dedicated surface', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(builder)/builder/page.tsx'), 'utf8')
    const canvas = readFileSync(join(process.cwd(), 'src/components/builder/canvas/drag-drop-canvas.tsx'), 'utf8')
    const guide = readFileSync(join(process.cwd(), 'src/components/builder/builder-guide-dialog.tsx'), 'utf8')

    expect(page).toContain('<BuilderGuideDialog')
    expect(page).toContain('aria-label="Open builder guide"')
    expect(guide).toContain('The canvas stays focused on creation')
    expect(guide).toContain('Canvas controls')

    expect(page).not.toContain('Connection checklist')
    expect(page).not.toContain('Studio setup')
    expect(page).not.toContain('12-column grid')
    expect(page).not.toContain('Drag widgets to reorder')
    expect(canvas).not.toContain('Build sequence')
    expect(canvas).not.toContain('Map dimensions and measures')
  })

  test('keeps the empty canvas action-first', () => {
    const canvas = readFileSync(join(process.cwd(), 'src/components/builder/canvas/drag-drop-canvas.tsx'), 'utf8')
    expect(canvas).toContain('Start the canvas')
    expect(canvas).toContain('Add widget')
    expect(canvas).toContain('Generate draft')
    expect(canvas).not.toContain('Choose a data source')
  })
})

