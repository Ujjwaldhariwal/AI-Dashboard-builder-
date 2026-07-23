import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

test.describe('project autopilot fresh reset', () => {
  test('archives generated analytics while preserving the connected source and schema', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/admin/projects/[id]/autopilot/reset/route.ts'),
      'utf8',
    )
    expect(route).toContain('requireProjectAccess')
    expect(route).toContain("editor: true")
    expect(route).toContain("archive('published_dashboards')")
    expect(route).toContain("archive('dashboard_chart_configs')")
    expect(route).toContain("archive('semantic_datasets')")
    expect(route).toContain("archive('business_models')")
    expect(route).toContain('active_business_model_id: null')
    expect(route).toContain("status: 'cancelled'")
    expect(route).not.toContain(".from('data_sources').delete")
    expect(route).not.toContain(".from('data_source_columns').delete")
    expect(route).not.toContain(".from('data_source_relation_selections').delete")
    const server = readFileSync(join(process.cwd(), 'src/lib/ai/project-autopilot-server.ts'), 'utf8')
    expect(server).toContain("Number(latestVersion?.version ?? 0) + 1")
    expect(server).toContain('nextProjectArtifactName')
  })

  test('exposes one authenticated reset-and-run action in the Autopilot panel', () => {
    const panel = readFileSync(
      join(process.cwd(), 'src/components/platform/project-autopilot-panel.tsx'),
      'utf8',
    )
    expect(panel).toContain('/autopilot/reset')
    expect(panel).toContain('Reset &amp; run fresh')
    expect(panel).toContain('await createAndExecute()')
    expect(panel).toContain('selected tables')
  })

  test('keeps archived work out of active authoring lists', () => {
    for (const file of [
      'src/app/api/admin/semantic-models/route.ts',
      'src/app/api/admin/datasets/route.ts',
      'src/app/api/admin/dashboard-charts/route.ts',
      'src/app/api/admin/published-dashboards/route.ts',
    ]) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).toContain(".neq('status', 'archived')")
    }
  })
})
