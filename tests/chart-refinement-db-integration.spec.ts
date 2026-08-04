import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

import {
  assertNoSupabaseError,
  cleanupGuidedPublishSupabaseFixture,
  createGuidedPublishSupabaseFixture,
  shouldRunGuidedPublishSupabaseIntegration,
  type GuidedPublishSupabaseFixture,
} from './support/guided-publish-supabase-fixture'

test.describe.serial('transactional chart refinement Supabase integration', () => {
  test.skip(
    !shouldRunGuidedPublishSupabaseIntegration,
    'Set DASHBOARDOS_INTEGRATION_SUPABASE=1 with Supabase anon and service keys to run DB-backed chart refinement integration.',
  )

  let fixture: GuidedPublishSupabaseFixture | undefined
  let authUserId: string | null = null

  test.beforeAll(async () => {
    fixture = await createGuidedPublishSupabaseFixture()
    authUserId = fixture.authed.userId
  })

  test.afterAll(async () => {
    await cleanupGuidedPublishSupabaseFixture(fixture, authUserId)
  })

  async function createProposal(options: {
    baseUpdatedAt: string
    name: string
  }) {
    const runId = randomUUID()
    const proposalId = randomUUID()
    const chart = await assertNoSupabaseError('read source chart', await fixture!.service
      .from('dashboard_chart_configs')
      .select('*')
      .eq('id', fixture!.ids.chartId)
      .single())
    if (!chart) throw new Error('Source chart was not found.')

    await assertNoSupabaseError('seed chart refinement run', await fixture!.service
      .from('ai_workflow_runs')
      .insert({
        id: runId,
        tenant_id: fixture!.ids.tenantId,
        project_id: fixture!.ids.projectId,
        actor_user_id: fixture!.authed.userId,
        workflow_type: 'chart_refinement',
        status: 'awaiting_review',
        provider_id: 'openai',
        model_id: 'integration-test',
        prompt_version: 'dashboardos.chart-refinement.v2',
        contract_version: 'dashboardos.ai.workflow.v1',
        input_hash: randomUUID().replaceAll('-', ''),
        input_summary: { chartId: chart.id },
        validation_summary: { state: 'valid', issues: [] },
      }))
    await assertNoSupabaseError('seed chart refinement proposal', await fixture!.service
      .from('ai_workflow_proposals')
      .insert({
        id: proposalId,
        run_id: runId,
        tenant_id: fixture!.ids.tenantId,
        project_id: fixture!.ids.projectId,
        artifact_type: 'chart',
        status: 'needs_review',
        contract_version: 'dashboardos.ai.workflow.v1',
        confidence: 0.95,
        proposal: {
          chartId: chart.id,
          mode: 'presentation_only',
          baseUpdatedAt: options.baseUpdatedAt,
          patch: {
            schemaVersion: 'dashboardos.ai.chart_patch.v1',
            presentation: { showGrid: false },
          },
          nextChart: {
            name: options.name,
            description: chart.description,
            templateId: chart.template_id,
            encoding: chart.encoding,
            presentation: { ...chart.presentation, showGrid: false },
            validationState: 'valid',
          },
          resolution: 'deterministic',
        },
        validation: { state: 'valid', issues: [] },
        warnings: [],
      }))
    return { proposalId, runId }
  }

  async function sourceChart() {
    const chart = await assertNoSupabaseError('read source chart revision', await fixture!.service
      .from('dashboard_chart_configs')
      .select('*')
      .eq('id', fixture!.ids.chartId)
      .single())
    if (!chart) throw new Error('Source chart was not found.')
    return chart
  }

  async function finalize(args: {
    proposalId: string
    baseUpdatedAt: string | null
    action: 'apply' | 'reject'
  }) {
    return assertNoSupabaseError('finalize chart refinement', await fixture!.authed.supabase.rpc(
      'finalize_chart_refinement_proposal',
      {
        p_tenant_id: fixture!.ids.tenantId,
        p_project_id: fixture!.ids.projectId,
        p_chart_id: fixture!.ids.chartId,
        p_proposal_id: args.proposalId,
        p_base_updated_at: args.baseUpdatedAt,
        p_action: args.action,
        p_rejection_reason: args.action === 'reject' ? 'Integration rejection' : null,
      },
    ))
  }

  test('claim + apply succeeds and replay is blocked', async () => {
    const chart = await sourceChart()
    const proposal = await createProposal({ baseUpdatedAt: chart.updated_at, name: 'Transactionally Refined Chart' })
    const applied = await finalize({ proposalId: proposal.proposalId, baseUpdatedAt: chart.updated_at, action: 'apply' })
    expect(applied).toMatchObject({ ok: true, outcome: 'applied', proposalStatus: 'applied' })

    const source = await sourceChart()
    expect(source).toMatchObject({ name: 'Transactionally Refined Chart', status: 'draft', published_at: null })
    const lifecycle = await assertNoSupabaseError('read applied lifecycle', await fixture!.service
      .from('ai_workflow_proposals')
      .select('status, ai_workflow_runs(status)')
      .eq('id', proposal.proposalId)
      .single())
    expect(lifecycle).toMatchObject({ status: 'applied', ai_workflow_runs: { status: 'succeeded' } })

    const replay = await finalize({ proposalId: proposal.proposalId, baseUpdatedAt: chart.updated_at, action: 'apply' })
    expect(replay).toMatchObject({ ok: false, errorCode: 'invalid_chart_proposal' })
  })

  test('stale revision rejects proposal without mutating the source chart', async () => {
    const chart = await sourceChart()
    const proposal = await createProposal({ baseUpdatedAt: chart.updated_at, name: 'Must Not Apply' })
    const newerRevision = new Date(Date.parse(chart.updated_at) + 1_000).toISOString()
    await assertNoSupabaseError('advance source revision', await fixture!.service
      .from('dashboard_chart_configs')
      .update({ updated_at: newerRevision })
      .eq('id', chart.id))

    const result = await finalize({ proposalId: proposal.proposalId, baseUpdatedAt: chart.updated_at, action: 'apply' })
    expect(result).toMatchObject({
      ok: false,
      errorCode: 'stale_chart_revision',
      proposalStatus: 'rejected',
    })
    expect(await sourceChart()).toMatchObject({ name: chart.name, updated_at: newerRevision })
    const run = await assertNoSupabaseError('read stale run', await fixture!.service
      .from('ai_workflow_runs')
      .select('status, error_code')
      .eq('id', proposal.runId)
      .single())
    expect(run).toMatchObject({ status: 'failed', error_code: 'stale_chart_revision' })
  })

  test('explicit rejection leaves the source chart unchanged', async () => {
    const chart = await sourceChart()
    const proposal = await createProposal({ baseUpdatedAt: chart.updated_at, name: 'Rejected Name' })
    const result = await finalize({ proposalId: proposal.proposalId, baseUpdatedAt: null, action: 'reject' })
    expect(result).toMatchObject({ ok: true, outcome: 'rejected', proposalStatus: 'rejected' })
    expect(await sourceChart()).toMatchObject({ name: chart.name, updated_at: chart.updated_at })
  })

  test('a source update failure rolls back the chart and closes lifecycle consistently', async () => {
    const chart = await sourceChart()
    const conflictName = 'Chart Name Collision'
    await assertNoSupabaseError('seed conflicting chart name', await fixture!.service
      .from('dashboard_chart_configs')
      .insert({
        tenant_id: fixture!.ids.tenantId,
        project_id: fixture!.ids.projectId,
        dataset_id: fixture!.ids.datasetId,
        name: conflictName,
        status: 'draft',
        template_id: chart.template_id,
        encoding: chart.encoding,
        presentation: chart.presentation,
        interactions: chart.interactions,
        layout: chart.layout,
        validation_state: 'valid',
      }))
    const proposal = await createProposal({ baseUpdatedAt: chart.updated_at, name: conflictName })
    const result = await finalize({ proposalId: proposal.proposalId, baseUpdatedAt: chart.updated_at, action: 'apply' })
    expect(result).toMatchObject({
      ok: false,
      errorCode: 'chart_refinement_apply_failed',
      proposalStatus: 'rejected',
    })
    expect(await sourceChart()).toMatchObject({ name: chart.name, updated_at: chart.updated_at })
    const lifecycle = await assertNoSupabaseError('read failed lifecycle', await fixture!.service
      .from('ai_workflow_proposals')
      .select('status, ai_workflow_runs(status, error_code)')
      .eq('id', proposal.proposalId)
      .single())
    expect(lifecycle).toMatchObject({
      status: 'rejected',
      ai_workflow_runs: { status: 'failed', error_code: 'chart_refinement_apply_failed' },
    })
  })
})
