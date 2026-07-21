import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  AI_WORKFLOW_CONTRACT_VERSION,
  AiWorkflowProposalEnvelopeSchema,
  AiWorkflowValidationSchema,
  type AiArtifactType,
  type AiProposalStatus,
  type AiWorkflowProposalEnvelope,
  type AiWorkflowRequest,
  type AiWorkflowStatus,
  type AiWorkflowType,
  type AiWorkflowUsage,
  type AiWorkflowValidation,
} from '@/lib/ai/workflow-contracts'
import type { AiProviderId } from '@/lib/ai/workflow-provider'

const SAFE_REFERENCE_KEYS = [
  'dataSourceId',
  'schemaHash',
  'semanticModelId',
  'datasetId',
  'dashboardId',
  'chartId',
  'reportId',
] as const

export interface AiWorkflowRun {
  id: string
  tenantId: string
  projectId: string
  actorUserId: string | null
  workflowType: AiWorkflowType
  status: AiWorkflowStatus
  providerId: AiProviderId
  modelId: string
  promptVersion: string
  contractVersion: string
  inputHash: string
  inputSummary: Record<string, unknown>
  outputSummary: Record<string, unknown>
  validationSummary: Record<string, unknown>
  usage: Record<string, unknown>
  latencyMs: number | null
  errorCode: string | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AiWorkflowProposal {
  id: string
  runId: string
  tenantId: string
  projectId: string
  artifactType: AiArtifactType
  status: AiProposalStatus
  contractVersion: string
  confidence: number
  proposal: Record<string, unknown>
  validation: Record<string, unknown>
  warnings: string[]
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  )
}

export function buildAiWorkflowInputFingerprint(request: Pick<AiWorkflowRequest, 'workflowType' | 'instruction' | 'context'>) {
  const normalized = JSON.stringify(stableValue(request))
  const references = Object.fromEntries(
    SAFE_REFERENCE_KEYS.flatMap(key => {
      const value = request.context[key]
      return typeof value === 'string' && value.trim() ? [[key, value.trim()]] : []
    }),
  )

  return {
    inputHash: createHash('sha256').update(normalized).digest('hex'),
    inputSummary: {
      instructionCharacters: request.instruction.length,
      contextKeys: Object.keys(request.context).sort(),
      references,
    },
  }
}

export function mapAiWorkflowRun(row: Record<string, unknown>): AiWorkflowRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : null,
    workflowType: String(row.workflow_type) as AiWorkflowType,
    status: String(row.status) as AiWorkflowStatus,
    providerId: String(row.provider_id) as AiProviderId,
    modelId: String(row.model_id),
    promptVersion: String(row.prompt_version),
    contractVersion: String(row.contract_version),
    inputHash: String(row.input_hash),
    inputSummary: asRecord(row.input_summary),
    outputSummary: asRecord(row.output_summary),
    validationSummary: asRecord(row.validation_summary),
    usage: asRecord(row.usage),
    latencyMs: typeof row.latency_ms === 'number' ? row.latency_ms : null,
    errorCode: typeof row.error_code === 'string' ? row.error_code : null,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function mapAiWorkflowProposal(row: Record<string, unknown>): AiWorkflowProposal {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    artifactType: String(row.artifact_type) as AiArtifactType,
    status: String(row.status) as AiProposalStatus,
    contractVersion: String(row.contract_version),
    confidence: Number(row.confidence ?? 0),
    proposal: asRecord(row.proposal),
    validation: asRecord(row.validation),
    warnings: Array.isArray(row.warnings) ? row.warnings.filter(item => typeof item === 'string') : [],
    reviewedBy: typeof row.reviewed_by === 'string' ? row.reviewed_by : null,
    reviewedAt: typeof row.reviewed_at === 'string' ? row.reviewed_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export async function startAiWorkflowRun({
  supabase,
  request,
  actorUserId,
  providerId,
  modelId,
  promptVersion,
}: {
  supabase: SupabaseClient
  request: AiWorkflowRequest
  actorUserId: string
  providerId: AiProviderId
  modelId: string
  promptVersion: string
}) {
  const nowIso = new Date().toISOString()
  const fingerprint = buildAiWorkflowInputFingerprint(request)
  const { data, error } = await supabase
    .from('ai_workflow_runs')
    .insert({
      tenant_id: request.tenantId,
      project_id: request.projectId,
      actor_user_id: actorUserId,
      workflow_type: request.workflowType,
      status: 'running',
      provider_id: providerId,
      model_id: modelId,
      prompt_version: promptVersion,
      contract_version: request.contractVersion,
      input_hash: fingerprint.inputHash,
      input_summary: fingerprint.inputSummary,
      started_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Unable to start AI workflow run')
  return mapAiWorkflowRun(data as Record<string, unknown>)
}

async function updateAiWorkflowRun({
  supabase,
  runId,
  tenantId,
  projectId,
  values,
}: {
  supabase: SupabaseClient
  runId: string
  tenantId: string
  projectId: string
  values: Record<string, unknown>
}) {
  const { data, error } = await supabase
    .from('ai_workflow_runs')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Unable to update AI workflow run')
  return mapAiWorkflowRun(data as Record<string, unknown>)
}

export function markAiWorkflowAwaitingReview({
  supabase,
  runId,
  tenantId,
  projectId,
  outputSummary = {},
  validation,
  usage = {},
  latencyMs,
}: {
  supabase: SupabaseClient
  runId: string
  tenantId: string
  projectId: string
  outputSummary?: Record<string, unknown>
  validation: AiWorkflowValidation
  usage?: AiWorkflowUsage
  latencyMs?: number | null
}) {
  const parsedValidation = AiWorkflowValidationSchema.parse(validation)
  return updateAiWorkflowRun({
    supabase,
    runId,
    tenantId,
    projectId,
    values: {
      status: 'awaiting_review',
      output_summary: outputSummary,
      validation_summary: parsedValidation,
      usage,
      latency_ms: latencyMs ?? null,
    },
  })
}

export function completeAiWorkflowRun({
  supabase,
  runId,
  tenantId,
  projectId,
  outputSummary = {},
  validation,
  usage = {},
  latencyMs,
}: {
  supabase: SupabaseClient
  runId: string
  tenantId: string
  projectId: string
  outputSummary?: Record<string, unknown>
  validation: AiWorkflowValidation
  usage?: AiWorkflowUsage
  latencyMs?: number | null
}) {
  const nowIso = new Date().toISOString()
  const parsedValidation = AiWorkflowValidationSchema.parse(validation)
  return updateAiWorkflowRun({
    supabase,
    runId,
    tenantId,
    projectId,
    values: {
      status: 'succeeded',
      output_summary: outputSummary,
      validation_summary: parsedValidation,
      usage,
      latency_ms: latencyMs ?? null,
      completed_at: nowIso,
      error_code: null,
      error_message: null,
    },
  })
}

export function failAiWorkflowRun({
  supabase,
  runId,
  tenantId,
  projectId,
  errorCode,
  errorMessage,
  latencyMs,
}: {
  supabase: SupabaseClient
  runId: string
  tenantId: string
  projectId: string
  errorCode: string
  errorMessage: string
  latencyMs?: number | null
}) {
  return updateAiWorkflowRun({
    supabase,
    runId,
    tenantId,
    projectId,
    values: {
      status: 'failed',
      error_code: errorCode.slice(0, 100),
      error_message: errorMessage.slice(0, 2_000),
      latency_ms: latencyMs ?? null,
      completed_at: new Date().toISOString(),
    },
  })
}

export async function createAiWorkflowProposal({
  supabase,
  runId,
  tenantId,
  projectId,
  envelope,
  validation,
}: {
  supabase: SupabaseClient
  runId: string
  tenantId: string
  projectId: string
  envelope: AiWorkflowProposalEnvelope
  validation: AiWorkflowValidation
}) {
  const proposal = AiWorkflowProposalEnvelopeSchema.parse(envelope)
  const parsedValidation = AiWorkflowValidationSchema.parse(validation)
  const status: AiProposalStatus = parsedValidation.state === 'invalid'
    ? 'needs_review'
    : parsedValidation.state === 'warning' || proposal.requiresReview
      ? 'needs_review'
      : 'validated'
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('ai_workflow_proposals')
    .insert({
      run_id: runId,
      tenant_id: tenantId,
      project_id: projectId,
      artifact_type: proposal.artifactType,
      status,
      contract_version: proposal.contractVersion,
      confidence: proposal.confidence,
      proposal: proposal.proposal,
      validation: parsedValidation,
      warnings: proposal.warnings,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Unable to save AI workflow proposal')
  return mapAiWorkflowProposal(data as Record<string, unknown>)
}

export async function reviewAiWorkflowProposal({
  supabase,
  proposalId,
  tenantId,
  projectId,
  status,
  reviewedBy,
  proposal,
}: {
  supabase: SupabaseClient
  proposalId: string
  tenantId: string
  projectId: string
  status: Extract<AiProposalStatus, 'approved' | 'rejected' | 'applied'>
  reviewedBy: string
  proposal?: Record<string, unknown>
}) {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('ai_workflow_proposals')
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: nowIso,
      ...(proposal ? { proposal } : {}),
      updated_at: nowIso,
    })
    .eq('id', proposalId)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Unable to review AI workflow proposal')
  return mapAiWorkflowProposal(data as Record<string, unknown>)
}

export const AI_WORKFLOW_RUN_SELECT = [
  'id',
  'tenant_id',
  'project_id',
  'actor_user_id',
  'workflow_type',
  'status',
  'provider_id',
  'model_id',
  'prompt_version',
  'contract_version',
  'input_hash',
  'input_summary',
  'output_summary',
  'validation_summary',
  'usage',
  'latency_ms',
  'error_code',
  'error_message',
  'started_at',
  'completed_at',
  'created_at',
  'updated_at',
].join(', ')

export const DEFAULT_AI_WORKFLOW_CONTRACT_VERSION = AI_WORKFLOW_CONTRACT_VERSION
