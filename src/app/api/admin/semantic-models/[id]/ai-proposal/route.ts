import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'

import {
  buildDeterministicSemanticProposal,
  SemanticCopilotProposalSchema,
  validateSemanticCopilotProposal,
} from '@/lib/ai/semantic-copilot'
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
import type { DataSourceColumnMetadata } from '@/types/data-source'

const PROMPT_VERSION = 'semantic-copilot.v1'

const SemanticProposalRequestSchema = z.object({
  instruction: z.string().trim().min(3).max(2_000).default('Build a reusable semantic model for dashboards and operational analysis.'),
  dataSourceId: z.string().uuid().optional(),
}).strict()

function mapColumn(row: Record<string, unknown>): DataSourceColumnMetadata {
  return {
    id: String(row.id),
    dataSourceId: String(row.data_source_id),
    relationId: typeof row.relation_id === 'string' ? row.relation_id : null,
    schemaName: String(row.schema_name ?? ''),
    tableName: String(row.table_name ?? ''),
    columnName: String(row.column_name ?? ''),
    ordinalPosition: Number(row.ordinal_position ?? 0),
    dataType: String(row.data_type ?? ''),
    udtName: String(row.udt_name ?? ''),
    isNullable: Boolean(row.is_nullable),
    columnDefault: typeof row.column_default === 'string' ? row.column_default : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

function usageRecord(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const startedAt = Date.now()
  let run: Awaited<ReturnType<typeof startAiWorkflowRun>> | null = null

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ proposal: null, error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const parsed = SemanticProposalRequestSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ proposal: null, error: parsed.error.flatten() }, { status: 400 })

    const { data: model, error: modelError } = await auth.supabase
      .from('business_models')
      .select('id, tenant_id, project_id, name, status, version')
      .eq('id', id)
      .single()

    if (modelError || !model) return NextResponse.json({ proposal: null, error: modelError?.message ?? 'Business model not found' }, { status: 404 })
    if (model.status === 'approved' || model.status === 'archived') {
      return NextResponse.json({ proposal: null, error: 'Create or reopen a draft model before generating semantic proposals' }, { status: 409 })
    }

    const tenantId = String(model.tenant_id)
    const projectId = String(model.project_id)
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId,
      projectId,
      editor: true,
    })
    if (!access.ok) return NextResponse.json({ proposal: null, error: access.error }, { status: access.status })

    let selectionQuery = auth.supabase
      .from('data_source_relation_selections')
      .select('relation_id')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('status', 'included')
    if (parsed.data.dataSourceId) selectionQuery = selectionQuery.eq('data_source_id', parsed.data.dataSourceId)
    const { data: selectedRelations, error: selectionError } = await selectionQuery

    if (selectionError) return NextResponse.json({ proposal: null, error: selectionError.message }, { status: 503 })
    const relationIds = (selectedRelations ?? []).map(row => String(row.relation_id))
    if (relationIds.length === 0) {
      return NextResponse.json({ proposal: null, error: 'Confirm at least one table in the datasource schema inventory first' }, { status: 409 })
    }

    const { data: columnRows, error: columnError } = await auth.supabase
      .from('data_source_columns')
      .select('id, data_source_id, relation_id, schema_name, table_name, column_name, ordinal_position, data_type, udt_name, is_nullable, column_default, created_at')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .in('relation_id', relationIds)
      .order('schema_name')
      .order('table_name')
      .order('ordinal_position')
      .limit(300)

    if (columnError) return NextResponse.json({ proposal: null, error: columnError.message }, { status: 500 })
    const columns = (columnRows ?? []).map(row => mapColumn(row as Record<string, unknown>))
    if (columns.length === 0) return NextResponse.json({ proposal: null, error: 'The approved schema scope has no available columns' }, { status: 409 })

    const deterministic = buildDeterministicSemanticProposal(columns, parsed.data.instruction)

    try {
      const ai = getAiWorkflowModel({ workflowType: 'semantic_mapping' })
      const workflowRequest = AiWorkflowRequestSchema.parse({
        contractVersion: AI_WORKFLOW_CONTRACT_VERSION,
        tenantId,
        projectId,
        workflowType: 'semantic_mapping',
        instruction: parsed.data.instruction,
        context: {
          semanticModelId: id,
          dataSourceId: parsed.data.dataSourceId,
          selectedRelationCount: relationIds.length,
          selectedColumnCount: columns.length,
        },
      })

      run = await startAiWorkflowRun({
        supabase: auth.supabase,
        request: workflowRequest,
        actorUserId: auth.userId,
        providerId: ai.providerId,
        modelId: ai.modelId,
        promptVersion: PROMPT_VERSION,
      })

      const evidence = columns.map(column => ({
        columnId: column.id,
        source: `${column.schemaName}.${column.tableName}.${column.columnName}`,
        dataType: column.dataType,
        nullable: column.isNullable,
      }))

      const result = await generateObject({
        model: ai.model,
        schema: SemanticCopilotProposalSchema,
        system: `You are DashboardOS Semantic Copilot. Convert approved database schema evidence into a reviewable business semantic proposal.

Rules:
- Reference only columnId values supplied in APPROVED SCHEMA EVIDENCE.
- Propose clear business entity and field names without assuming a specific industry.
- Classify identifiers, dimensions, dates, measures, attributes, and sensitive/technical fields conservatively.
- Only attach metric definitions to metric_source mappings.
- Propose joins only when both source column IDs exist and the relationship is plausible.
- Never output SQL, executable expressions, sample values, credentials, or extra keys.
- Confidence is 0 to 1. Low-confidence choices still require a concise reason.
- The proposal is reviewed by a human before materialization.`,
        prompt: `BUSINESS OBJECTIVE
${parsed.data.instruction}

MODEL
${String(model.name)} v${Number(model.version ?? 1)}

APPROVED SCHEMA EVIDENCE
${JSON.stringify(evidence)}

Create the semantic proposal.`,
      })

      const checked = validateSemanticCopilotProposal({ proposal: result.object, selectedColumns: columns })
      const validation = {
        state: checked.state,
        issues: checked.issues.map(issue => ({ ...issue })),
      }
      const savedProposal = await createAiWorkflowProposal({
        supabase: auth.supabase,
        runId: run.id,
        tenantId,
        projectId,
        envelope: {
          contractVersion: AI_WORKFLOW_CONTRACT_VERSION,
          workflowType: 'semantic_mapping',
          artifactType: 'semantic_model',
          confidence: checked.proposal.mappings.reduce((sum, mapping) => sum + mapping.confidence, 0) / checked.proposal.mappings.length,
          rationale: checked.proposal.summary,
          proposal: checked.proposal,
          warnings: checked.issues.map(issue => issue.message),
          requiresReview: true,
        },
        validation,
      })
      await markAiWorkflowAwaitingReview({
        supabase: auth.supabase,
        runId: run.id,
        tenantId,
        projectId,
        outputSummary: {
          proposalId: savedProposal.id,
          mappingCount: checked.proposal.mappings.length,
          relationshipCount: checked.proposal.relationships.length,
        },
        validation,
        usage: usageRecord(result.usage),
        latencyMs: Date.now() - startedAt,
      })

      return NextResponse.json({
        proposalId: savedProposal.id,
        proposal: checked.proposal,
        validation,
        source: 'ai',
        provider: ai.providerId,
        model: ai.modelId,
      })
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : 'Semantic AI generation failed'
      if (run) {
        await failAiWorkflowRun({
          supabase: auth.supabase,
          runId: run.id,
          tenantId,
          projectId,
          errorCode: 'semantic_generation_failed',
          errorMessage: message,
          latencyMs: Date.now() - startedAt,
        }).catch(() => undefined)
      }
      const checked = validateSemanticCopilotProposal({ proposal: deterministic, selectedColumns: columns })
      return NextResponse.json({
        proposalId: null,
        proposal: checked.proposal,
        validation: { state: checked.state, issues: checked.issues },
        source: 'deterministic',
        warning: `AI provider unavailable; returned a schema-grounded deterministic proposal. ${message}`.slice(0, 500),
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ proposal: null, error: message }, { status: 500 })
  }
}
