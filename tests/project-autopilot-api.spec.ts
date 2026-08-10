import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  autopilotSemanticContextMatches,
  canAutopilotUseSemanticModel,
  evaluateAutopilotAiProposal,
  evaluateAutopilotChartApproval,
  evaluateAutopilotSemanticApproval,
  nextProjectArtifactName,
  normalizeAutopilotRelationshipJoin,
  projectAutopilotIdempotencyKey,
  rebindProjectAutopilotArtifacts,
} from '../src/lib/ai/project-autopilot-server'
import type { DataSourceColumnMetadata } from '../src/types/data-source'

const brief = {
  objective: 'Build a sales dashboard for executives using governed revenue metrics.',
  audience: 'Executives',
  chartCount: 6,
  chartTypes: ['kpi-card', 'line', 'bar'] as const,
  autoApply: true,
  publicationPolicy: 'auto_publish_when_healthy' as const,
}

test.describe('project autopilot API', () => {
  test('uses stable request fingerprints for retry safety', () => {
    const left = projectAutopilotIdempotencyKey('project-1', { ...brief, chartTypes: [...brief.chartTypes] })
    const right = projectAutopilotIdempotencyKey('project-1', { ...brief, chartTypes: [...brief.chartTypes] })
    expect(left).toBe(right)
    expect(left).toHaveLength(64)
  })

  test('auto-approves only source-valid Autopilot models with usable metrics', () => {
    expect(evaluateAutopilotSemanticApproval({
      modelName: 'Autopilot Business Model',
      fieldCount: 14,
      metricCount: 4,
      validation: { ok: true },
    })).toMatchObject({ approved: true })

    expect(evaluateAutopilotSemanticApproval({
      modelName: 'Manually Curated Model',
      fieldCount: 14,
      metricCount: 4,
      validation: { ok: true },
    })).toMatchObject({ approved: false })

    expect(evaluateAutopilotSemanticApproval({
      modelName: 'Autopilot Business Model',
      fieldCount: 14,
      metricCount: 0,
      validation: { ok: true },
    })).toMatchObject({ approved: false })

    expect(evaluateAutopilotSemanticApproval({
      modelName: 'Autopilot Business Model',
      fieldCount: 14,
      metricCount: 4,
      validation: { ok: false, error: 'Metric source field is invalid or missing' },
    })).toMatchObject({ approved: false, reason: 'Metric source field is invalid or missing' })
  })

  test('auto-applies only grounded high-confidence AI proposals with required KPI selections', () => {
    expect(evaluateAutopilotAiProposal({ confidence: 0.91, issues: [] })).toMatchObject({ approved: true })
    expect(evaluateAutopilotAiProposal({ confidence: 0.79, issues: [] })).toMatchObject({ approved: false })
    expect(evaluateAutopilotAiProposal({
      confidence: 0.95,
      issues: [{ severity: 'error', message: 'Unknown semantic ID' }],
    })).toMatchObject({ approved: false, reason: 'Unknown semantic ID' })
    expect(evaluateAutopilotAiProposal({
      confidence: 0.95,
      issues: [],
      requiredSelectionsPresent: false,
    })).toMatchObject({ approved: false })
  })

  test('auto-approves high-confidence chart warnings but preserves real review gates', () => {
    expect(evaluateAutopilotChartApproval({
      confidence: 0.82,
      validation: {
        state: 'warning',
        issues: [{
          severity: 'warning',
          code: 'dataset_shape_warning',
          message: 'A simpler projection may be easier to read.',
        }],
      },
    })).toMatchObject({
      approved: true,
      validationState: 'valid',
    })

    expect(evaluateAutopilotChartApproval({
      confidence: 0.95,
      validation: {
        state: 'invalid',
        issues: [{
          severity: 'error',
          code: 'invalid_metric',
          message: 'Metric is outside the governed dataset.',
        }],
      },
    })).toMatchObject({
      approved: false,
      validationState: 'invalid',
      reason: 'Metric is outside the governed dataset.',
    })

    expect(evaluateAutopilotChartApproval({
      confidence: 0.62,
      validation: {
        state: 'warning',
        issues: [],
      },
    })).toMatchObject({
      approved: false,
      validationState: 'warning',
    })

    expect(evaluateAutopilotChartApproval({
      confidence: 0.99,
      validation: {
        state: 'unknown',
        issues: [],
      },
    })).toMatchObject({
      approved: false,
      validationState: 'unknown',
    })
  })

  test('reuses complete approved models and rejects stale manual review artifacts', () => {
    expect(canAutopilotUseSemanticModel({
      id: 'approved-model',
      name: 'Dashboard Workspace Business Model v1',
      status: 'approved',
      fieldCount: 14,
      metricCount: 4,
    })).toBeTruthy()
    expect(canAutopilotUseSemanticModel({
      id: 'stale-manual-model',
      name: 'Dashboard Workspace Business Model v1',
      status: 'review',
      fieldCount: 14,
      metricCount: 4,
    })).toBeFalsy()
    expect(canAutopilotUseSemanticModel({
      id: 'autopilot-model',
      name: 'Autopilot Business Model',
      status: 'review',
      fieldCount: 14,
      metricCount: 4,
    })).toBeTruthy()
  })

  test('invalidates generated semantic context when the selected schema changes', () => {
    const selected = [
      {
        id: 'customer-id',
        dataSourceId: 'source-1',
        relationId: 'customers',
        schemaName: 'mdm_demo',
        tableName: 'customers',
        columnName: 'id',
        ordinalPosition: 1,
        dataType: 'uuid',
        udtName: 'uuid',
        isNullable: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'customer-status',
        dataSourceId: 'source-1',
        relationId: 'customers',
        schemaName: 'mdm_demo',
        tableName: 'customers',
        columnName: 'status',
        ordinalPosition: 2,
        dataType: 'text',
        udtName: 'text',
        isNullable: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ] satisfies DataSourceColumnMetadata[]

    expect(autopilotSemanticContextMatches(selected, selected)).toBeTruthy()
    expect(autopilotSemanticContextMatches(selected, [selected[0]])).toBeFalsy()
    expect(autopilotSemanticContextMatches(selected, [
      selected[0],
      { ...selected[1], columnName: 'lifecycle_status' },
    ])).toBeFalsy()
  })

  test('drops stale downstream artifacts when an approved project model is adopted', () => {
    expect(rebindProjectAutopilotArtifacts({
      semanticModelId: 'stale-model',
      datasetId: 'stale-dataset',
      chartIds: ['stale-chart'],
      dashboardId: 'stale-dashboard',
      dashboardVersionId: 'stale-version',
    }, 'approved-model')).toEqual({ semanticModelId: 'approved-model' })
  })

  test('versions fresh dataset names past archived workspace artifacts', () => {
    expect(nextProjectArtifactName('Executive Operations Dataset', [
      'Executive Operations Dataset',
      'Executive Operations Dataset (2)',
    ])).toBe('Executive Operations Dataset (3)')
  })

  test('repairs reversed joins and drops joins whose fields belong elsewhere', () => {
    const ownership = new Map([
      ['customer-id', 'customers'],
      ['usage-customer-id', 'usage'],
      ['payment-id', 'payments'],
    ])
    expect(normalizeAutopilotRelationshipJoin({
      fromEntityId: 'customers',
      toEntityId: 'usage',
      leftFieldId: 'usage-customer-id',
      rightFieldId: 'customer-id',
      fieldEntityById: ownership,
    })).toEqual({ action: 'swap', leftFieldId: 'customer-id', rightFieldId: 'usage-customer-id' })
    expect(normalizeAutopilotRelationshipJoin({
      fromEntityId: 'customers',
      toEntityId: 'usage',
      leftFieldId: 'payment-id',
      rightFieldId: 'usage-customer-id',
      fieldEntityById: ownership,
    }).action).toBe('drop')
  })

  test('chains governed artifacts and delegates healthy immutable release publication', () => {
    const server = readFileSync(join(process.cwd(), 'src/lib/ai/project-autopilot-server.ts'), 'utf8')
    const runRoute = readFileSync(join(process.cwd(), 'src/app/api/admin/projects/[id]/autopilot/route.ts'), 'utf8')
    const executeRoute = readFileSync(join(process.cwd(), 'src/app/api/admin/projects/[id]/autopilot/execute/route.ts'), 'utf8')
    const panel = readFileSync(join(process.cwd(), 'src/components/platform/project-autopilot-panel.tsx'), 'utf8')
    expect(server).toContain('buildDeterministicSemanticProposal')
    expect(server).toContain('generateSemanticMappingProposal')
    expect(server).toContain("source: 'deterministic'")
    expect(server).toContain('validateAndApproveAutopilotSemanticModel')
    expect(server).toContain('evaluateAutopilotChartApproval')
    expect(server).toContain('resolveProjectSemanticModel')
    expect(server).toContain('repairAutopilotRelationships')
    expect(server).toContain("action: 'business_model.approved'")
    expect(server).toContain('buildDeterministicDatasetProposal')
    expect(server).toContain('generateDatasetPlanningProposal')
    expect(server).toContain('buildDeterministicChartSuiteProposal')
    expect(server).toContain("rpc('create_dashboard_chart_drafts'")
    expect(server).toContain("rpc('compose_project_autopilot_dashboard_draft'")
    expect(server).toContain('publishDashboardVersionGoverned')
    expect(server).toContain("readinessAuthority: 'active_project_model'")
    expect(server).toContain('releaseVerification')
    expect(server).toContain('buildProjectAutopilotDashboardSlots')
    expect(server).toContain('dashboardVersionId')
    expect(server).toContain("if (snapshot.dataset?.status === 'published') artifacts.datasetId = snapshot.dataset.id")
    expect(server.split('await persistProjectAutopilotPlan({ supabase, ...context, plan, artifacts })').length - 1).toBeGreaterThanOrEqual(3)
    expect(server).toContain('existingCompile.queryPlan.executableSql')
    expect(server).toContain('Autopilot dataset selection is not executable')
    expect(server).toContain("validation_state: 'invalid'")
    expect(server).toContain("if (modelId) query = query.eq('model_id', modelId)")
    expect(executeRoute).toContain('requireProjectAccess')
    expect(executeRoute).toContain('executeProjectAutopilot')
    expect(executeRoute).toContain('const latest = latestRow ? mapProjectAutopilotRun')
    expect(runRoute).toContain('if (existingRow)')
    expect(runRoute).toContain("error?.code === '23505'")
    expect(runRoute).not.toContain(".upsert({\n      tenant_id: parsed.data.tenantId")
    expect(panel).toContain('idempotencyKey: crypto.randomUUID()')
    expect(panel).toContain('Run release finalization')
  })

  test('counts only currently available schema relations in Autopilot scope', () => {
    const server = readFileSync(join(process.cwd(), 'src/lib/ai/project-autopilot-server.ts'), 'utf8')

    expect(server).toContain(".from('data_source_relations')")
    expect(server).toContain(".eq('is_available', true)")
    expect(server).toContain(".in('relation_id', availableRelationIds)")
  })
})
