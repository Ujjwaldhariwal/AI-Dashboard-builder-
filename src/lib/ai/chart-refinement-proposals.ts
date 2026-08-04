import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { ChartAiPatch, ChartRefinementMode } from '@/lib/ai/chart-ai-contract'
import { DashboardChartPresentationSchema } from '@/lib/charts/dashboard-chart-presentation'
import {
  AI_WORKFLOW_CONTRACT_VERSION,
  AiWorkflowRequestSchema,
  type AiWorkflowValidation,
} from '@/lib/ai/workflow-contracts'
import { resolveAiWorkflowModelSelection } from '@/lib/ai/workflow-provider'
import {
  createAiWorkflowProposal,
  failAiWorkflowRun,
  markAiWorkflowAwaitingReview,
  startAiWorkflowRun,
} from '@/lib/ai/workflow-runs'
import type { DashboardChartConfig, DashboardChartValidationResult } from '@/types/dashboard-chart'

export const CHART_REFINEMENT_PROMPT_VERSION = 'dashboardos.chart-refinement.v2' as const

const ChartTemplateIdSchema = z.enum([
  'bar',
  'horizontal-bar',
  'grouped-bar',
  'horizontal-stacked-bar',
  'line',
  'trend-composed',
  'pie',
  'gauge',
  'ring-gauge',
  'kpi-card',
  'kpi-grid',
  'drilldown-bar',
  'table-grid',
])

const DashboardChartEncodingSchema = z.object({
  xAxisFieldId: z.string().uuid().optional(),
  yMetricIds: z.array(z.string().uuid()).max(6),
  seriesFieldId: z.string().uuid().optional(),
  stackMetricIds: z.array(z.string().uuid()).max(6).optional(),
  tooltipFieldIds: z.array(z.string().uuid()).max(8),
  labelById: z.record(z.string(), z.string().max(120)),
  colorById: z.record(z.string(), z.string().max(120)),
  sort: z.object({
    byId: z.string().uuid(),
    direction: z.enum(['asc', 'desc']),
  }).strict().nullable().optional(),
  limit: z.number().int().min(1).max(500).nullable().optional(),
  filters: z.array(z.object({
    fieldId: z.string().uuid(),
    operator: z.enum(['eq', 'not_eq', 'in', 'contains', 'gte', 'lte']),
    value: z.union([
      z.string().max(120),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string().max(120), z.number(), z.boolean()])).min(1).max(12),
    ]),
  }).strict()).max(4).optional(),
}).strict()

export const StoredChartMutationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(500).nullable(),
  templateId: ChartTemplateIdSchema,
  encoding: DashboardChartEncodingSchema,
  presentation: DashboardChartPresentationSchema,
  validationState: z.enum(['valid', 'warning']),
}).strict()

export const StoredChartRefinementProposalSchema = z.object({
  chartId: z.string().uuid(),
  mode: z.enum(['general', 'presentation_only']),
  baseUpdatedAt: z.string().datetime({ offset: true }),
  patch: z.record(z.string(), z.unknown()),
  nextChart: StoredChartMutationSchema,
  resolution: z.enum(['deterministic', 'model']),
}).strict()

export type StoredChartRefinementProposal = z.infer<typeof StoredChartRefinementProposalSchema>

function workflowValidation(validation: DashboardChartValidationResult): AiWorkflowValidation {
  return {
    state: validation.state === 'unknown' ? 'invalid' : validation.state,
    issues: validation.issues,
  }
}

export async function createDurableChartRefinementProposal({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  chartId,
  datasetId,
  instruction,
  mode,
  patch,
  baseUpdatedAt,
  resolution,
  validation,
  nextChart,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  chartId: string
  datasetId: string
  instruction: string
  mode: ChartRefinementMode
  patch: ChartAiPatch
  baseUpdatedAt: string
  resolution: 'deterministic' | 'model'
  validation: DashboardChartValidationResult
  nextChart: DashboardChartConfig
}) {
  const startedAt = Date.now()
  const provider = resolveAiWorkflowModelSelection({ workflowType: 'chart_refinement' })
  const request = AiWorkflowRequestSchema.parse({
    contractVersion: AI_WORKFLOW_CONTRACT_VERSION,
    tenantId,
    projectId,
    workflowType: 'chart_refinement',
    instruction,
    context: { chartId, datasetId, mode },
  })
  const run = await startAiWorkflowRun({
    supabase,
    request,
    actorUserId,
    providerId: provider.providerId,
    modelId: resolution === 'deterministic' ? 'deterministic' : provider.modelId,
    promptVersion: CHART_REFINEMENT_PROMPT_VERSION,
  })
  const parsedValidation = workflowValidation(validation)

  try {
    const stored = StoredChartRefinementProposalSchema.parse({
      chartId,
      mode,
      baseUpdatedAt,
      patch,
      nextChart: {
        name: nextChart.name,
        description: nextChart.description ?? null,
        templateId: nextChart.templateId,
        encoding: nextChart.encoding,
        presentation: nextChart.presentation,
        validationState: validation.state,
      },
      resolution,
    })
    const proposal = await createAiWorkflowProposal({
      supabase,
      runId: run.id,
      tenantId,
      projectId,
      envelope: {
        contractVersion: AI_WORKFLOW_CONTRACT_VERSION,
        workflowType: 'chart_refinement',
        artifactType: 'chart',
        confidence: validation.state === 'valid' ? 0.95 : 0.75,
        rationale: 'Governed chart refinement proposal awaiting explicit review.',
        proposal: stored,
        warnings: validation.issues.filter(issue => issue.severity === 'warning').map(issue => issue.message),
        requiresReview: true,
      },
      validation: parsedValidation,
    })
    await markAiWorkflowAwaitingReview({
      supabase,
      runId: run.id,
      tenantId,
      projectId,
      outputSummary: { proposalId: proposal.id, chartId, resolution },
      validation: parsedValidation,
      latencyMs: Date.now() - startedAt,
    })
    return { proposalId: proposal.id, runId: run.id, proposalStatus: proposal.status }
  } catch (error) {
    await failAiWorkflowRun({
      supabase,
      runId: run.id,
      tenantId,
      projectId,
      errorCode: 'chart_refinement_proposal_persistence_failed',
      errorMessage: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    }).catch(() => undefined)
    throw error
  }
}

export const ChartRefinementTransactionResultSchema = z.object({
  ok: z.boolean(),
  outcome: z.enum(['applied', 'rejected']).optional(),
  errorCode: z.enum([
    'invalid_chart_proposal',
    'stale_chart_revision',
    'chart_not_found',
    'chart_refinement_apply_failed',
  ]).optional(),
  error: z.string().optional(),
  proposalId: z.string().uuid().optional(),
  proposalStatus: z.enum(['applied', 'rejected']).optional(),
  chart: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict()

export async function finalizeChartRefinementProposalAtomic({
  supabase,
  tenantId,
  projectId,
  chartId,
  proposalId,
  baseUpdatedAt,
  action,
  rejectionReason,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  chartId: string
  proposalId: string
  baseUpdatedAt?: string
  action: 'apply' | 'reject'
  rejectionReason?: string
}) {
  const { data, error } = await supabase.rpc('finalize_chart_refinement_proposal', {
    p_tenant_id: tenantId,
    p_project_id: projectId,
    p_chart_id: chartId,
    p_proposal_id: proposalId,
    p_base_updated_at: baseUpdatedAt ?? null,
    p_action: action,
    p_rejection_reason: rejectionReason ?? null,
  })
  if (error) {
    if (/pgrst202|schema cache|finalize_chart_refinement_proposal/i.test(`${error.code ?? ''} ${error.message}`)) {
      throw new Error('chart_refinement_rpc_unavailable')
    }
    throw new Error(error.message)
  }
  return ChartRefinementTransactionResultSchema.parse(data)
}

export async function loadDurableChartRefinementProposal({
  supabase,
  proposalId,
  tenantId,
  projectId,
}: {
  supabase: SupabaseClient
  proposalId: string
  tenantId: string
  projectId: string
}) {
  const { data, error } = await supabase
    .from('ai_workflow_proposals')
    .select('id, run_id, status, proposal')
    .eq('id', proposalId)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('artifact_type', 'chart')
    .maybeSingle()

  if (error || !data) return {
    ok: false as const,
    errorCode: 'invalid_chart_proposal' as const,
    error: error?.message ?? 'Chart refinement proposal not found.',
  }
  if (!['validated', 'needs_review'].includes(String(data.status))) {
    return {
      ok: false as const,
      errorCode: 'invalid_chart_proposal' as const,
      error: 'Chart refinement proposal is no longer available for apply.',
    }
  }
  const parsed = StoredChartRefinementProposalSchema.safeParse(data.proposal)
  if (!parsed.success) {
    const record = data.proposal && typeof data.proposal === 'object' && !Array.isArray(data.proposal)
      ? data.proposal as Record<string, unknown>
      : {}
    const requiresRegeneration = Boolean(record.chartId && record.patch && !record.nextChart)
    return {
      ok: false as const,
      errorCode: requiresRegeneration ? 'proposal_regeneration_required' as const : 'invalid_chart_proposal' as const,
      error: requiresRegeneration
        ? 'This proposal predates transactional chart apply and must be regenerated.'
        : 'Stored chart refinement proposal is invalid.',
    }
  }

  return {
    ok: true as const,
    proposalId: String(data.id),
    runId: String(data.run_id),
    stored: parsed.data,
  }
}
