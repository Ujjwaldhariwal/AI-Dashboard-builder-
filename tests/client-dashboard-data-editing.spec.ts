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
    showLabels: true,
    valueFormat: 'currency',
    colors: ['#EC4899', '#8B5CF6'],
    showGrid: false,
    legendPosition: 'bottom',
    xAxis: {
      show: true,
      title: 'Month',
      labelColor: '#4B5563',
      labelFontSize: 13,
      labelFontWeight: 'bold',
      labelRotation: 15,
    },
    yAxis: {
      show: true,
      title: 'Revenue',
      labelColor: '#6B7280',
      labelFontSize: 12,
      labelFontWeight: 'medium',
    },
    labels: {
      color: '#BE185D',
      fontSize: 12,
      fontWeight: 'bold',
      position: 'top',
    },
    tooltip: {
      enabled: true,
      backgroundColor: '#111827',
      borderColor: '#EC4899',
      textColor: '#F9FAFB',
    },
    margins: { top: 20, right: 24, bottom: 32, left: 40 },
    line: { smooth: true, width: 4 },
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
    expect(mapped.presentation.colors).toEqual(['#EC4899', '#8B5CF6'])
    expect(mapped.presentation.xAxis?.title).toBe('Month')
    expect(mapped.presentation.tooltip?.backgroundColor).toBe('#111827')
    expect(mapped.presentation.margins?.left).toBe(40)

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
    expect(gridSource).toContain("'/api/client/chart-run'")
    expect(gridSource).toContain("'/api/client/chart-draft-run'")
    expect(gridSource).toContain('{ tenantSlug, releaseChartId: chartId, sourceChartId: sourceChart.id }')
    expect(gridSource).toContain('parsePublishedChartRunResponse(response)')
    expect(gridSource).toContain('Edit with AI')
    expect(gridSource).toContain('<AiChartRefinementDialog')
    expect(gridSource).toContain('dashboardChartPresentationToWidgetStyle')
    expect(gridSource).toContain('sizePreset={sizePreset}')
    expect(gridSource).toContain('The live published dashboard remains unchanged until a new version is published.')
    expect(gridSource).toContain('const displayChart = hasDraftPreview ? sourceCharts[chart.id] : chart')
    expect(gridSource).toContain('const [draftPreviewEnabled, setDraftPreviewEnabled] = useState(false)')
    expect(gridSource).toContain('const sourceChart = draftPreviewEnabled && draftUpdatedChartIds.includes(chartId)')
    expect(gridSource).toContain('const hasDraftPreview = draftPreviewEnabled && draftUpdatedChartIds.includes(chart.id)')
    expect(gridSource).toContain('View published release')
    expect(gridSource).toContain('View saved draft')
    expect(gridSource).toContain('Previewing your saved draft. Published viewers still see the released version until you publish.')
    expect(gridSource).toContain('<ChartBody chart={displayChart}')

    expect(pageSource).toContain('editor: true')
    expect(pageSource).toContain('.from(\'dashboard_chart_configs\')')
    expect(pageSource).toContain('indexPublishedChartEditors')

    const stableRouteSource = readFileSync(
      join(process.cwd(), 'src/app/api/client/chart-run/route.ts'),
      'utf8',
    )
    expect(stableRouteSource).toContain('runPublishedChartRequest')
    expect(stableRouteSource).toContain('tenantSlug')
    expect(stableRouteSource).toContain('chartId')

    const draftRouteSource = readFileSync(
      join(process.cwd(), 'src/app/api/client/chart-draft-run/route.ts'),
      'utf8',
    )
    const draftRuntimeSource = readFileSync(
      join(process.cwd(), 'src/lib/client/draft-chart-run-server.ts'),
      'utf8',
    )
    expect(draftRouteSource).toContain('runDraftChartRequest')
    expect(draftRouteSource).toContain('releaseChartId')
    expect(draftRouteSource).toContain('sourceChartId')
    expect(draftRuntimeSource).toContain('requireProjectAccess')
    expect(draftRuntimeSource).toContain('editor: true')
    expect(draftRuntimeSource).toContain('releaseChart.sourceChartConfigId !== sourceChartId')
    expect(draftRuntimeSource).toContain('validateSemanticReferencesForModel')
    expect(draftRuntimeSource).toContain('compileDatasetQueryPlan')
  })
})
