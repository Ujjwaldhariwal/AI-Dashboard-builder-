import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  canAutopilotUseSemanticModel,
  evaluateAutopilotSemanticApproval,
  nextProjectArtifactName,
  projectAutopilotIdempotencyKey,
  rebindProjectAutopilotArtifacts,
} from '../src/lib/ai/project-autopilot-server'

const brief = {
  objective: 'Build a sales dashboard for executives using governed revenue metrics.',
  audience: 'Executives',
  chartCount: 6,
  chartTypes: ['kpi-card', 'line', 'bar'] as const,
  autoApply: true,
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

  test('chains governed artifacts without auto-publishing a dashboard release', () => {
    const server = readFileSync(join(process.cwd(), 'src/lib/ai/project-autopilot-server.ts'), 'utf8')
    const runRoute = readFileSync(join(process.cwd(), 'src/app/api/admin/projects/[id]/autopilot/route.ts'), 'utf8')
    const executeRoute = readFileSync(join(process.cwd(), 'src/app/api/admin/projects/[id]/autopilot/execute/route.ts'), 'utf8')
    const panel = readFileSync(join(process.cwd(), 'src/components/platform/project-autopilot-panel.tsx'), 'utf8')
    expect(server).toContain('buildDeterministicSemanticProposal')
    expect(server).toContain('validateAndApproveAutopilotSemanticModel')
    expect(server).toContain('resolveProjectSemanticModel')
    expect(server).toContain("action: 'business_model.approved'")
    expect(server).toContain('buildDeterministicDatasetProposal')
    expect(server).toContain('buildDeterministicChartSuiteProposal')
    expect(server).toContain("rpc('create_dashboard_chart_drafts'")
    expect(server).toContain("rpc('compose_project_autopilot_dashboard_draft'")
    expect(server).toContain('buildProjectAutopilotDashboardSlots')
    expect(server).toContain('dashboardVersionId')
    expect(server).toContain("if (snapshot.dataset?.status === 'published') artifacts.datasetId = snapshot.dataset.id")
    expect(server).toContain('if (existingValidation.ok) return existing.id')
    expect(server).toContain("validation_state: 'invalid'")
    expect(server).toContain("if (modelId) query = query.eq('model_id', modelId)")
    expect(server).not.toContain("rpc('publish_dashboard'")
    expect(executeRoute).toContain('requireProjectAccess')
    expect(executeRoute).toContain('executeProjectAutopilot')
    expect(executeRoute).toContain('const latest = latestRow ? mapProjectAutopilotRun')
    expect(runRoute).toContain('if (existingRow)')
    expect(runRoute).toContain("error?.code === '23505'")
    expect(runRoute).not.toContain(".upsert({\n      tenant_id: parsed.data.tenantId")
    expect(panel).toContain('idempotencyKey: crypto.randomUUID()')
  })
})
