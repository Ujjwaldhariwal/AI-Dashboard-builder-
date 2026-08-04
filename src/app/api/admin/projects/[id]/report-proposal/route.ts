import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'

import {
  buildDeterministicReportSpec,
  ReportSpecSchema,
  validateReportSpec,
  type ReportDatasetEvidence,
} from '@/lib/ai/report-composer'
import { AI_WORKFLOW_CONTRACT_VERSION, AiWorkflowRequestSchema } from '@/lib/ai/workflow-contracts'
import { classifyAiWorkflowFallback } from '@/lib/ai/workflow-fallback'
import { getAiWorkflowModel } from '@/lib/ai/workflow-provider'
import {
  createAiWorkflowProposal,
  failAiWorkflowRun,
  markAiWorkflowAwaitingReview,
  startAiWorkflowRun,
} from '@/lib/ai/workflow-runs'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { getAuthedSupabase } from '@/lib/supabase/server'

const PROMPT_VERSION = 'report-composer.v1'
const RequestSchema = z.object({
  instruction: z.string().trim().min(3).max(4_000),
  title: z.string().trim().min(2).max(160).optional(),
  organizationName: z.string().trim().min(1).max(160).optional(),
}).strict()

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string') as string[]
    : []
}

function usageRecord(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params
  const startedAt = Date.now()
  let run: Awaited<ReturnType<typeof startAiWorkflowRun>> | null = null

  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (Number.isFinite(contentLength) && contentLength > 32_000) {
      return NextResponse.json({ proposal: null, error: 'Request body is too large' }, { status: 413 })
    }
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ proposal: null, error: 'Unauthorized' }, { status: 401 })
    const rateLimit = await checkRuntimeRateLimit({
      key: `report-proposal:${projectId}:${auth.userId}`,
      maxRequests: 10,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { proposal: null, error: 'Too many report composition requests' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      )
    }
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ proposal: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: project, error: projectError } = await auth.supabase
      .from('dashboard_projects')
      .select('id, tenant_id, name')
      .eq('id', projectId)
      .single()
    if (projectError || !project) {
      return NextResponse.json(
        { proposal: null, error: projectError?.message ?? 'Project not found' },
        { status: 404 },
      )
    }
    const tenantId = String(project.tenant_id)
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId,
      projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ proposal: null, error: access.error }, { status: access.status })
    }

    const { data: datasetRows, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('id, model_id, name, description, selection')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(20)
    if (datasetError) {
      return NextResponse.json({ proposal: null, error: datasetError.message }, { status: 500 })
    }

    const rawDatasets = (datasetRows ?? []) as Record<string, unknown>[]
    const modelIds = [...new Set(rawDatasets.map(dataset => String(dataset.model_id)))]
    const { data: modelRows, error: modelError } = modelIds.length > 0
      ? await auth.supabase
          .from('business_models')
          .select('id, status')
          .in('id', modelIds)
          .eq('tenant_id', tenantId)
          .eq('project_id', projectId)
      : { data: [], error: null }
    if (modelError) {
      return NextResponse.json({ proposal: null, error: modelError.message }, { status: 500 })
    }
    const approvedModelIds = new Set(
      (modelRows ?? [])
        .filter(model => model.status === 'approved')
        .map(model => String(model.id)),
    )
    const governedRows = rawDatasets.filter(dataset => approvedModelIds.has(String(dataset.model_id)))
    if (governedRows.length === 0) {
      return NextResponse.json(
        { proposal: null, error: 'Publish a dataset backed by an approved semantic model before composing reports' },
        { status: 409 },
      )
    }

    const selections = governedRows.map(dataset => {
      const selection = dataset.selection && typeof dataset.selection === 'object'
        ? dataset.selection as Record<string, unknown>
        : {}
      return {
        dataset,
        fieldIds: strings(selection.fieldIds),
        metricIds: strings(selection.metricIds),
      }
    })
    const fieldIds = [...new Set(selections.flatMap(selection => selection.fieldIds))]
    const metricIds = [...new Set(selections.flatMap(selection => selection.metricIds))]
    const [fieldResult, metricResult] = await Promise.all([
      fieldIds.length > 0
        ? auth.supabase.from('business_fields').select('id, name, role').in('id', fieldIds)
        : Promise.resolve({ data: [], error: null }),
      metricIds.length > 0
        ? auth.supabase.from('business_metrics').select('id, name, aggregation').in('id', metricIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    const assetError = fieldResult.error ?? metricResult.error
    if (assetError) {
      return NextResponse.json({ proposal: null, error: assetError.message }, { status: 500 })
    }
    const fieldsById = new Map((fieldResult.data ?? []).map(field => [String(field.id), {
      id: String(field.id),
      name: String(field.name),
      role: String(field.role),
    }]))
    const metricsById = new Map((metricResult.data ?? []).map(metric => [String(metric.id), {
      id: String(metric.id),
      name: String(metric.name),
      aggregation: String(metric.aggregation),
    }]))
    const datasets: ReportDatasetEvidence[] = selections.map(({ dataset, fieldIds: selectedFields, metricIds: selectedMetrics }) => ({
      id: String(dataset.id),
      name: String(dataset.name),
      description: typeof dataset.description === 'string' ? dataset.description : null,
      fields: selectedFields.flatMap(fieldId => {
        const field = fieldsById.get(fieldId)
        return field ? [field] : []
      }),
      metrics: selectedMetrics.flatMap(metricId => {
        const metric = metricsById.get(metricId)
        return metric ? [metric] : []
      }),
    })).filter(dataset => dataset.fields.length + dataset.metrics.length > 0)
    if (datasets.length === 0) {
      return NextResponse.json(
        { proposal: null, error: 'Published datasets do not contain governed fields or metrics' },
        { status: 409 },
      )
    }

    const reportTitle = parsed.data.title ?? `${String(project.name)} report`
    const organizationName = parsed.data.organizationName ?? String(project.name)
    const deterministic = buildDeterministicReportSpec({
      instruction: parsed.data.instruction,
      title: reportTitle,
      organizationName,
      datasets,
    })

    try {
      const ai = getAiWorkflowModel({ workflowType: 'report_generation' })
      const workflowRequest = AiWorkflowRequestSchema.parse({
        contractVersion: AI_WORKFLOW_CONTRACT_VERSION,
        tenantId,
        projectId,
        workflowType: 'report_generation',
        instruction: parsed.data.instruction,
        context: {
          datasetIds: datasets.map(dataset => dataset.id),
          reportTitle,
          evidenceFactCount: 0,
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
      const result = await generateObject({
        model: ai.model,
        schema: ReportSpecSchema,
        system: `You are DashboardOS Report Composer. Produce an editable ReportSpec.v1 outline using only supplied governed dataset, field, and metric IDs.
Never invent IDs, SQL, raw data, metric values, or factual claims. The current evidence bundle has zero computed facts, so every narrative block must have an empty claims array. Prefer concise sections, useful chart/table combinations, and professional branding. The engineer reviews every proposal before application.`,
        prompt: `REPORT REQUIREMENT
${parsed.data.instruction}

TITLE
${reportTitle}

ORGANIZATION
${organizationName}

GOVERNED PUBLISHED DATASETS
${JSON.stringify(datasets)}`,
      })
      const checked = validateReportSpec({ spec: result.object, datasets, facts: [] })
      const validation = { state: checked.state, issues: checked.issues }
      const saved = await createAiWorkflowProposal({
        supabase: auth.supabase,
        runId: run.id,
        tenantId,
        projectId,
        envelope: {
          contractVersion: AI_WORKFLOW_CONTRACT_VERSION,
          workflowType: 'report_generation',
          artifactType: 'report',
          confidence: checked.proposal.confidence,
          rationale: checked.proposal.summary,
          proposal: checked.proposal,
          warnings: checked.proposal.warnings,
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
          proposalId: saved.id,
          pageCount: checked.proposal.pages.length,
          sectionCount: checked.proposal.sections.length,
          datasetCount: datasets.length,
        },
        validation,
        usage: usageRecord(result.usage),
        latencyMs: Date.now() - startedAt,
      })
      return NextResponse.json({
        proposalId: saved.id,
        proposal: checked.proposal,
        validation,
        source: 'ai',
      })
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : 'Report composition failed'
      if (run) {
        await failAiWorkflowRun({
          supabase: auth.supabase,
          runId: run.id,
          tenantId,
          projectId,
          errorCode: 'report_composition_failed',
          errorMessage: message,
          latencyMs: Date.now() - startedAt,
        }).catch(() => undefined)
      }
      return NextResponse.json({
        proposalId: null,
        proposal: deterministic,
        validation: { state: 'valid', issues: [] },
        source: 'deterministic',
        warning: message.slice(0, 500),
        fallback: classifyAiWorkflowFallback(aiError),
      })
    }
  } catch (error) {
    return NextResponse.json(
      { proposal: null, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
