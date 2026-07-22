import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'

import {
  buildDeterministicDatasetProposal,
  DatasetCopilotProposalSchema,
  validateDatasetCopilotProposal,
  type DatasetFieldEvidence,
  type DatasetMetricEvidence,
  type DatasetRelationshipEvidence,
} from '@/lib/ai/dataset-copilot'
import { AI_WORKFLOW_CONTRACT_VERSION, AiWorkflowRequestSchema } from '@/lib/ai/workflow-contracts'
import { getAiWorkflowModel } from '@/lib/ai/workflow-provider'
import {
  createAiWorkflowProposal,
  failAiWorkflowRun,
  markAiWorkflowAwaitingReview,
  startAiWorkflowRun,
} from '@/lib/ai/workflow-runs'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { BusinessFieldRole, BusinessMetricAggregation, BusinessRelationshipType } from '@/types/semantic-model'

const PROMPT_VERSION = 'dataset-copilot.v1'
const RequestSchema = z.object({
  instruction: z.string().trim().min(3).max(2_000),
}).strict()

function usageRecord(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) {
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const startedAt = Date.now()
  let run: Awaited<ReturnType<typeof startAiWorkflowRun>> | null = null

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ proposal: null, error: 'Unauthorized' }, { status: 401 })
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ proposal: null, error: parsed.error.flatten() }, { status: 400 })

    const { data: model, error: modelError } = await auth.supabase
      .from('business_models')
      .select('id, tenant_id, project_id, name, version, status')
      .eq('id', id)
      .single()
    if (modelError || !model) return NextResponse.json({ proposal: null, error: modelError?.message ?? 'Business model not found' }, { status: 404 })
    if (model.status !== 'approved') return NextResponse.json({ proposal: null, error: 'Approve the semantic model before planning datasets' }, { status: 409 })

    const tenantId = String(model.tenant_id)
    const projectId = String(model.project_id)
    const access = await requireProjectAccess({ ...accessContext(auth), tenantId, projectId, editor: true })
    if (!access.ok) return NextResponse.json({ proposal: null, error: access.error }, { status: access.status })

    const { data: entityRows, error: entityError } = await auth.supabase
      .from('business_entities')
      .select('id, name')
      .eq('model_id', id)
    if (entityError) return NextResponse.json({ proposal: null, error: entityError.message }, { status: 500 })
    const entityIds = (entityRows ?? []).map(entity => String(entity.id))
    const entityNames = new Map((entityRows ?? []).map(entity => [String(entity.id), String(entity.name)]))

    const [fieldResult, metricResult, relationshipResult] = await Promise.all([
      entityIds.length > 0
        ? auth.supabase.from('business_fields').select('id, entity_id, name, role').in('entity_id', entityIds)
        : Promise.resolve({ data: [], error: null }),
      auth.supabase.from('business_metrics').select('id, entity_id, name, aggregation, description').eq('model_id', id),
      auth.supabase.from('business_relationships').select('id, from_entity_id, to_entity_id, type, description').eq('model_id', id),
    ])
    const assetError = fieldResult.error ?? metricResult.error ?? relationshipResult.error
    if (assetError) return NextResponse.json({ proposal: null, error: assetError.message }, { status: 500 })

    const fields: DatasetFieldEvidence[] = (fieldResult.data ?? []).map(field => ({
      id: String(field.id),
      entityId: String(field.entity_id),
      entityName: entityNames.get(String(field.entity_id)) ?? 'Entity',
      name: String(field.name),
      role: String(field.role) as BusinessFieldRole,
    })).filter(field => field.role !== 'hidden')
    const metrics: DatasetMetricEvidence[] = (metricResult.data ?? []).map(metric => ({
      id: String(metric.id),
      entityId: typeof metric.entity_id === 'string' ? metric.entity_id : null,
      name: String(metric.name),
      aggregation: String(metric.aggregation) as BusinessMetricAggregation,
      description: typeof metric.description === 'string' ? metric.description : null,
    }))
    const relationships: DatasetRelationshipEvidence[] = (relationshipResult.data ?? []).map(relationship => ({
      id: String(relationship.id),
      fromEntityId: String(relationship.from_entity_id),
      toEntityId: String(relationship.to_entity_id),
      type: String(relationship.type) as BusinessRelationshipType,
      description: typeof relationship.description === 'string' ? relationship.description : null,
    }))
    if (fields.length + metrics.length === 0) return NextResponse.json({ proposal: null, error: 'The approved model has no usable fields or metrics' }, { status: 409 })

    const deterministic = buildDeterministicDatasetProposal({ instruction: parsed.data.instruction, fields, metrics, relationships })
    try {
      const ai = getAiWorkflowModel({ workflowType: 'dataset_planning' })
      const workflowRequest = AiWorkflowRequestSchema.parse({
        contractVersion: AI_WORKFLOW_CONTRACT_VERSION,
        tenantId,
        projectId,
        workflowType: 'dataset_planning',
        instruction: parsed.data.instruction,
        context: { semanticModelId: id, fieldCount: fields.length, metricCount: metrics.length, relationshipCount: relationships.length },
      })
      run = await startAiWorkflowRun({
        supabase: auth.supabase,
        request: workflowRequest,
        actorUserId: auth.userId,
        providerId: ai.providerId,
        modelId: ai.modelId,
        promptVersion: PROMPT_VERSION,
      })
      const result = await generateObject({
        model: ai.model,
        schema: DatasetCopilotProposalSchema,
        system: `You are DashboardOS Dataset Copilot. Select a compact, useful dataset from an approved semantic model.
Reference only supplied IDs. Prefer business dimensions and dates over technical identifiers. Include only metrics relevant to the objective. Include approved relationships needed to connect selected entities. Never emit SQL or invent fields. The engineer reviews every proposal before it is created.`,
        prompt: `BUSINESS OBJECTIVE\n${parsed.data.instruction}\n\nAPPROVED SEMANTIC MODEL\n${String(model.name)} v${Number(model.version ?? 1)}\n\nFIELDS\n${JSON.stringify(fields)}\n\nMETRICS\n${JSON.stringify(metrics)}\n\nRELATIONSHIPS\n${JSON.stringify(relationships)}`,
      })
      const checked = validateDatasetCopilotProposal({ proposal: result.object, fields, metrics, relationships })
      const validation = { state: checked.state, issues: checked.issues }
      const saved = await createAiWorkflowProposal({
        supabase: auth.supabase,
        runId: run.id,
        tenantId,
        projectId,
        envelope: {
          contractVersion: AI_WORKFLOW_CONTRACT_VERSION,
          workflowType: 'dataset_planning',
          artifactType: 'dataset',
          confidence: checked.proposal.confidence,
          rationale: checked.proposal.rationale,
          proposal: checked.proposal,
          warnings: [...checked.proposal.warnings, ...checked.issues.map(issue => issue.message)],
          requiresReview: true,
        },
        validation,
      })
      await markAiWorkflowAwaitingReview({
        supabase: auth.supabase,
        runId: run.id,
        tenantId,
        projectId,
        outputSummary: { proposalId: saved.id, fieldCount: checked.proposal.fieldIds.length, metricCount: checked.proposal.metricIds.length },
        validation,
        usage: usageRecord(result.usage),
        latencyMs: Date.now() - startedAt,
      })
      return NextResponse.json({ proposalId: saved.id, proposal: checked.proposal, validation, source: 'ai' })
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : 'Dataset AI generation failed'
      if (run) {
        await failAiWorkflowRun({
          supabase: auth.supabase,
          runId: run.id,
          tenantId,
          projectId,
          errorCode: 'dataset_generation_failed',
          errorMessage: message,
          latencyMs: Date.now() - startedAt,
        }).catch(() => undefined)
      }
      return NextResponse.json({ proposalId: null, proposal: deterministic, validation: { state: 'valid', issues: [] }, source: 'deterministic', warning: message.slice(0, 500) })
    }
  } catch (error) {
    return NextResponse.json({ proposal: null, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
