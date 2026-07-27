import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  indexPublishedChartEditors,
  mapPublishedChartEditableSource,
} from '../src/lib/client/published-chart-runtime'
import type { DashboardReleaseChartSnapshot } from '../src/lib/publishing/dashboard-release-snapshots'

function releaseSnapshot({
  id,
  sourceChartConfigId,
}: {
  id: string
  sourceChartConfigId: string
}): DashboardReleaseChartSnapshot {
  return {
    id,
    sourceChartConfigId,
    versionId: 'version-1',
    dashboardId: 'dashboard-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    slotId: `slot-${id}`,
    datasetSnapshotId: 'dataset-snapshot-1',
    chartConfig: {},
    sourceChartUpdatedAt: null,
    snapshotOrigin: 'publish',
    createdAt: '2026-07-27T00:00:00.000Z',
  }
}

const sourceChartRow = {
  id: 'source-chart-1',
  tenant_id: 'tenant-1',
  project_id: 'project-1',
  dataset_id: 'dataset-1',
  name: 'Revenue trend',
  description: 'Monthly governed revenue',
  status: 'published',
  template_id: 'line',
  encoding: {
    xAxisFieldId: 'month-field',
    yMetricIds: ['revenue-metric'],
    tooltipFieldIds: [],
    labelById: {},
    colorById: {},
  },
  presentation: {
    size: 'wide',
    showLegend: true,
    showLabels: false,
    valueFormat: 'currency',
  },
  interactions: {},
  layout: { order: 0, gridSpan: 4 },
  validation_state: 'valid',
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-27T00:00:00.000Z',
  published_at: '2026-07-27T00:00:00.000Z',
}

test.describe('client dashboard data and NLP editing', () => {
  test('maps immutable release charts to their editable source charts', () => {
    const mapped = mapPublishedChartEditableSource(sourceChartRow)
    expect(mapped.id).toBe('source-chart-1')
    expect(mapped.datasetId).toBe('dataset-1')
    expect(mapped.templateId).toBe('line')
    expect(mapped.validationState).toBe('valid')

    const editors = indexPublishedChartEditors({
      releaseSnapshots: [
        releaseSnapshot({ id: 'release-chart-1', sourceChartConfigId: 'source-chart-1' }),
        releaseSnapshot({ id: 'release-chart-2', sourceChartConfigId: 'missing-source-chart' }),
      ],
      sourceChartRows: [sourceChartRow],
    })

    expect(Object.keys(editors)).toEqual(['release-chart-1'])
    expect(editors['release-chart-1']?.id).toBe('source-chart-1')
  })

  test('keeps raw data and governed edit controls in the client runtime', () => {
    const gridSource = readFileSync(
      join(process.cwd(), 'src/components/client/published-charts-grid.tsx'),
      'utf8',
    )
    const pageSource = readFileSync(
      join(process.cwd(), 'src/app/(client)/client/[tenantSlug]/page.tsx'),
      'utf8',
    )

    expect(gridSource).toContain("type PublishedChartViewMode = 'chart' | 'table'")
    expect(gridSource).toContain('aria-label="Dashboard data view"')
    expect(gridSource).toContain('<DataTable rows={state.rows}')
    expect(gridSource).toContain('Edit with AI')
    expect(gridSource).toContain('<AiChartRefinementDialog')
    expect(gridSource).toContain('The live published dashboard remains unchanged until a new version is published.')

    expect(pageSource).toContain('editor: true')
    expect(pageSource).toContain('.from(\'dashboard_chart_configs\')')
    expect(pageSource).toContain('indexPublishedChartEditors')
  })
})
