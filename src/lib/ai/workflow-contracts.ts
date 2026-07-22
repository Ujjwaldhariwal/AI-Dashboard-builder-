import { z } from 'zod'

export const AI_WORKFLOW_CONTRACT_VERSION = 'dashboardos.ai.workflow.v1' as const

export const AI_WORKFLOW_TYPES = [
  'semantic_mapping',
  'dataset_planning',
  'dashboard_composition',
  'report_generation',
  'chart_refinement',
  'data_transform',
] as const

export const AI_WORKFLOW_STATUSES = [
  'queued',
  'running',
  'awaiting_review',
  'succeeded',
  'failed',
  'cancelled',
] as const

export const AI_ARTIFACT_TYPES = [
  'semantic_model',
  'dataset',
  'dashboard',
  'chart',
  'report',
] as const

export const AI_PROPOSAL_STATUSES = [
  'proposed',
  'validated',
  'needs_review',
  'approved',
  'rejected',
  'applied',
] as const

export const AiWorkflowTypeSchema = z.enum(AI_WORKFLOW_TYPES)
export const AiWorkflowStatusSchema = z.enum(AI_WORKFLOW_STATUSES)
export const AiArtifactTypeSchema = z.enum(AI_ARTIFACT_TYPES)
export const AiProposalStatusSchema = z.enum(AI_PROPOSAL_STATUSES)

export const AiWorkflowRequestSchema = z.object({
  contractVersion: z.literal(AI_WORKFLOW_CONTRACT_VERSION).default(AI_WORKFLOW_CONTRACT_VERSION),
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  workflowType: AiWorkflowTypeSchema,
  instruction: z.string().trim().min(1).max(8_000),
  context: z.record(z.string(), z.unknown()).default({}),
}).strict()

export const AiWorkflowValidationIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1_000),
  path: z.array(z.string().max(120)).max(12).optional(),
}).strict()

export const AiWorkflowValidationSchema = z.object({
  state: z.enum(['valid', 'warning', 'invalid']),
  issues: z.array(AiWorkflowValidationIssueSchema).max(100).default([]),
}).strict()

export const AiWorkflowUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
}).strict()

export const AiWorkflowProposalEnvelopeSchema = z.object({
  contractVersion: z.literal(AI_WORKFLOW_CONTRACT_VERSION).default(AI_WORKFLOW_CONTRACT_VERSION),
  workflowType: AiWorkflowTypeSchema,
  artifactType: AiArtifactTypeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().max(2_000).default(''),
  proposal: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  requiresReview: z.boolean().default(true),
}).strict()

export type AiWorkflowType = z.infer<typeof AiWorkflowTypeSchema>
export type AiWorkflowStatus = z.infer<typeof AiWorkflowStatusSchema>
export type AiArtifactType = z.infer<typeof AiArtifactTypeSchema>
export type AiProposalStatus = z.infer<typeof AiProposalStatusSchema>
export type AiWorkflowRequest = z.infer<typeof AiWorkflowRequestSchema>
export type AiWorkflowValidation = z.infer<typeof AiWorkflowValidationSchema>
export type AiWorkflowUsage = z.infer<typeof AiWorkflowUsageSchema>
export type AiWorkflowProposalEnvelope = z.infer<typeof AiWorkflowProposalEnvelopeSchema>
