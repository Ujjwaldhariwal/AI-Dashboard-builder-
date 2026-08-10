import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  ChartRefineBodySchema,
  staleChartRevisionResponse,
} from '../src/lib/ai/chart-refinement-route-contract'
import { parseChartAiPatchPayload } from '../src/lib/ai/chart-ai-contract'
import {
  finalizeChartRefinementProposalAtomic,
  loadDurableChartRefinementProposal,
  StoredChartRefinementProposalSchema,
} from '../src/lib/ai/chart-refinement-proposals'
import { demoChart } from '../src/lib/dashboardos/demo-data'

const baseUpdatedAt = '2026-07-31T08:00:00.000Z'
const proposalId = '44444444-4444-4444-8444-444444444444'
const requestIds = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  chartId: '33333333-3333-4333-8333-333333333333',
}

const storedNextChart = {
  name: demoChart.name,
  description: demoChart.description ?? null,
  templateId: demoChart.templateId,
  encoding: {
    xAxisFieldId: requestIds.chartId,
    yMetricIds: [proposalId],
    tooltipFieldIds: [],
    labelById: {},
    colorById: {},
  },
  presentation: { ...demoChart.presentation, showGrid: false },
  validationState: 'valid' as const,
}

function createRpcClient(data: unknown, error: { message: string } | null = null) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  return {
    client: {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args })
        return { data, error }
      },
    },
    calls,
  }
}

function createProposalLookupClient(proposal: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: {
        id: proposalId,
        run_id: '55555555-5555-4555-8555-555555555555',
        status: 'needs_review',
        proposal,
      },
      error: null,
    }),
  }
  return { from: () => query }
}

test.describe('chart refinement apply boundary', () => {
  test('requires a durable proposal and source revision only when applying', () => {
    expect(ChartRefineBodySchema.safeParse({
      ...requestIds,
      instruction: 'Hide gridlines',
    }).success).toBe(true)

    expect(ChartRefineBodySchema.safeParse({
      ...requestIds,
      instruction: 'Hide gridlines',
      apply: true,
      patch: { presentation: { showGrid: false } },
    }).success).toBe(false)

    expect(ChartRefineBodySchema.safeParse({
      ...requestIds,
      instruction: 'Hide gridlines',
      apply: true,
      proposalId,
    }).success).toBe(false)

    expect(ChartRefineBodySchema.safeParse({
      ...requestIds,
      instruction: 'Hide gridlines',
      apply: true,
      mode: 'presentation_only',
      baseUpdatedAt,
      proposalId,
    }).success).toBe(true)
  })

  test('presentation-only mode rejects structural chart changes', () => {
    expect(parseChartAiPatchPayload({
      presentation: { showGrid: false },
    }, 'presentation_only').ok).toBe(true)

    expect(parseChartAiPatchPayload({
      name: 'Mutated title',
      presentation: { showGrid: false },
    }, 'presentation_only')).toMatchObject({
      ok: false,
      errorCode: 'invalid_model_patch',
    })
  })

  test('stores the validated chart mutation beside the server-owned patch', () => {
    expect(StoredChartRefinementProposalSchema.safeParse({
      chartId: requestIds.chartId,
      mode: 'presentation_only',
      baseUpdatedAt,
      patch: { schemaVersion: 'dashboardos.ai.chart_patch.v1', presentation: { showGrid: false } },
      nextChart: storedNextChart,
      resolution: 'deterministic',
    }).success).toBe(true)
    expect(StoredChartRefinementProposalSchema.safeParse({
      chartId: requestIds.chartId,
      mode: 'presentation_only',
      baseUpdatedAt,
      patch: {},
      nextChart: storedNextChart,
      resolution: 'deterministic',
      executableFormatter: 'return value',
    }).success).toBe(false)

    const route = readFileSync(join(process.cwd(), 'src/app/api/ai/chart-refine/route.ts'), 'utf8')
    expect(route).toContain('reviewedPatch = durableProposal.stored.patch')
    expect(route).toContain('reviewedBaseUpdatedAt = durableProposal.stored.baseUpdatedAt')
    expect(route).toContain('finalizeChartRefinementProposalAtomic')
    expect(route).not.toContain('persistChartRefinement')
  })

  test('classifies pre-nextChart proposals as regeneration-required', async () => {
    const client = createProposalLookupClient({
      chartId: requestIds.chartId,
      mode: 'presentation_only',
      baseUpdatedAt,
      patch: { schemaVersion: 'dashboardos.ai.chart_patch.v1', presentation: { showGrid: false } },
      resolution: 'deterministic',
    })

    await expect(loadDurableChartRefinementProposal({
      supabase: client as never,
      proposalId,
      tenantId: requestIds.tenantId,
      projectId: requestIds.projectId,
    })).resolves.toMatchObject({
      ok: false,
      errorCode: 'proposal_regeneration_required',
    })
  })

  test('claim and apply use the single database-owned transaction contract', async () => {
    const persistedRow = {
      id: requestIds.chartId,
      tenant_id: requestIds.tenantId,
      project_id: requestIds.projectId,
      status: 'draft',
      published_at: null,
      updated_at: '2026-07-31T08:05:00.000Z',
    }
    const { client, calls } = createRpcClient({
      ok: true,
      outcome: 'applied',
      proposalId,
      proposalStatus: 'applied',
      chart: persistedRow,
    })

    await expect(finalizeChartRefinementProposalAtomic({
      supabase: client as never,
      ...requestIds,
      proposalId,
      baseUpdatedAt,
      action: 'apply',
    })).resolves.toMatchObject({ ok: true, proposalStatus: 'applied', chart: persistedRow })

    expect(calls).toEqual([{
      name: 'finalize_chart_refinement_proposal',
      args: {
        p_tenant_id: requestIds.tenantId,
        p_project_id: requestIds.projectId,
        p_chart_id: requestIds.chartId,
        p_proposal_id: proposalId,
        p_base_updated_at: baseUpdatedAt,
        p_action: 'apply',
        p_rejection_reason: null,
      },
    }])
  })

  test('preserves stale revision response while the transaction rejects the proposal', async () => {
    const { client } = createRpcClient({
      ok: false,
      outcome: 'rejected',
      errorCode: 'stale_chart_revision',
      error: 'Source chart changed after proposal generation.',
      proposalId,
      proposalStatus: 'rejected',
      chart: { id: demoChart.id, updated_at: demoChart.updatedAt },
    })
    const result = await finalizeChartRefinementProposalAtomic({
      supabase: client as never,
      ...requestIds,
      proposalId,
      baseUpdatedAt,
      action: 'apply',
    })
    expect(result).toMatchObject({
      ok: false,
      errorCode: 'stale_chart_revision',
      proposalStatus: 'rejected',
    })

    const response = staleChartRevisionResponse({
      patch: { presentation: { showGrid: false } },
      chart: demoChart,
      validation: { state: 'valid', issues: [] },
    })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'stale_chart_revision',
      chart: { id: demoChart.id },
    })
  })

  test('surfaces replayed apply as a non-claimable proposal conflict', async () => {
    const { client } = createRpcClient({
      ok: false,
      errorCode: 'invalid_chart_proposal',
      error: 'Chart refinement proposal is no longer claimable.',
      proposalId,
    })
    await expect(finalizeChartRefinementProposalAtomic({
      supabase: client as never,
      ...requestIds,
      proposalId,
      baseUpdatedAt,
      action: 'apply',
    })).resolves.toMatchObject({ ok: false, errorCode: 'invalid_chart_proposal' })
  })

  test('uses the same transaction for explicit proposal rejection', async () => {
    const { client, calls } = createRpcClient({
      ok: true,
      outcome: 'rejected',
      proposalId,
      proposalStatus: 'rejected',
      chart: { id: requestIds.chartId },
    })
    await expect(finalizeChartRefinementProposalAtomic({
      supabase: client as never,
      ...requestIds,
      proposalId,
      action: 'reject',
      rejectionReason: 'Labels are not readable',
    })).resolves.toMatchObject({ ok: true, outcome: 'rejected' })
    expect(calls[0]?.args).toMatchObject({
      p_action: 'reject',
      p_base_updated_at: null,
      p_rejection_reason: 'Labels are not readable',
    })
  })

  test('database contract locks both records and contains partial failures', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260803121110_transactional_chart_refinement_apply.sql'),
      'utf8',
    ).toLowerCase()

    expect(migration).toContain('create or replace function finalize_chart_refinement_proposal')
    expect(migration.match(/for update;/g)?.length).toBeGreaterThanOrEqual(3)
    expect(migration).toContain("v_proposal.status not in ('validated', 'needs_review')")
    expect(migration).toMatch(/status\s*=\s*'draft'/)
    expect(migration).toContain('published_at = null')
    expect(migration).toMatch(/status\s*=\s*'applied'/)
    expect(migration).toContain("error_code = 'stale_chart_revision'")
    expect(migration).toContain('exception when others then')
    expect(migration).toContain("error_code = 'chart_refinement_apply_failed'")
    expect(migration).toContain('v_chart := v_original_chart')
    expect(migration).toContain('guard_chart_refinement_proposal_update')
    expect(migration).not.toContain('dashboard_release_versions')
    expect(migration).not.toContain('published_dashboard_versions')
  })
})
