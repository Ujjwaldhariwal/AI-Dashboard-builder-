import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  mapReleasedChartConfig,
  releasedDatasetCacheTtl,
  releasedSourceSchemaHash,
  releasedSourceSchemaContracts,
  resolveReleasedSemanticReferences,
  type DashboardReleaseChartSnapshot,
  type DashboardReleaseDatasetSnapshot,
} from '../src/lib/publishing/dashboard-release-snapshots'
import { releasedSourceContractIssues } from '../src/lib/publishing/dashboard-health-auditor'

const tenantId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const dashboardId = '33333333-3333-4333-8333-333333333333'
const versionId = '44444444-4444-4444-8444-444444444444'
const slotId = '55555555-5555-4555-8555-555555555555'
const sourceChartId = '66666666-6666-4666-8666-666666666666'
const sourceDatasetId = '77777777-7777-4777-8777-777777777777'
const sourceModelId = '88888888-8888-4888-8888-888888888888'
const datasetSnapshotId = '99999999-9999-4999-8999-999999999999'
const chartSnapshotId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const entityId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const monthFieldId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const revenueFieldId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const revenueMetricId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const dataSourceId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const capturedAt = '2026-07-14T12:00:00.000Z'

function datasetSnapshot(): DashboardReleaseDatasetSnapshot {
  return {
    id: datasetSnapshotId,
    versionId,
    dashboardId,
    tenantId,
    projectId,
    sourceDatasetId,
    sourceModelId,
    datasetConfig: {
      name: 'Revenue dataset',
      selection: {
        fieldIds: [monthFieldId],
        metricIds: [revenueMetricId],
        relationshipIds: [],
      },
      cache_policy: { ttlSeconds: 120 },
    },
    semanticSnapshot: {
      entities: [{ id: entityId, model_id: sourceModelId, name: 'Revenue' }],
      fields: [
        {
          id: monthFieldId,
          entity_id: entityId,
          name: 'Month',
          role: 'date',
          source_column: {
            dataSourceId,
            schemaName: 'public',
            tableName: 'monthly_revenue',
            columnName: 'month',
          },
        },
        {
          id: revenueFieldId,
          entity_id: entityId,
          name: 'Revenue amount',
          role: 'measure',
          source_column: {
            dataSourceId,
            schemaName: 'public',
            tableName: 'monthly_revenue',
            columnName: 'revenue_amount',
          },
        },
      ],
      metrics: [{
        id: revenueMetricId,
        model_id: sourceModelId,
        entity_id: entityId,
        name: 'Revenue',
        aggregation: 'sum',
        expression: { fieldId: revenueFieldId },
      }],
      relationships: [],
      sourceSchemaHashes: { [dataSourceId]: 'schema-v1' },
    },
    sourceDatasetUpdatedAt: '2026-07-14T11:59:00.000Z',
    sourceModelVersion: 3,
    snapshotOrigin: 'publish',
    createdAt: capturedAt,
  }
}

function chartSnapshot(chartConfig?: Record<string, unknown>): DashboardReleaseChartSnapshot {
  return {
    id: chartSnapshotId,
    versionId,
    dashboardId,
    tenantId,
    projectId,
    slotId,
    datasetSnapshotId,
    sourceChartConfigId: sourceChartId,
    chartConfig: chartConfig ?? {
      name: 'Revenue trend',
      description: 'Released chart',
      template_id: 'line',
      encoding: {
        xAxisFieldId: monthFieldId,
        yMetricIds: [revenueMetricId],
        tooltipFieldIds: [],
        labelById: {},
        colorById: {},
        filters: [],
        limit: 100,
      },
      presentation: { size: 'standard', showLegend: true, showLabels: false, valueFormat: 'currency' },
      interactions: {},
      layout: { order: 0, gridSpan: 1 },
      validation_state: 'valid',
    },
    sourceChartUpdatedAt: '2026-07-14T11:58:00.000Z',
    snapshotOrigin: 'publish',
    createdAt: capturedAt,
  }
}

test.describe('immutable dashboard release snapshots', () => {
  test('uses release-owned identity and content after the source chart is edited', () => {
    const mutableSourceChart = chartSnapshot().chartConfig
    const capturedChart = structuredClone(mutableSourceChart)
    const releasedBeforeEdit = mapReleasedChartConfig(chartSnapshot(capturedChart))

    mutableSourceChart.name = 'AI-refined Revenue Trend'
    mutableSourceChart.presentation = { size: 'wide', showLegend: false, showLabels: true }

    const releasedAfterEdit = mapReleasedChartConfig(chartSnapshot(capturedChart))
    expect(releasedAfterEdit).toEqual(releasedBeforeEdit)
    expect(releasedAfterEdit.id).toBe(chartSnapshotId)
    expect(releasedAfterEdit.datasetId).toBe(datasetSnapshotId)
    expect(releasedAfterEdit.name).toBe('Revenue trend')
    expect(releasedAfterEdit.presentation.showLegend).toBe(true)
  })

  test('resolves runtime semantic inputs and schema contract only from the dataset snapshot', () => {
    const snapshot = datasetSnapshot()
    const resolution = resolveReleasedSemanticReferences(snapshot)

    expect(resolution.ok).toBe(true)
    expect(resolution.fields.map(field => field.id)).toEqual([monthFieldId])
    expect(resolution.metrics.map(metric => metric.id)).toEqual([revenueMetricId])
    expect(resolution.metricSourceFields.map(field => field.id)).toEqual([revenueFieldId])
    expect(releasedSourceSchemaHash(snapshot, dataSourceId)).toBe('schema-v1')
    expect(releasedSourceSchemaContracts(snapshot)).toEqual({ [dataSourceId]: 'schema-v1' })
    expect(releasedDatasetCacheTtl(snapshot)).toBe(120)
  })

  test('fails closed when captured semantic lineage is incomplete', () => {
    const snapshot = datasetSnapshot()
    snapshot.semanticSnapshot = {
      ...snapshot.semanticSnapshot,
      fields: [],
    }

    const resolution = resolveReleasedSemanticReferences(snapshot)
    expect(resolution.ok).toBe(false)
    expect(resolution.error).toContain('missing selected semantic fields')
  })

  test('blocks release health when the live source no longer matches its captured contract', () => {
    const snapshot = datasetSnapshot()

    expect(releasedSourceContractIssues(snapshot, new Map())).toEqual([
      expect.objectContaining({ code: 'missing_release_data_source', severity: 'error' }),
    ])
    expect(releasedSourceContractIssues(snapshot, new Map([[dataSourceId, {
      status: 'active',
      schemaHash: 'schema-v2',
    }]]))).toEqual([
      expect.objectContaining({ code: 'release_source_schema_mismatch', severity: 'error' }),
    ])
    expect(releasedSourceContractIssues(snapshot, new Map([[dataSourceId, {
      status: 'active',
      schemaHash: 'schema-v1',
    }]]))).toEqual([])
  })

  test('defines publish and rollback as governed atomic snapshot transitions', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260714160000_immutable_dashboard_releases.sql'),
      'utf8',
    )

    expect(migration).toContain('create or replace function publish_dashboard_version_immutable')
    expect(migration).toContain('create or replace function rollback_dashboard_release_immutable')
    expect(migration).toContain('insert into dashboard_release_chart_snapshots')
    expect(migration).toContain("release_snapshot_status = 'complete'")
    expect(migration).toContain("raise exception 'Release chart snapshot count mismatch'")
    expect(migration).toContain('v_old_snapshot_status is distinct from \'pending\'')
    expect(migration).toContain('v_new_snapshot_status is distinct from \'pending\'')
    expect(migration).toContain('revoke all on dashboard_release_chart_snapshots from anon, authenticated')
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all).*dashboard_release_chart_snapshots\s+to\s+authenticated/i)
  })
})
