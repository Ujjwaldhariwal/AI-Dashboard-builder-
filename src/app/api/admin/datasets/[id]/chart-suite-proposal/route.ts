import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'

import { buildDeterministicChartSuiteProposal, ChartSuiteCopilotProposalSchema } from '@/lib/ai/chart-suite-copilot'
import { AI_WORKFLOW_CONTRACT_VERSION, AiWorkflowRequestSchema } from '@/lib/ai/workflow-contracts'
import { getAiWorkflowModel } from '@/lib/ai/workflow-provider'
import { classifyAiWorkflowFallback } from '@/lib/ai/workflow-fallback'
import { createAiWorkflowProposal, failAiWorkflowRun, markAiWorkflowAwaitingReview, startAiWorkflowRun } from '@/lib/ai/workflow-runs'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { analyzeDatasetChartOptions } from '@/lib/semantic/dataset-shape-analyzer'
import { getAuthedSupabase } from '@/lib/supabase/server'

const RequestSchema = z.object({ instruction: z.string().trim().min(3).max(4_000) }).strict()
const PROMPT_VERSION = 'chart-suite-copilot.v1'

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

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

    const { data: dataset, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('id, tenant_id, project_id, model_id, name, status, selection')
      .eq('id', id)
      .single()
    if (datasetError || !dataset) return NextResponse.json({ proposal: null, error: datasetError?.message ?? 'Dataset not found' }, { status: 404 })
    if (dataset.status !== 'published') return NextResponse.json({ proposal: null, error: 'Publish the governed dataset before composing chart drafts' }, { status: 409 })
    const tenantId = String(dataset.tenant_id)
    const projectId = String(dataset.project_id)
    const access = await requireProjectAccess({ ...accessContext(auth), tenantId, projectId, editor: true })
    if (!access.ok) return NextResponse.json({ proposal: null, error: access.error }, { status: access.status })

    const { data: model, error: modelError } = await auth.supabase
      .from('business_models')
      .select('id, status')
      .eq('id', String(dataset.model_id))
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .single()
    if (modelError || !model) return NextResponse.json({ proposal: null, error: modelError?.message ?? 'Semantic model not found' }, { status: 404 })
    if (model.status !== 'approved') return NextResponse.json({ proposal: null, error: 'The dataset semantic model is not approved' }, { status: 409 })

    const selection = dataset.selection && typeof dataset.selection === 'object' ? dataset.selection as Record<string, unknown> : {}
    const fieldIds = strings(selection.fieldIds)
    const metricIds = strings(selection.metricIds)
    const [fieldResult, metricResult] = await Promise.all([
      fieldIds.length ? auth.supabase.from('business_fields').select('*').in('id', fieldIds) : Promise.resolve({ data: [], error: null }),
      metricIds.length ? auth.supabase.from('business_metrics').select('*').in('id', metricIds) : Promise.resolve({ data: [], error: null }),
    ])
    const assetError = fieldResult.error ?? metricResult.error
    if (assetError) return NextResponse.json({ proposal: null, error: assetError.message }, { status: 500 })
    const rawFields = (fieldResult.data ?? []) as Record<string, unknown>[]
    const rawMetrics = (metricResult.data ?? []) as Record<string, unknown>[]
    const fields = rawFields.map(field => ({ id: String(field.id), name: String(field.name), role: String(field.role) }))
    const metrics = rawMetrics.map(metric => ({ id: String(metric.id), name: String(metric.name), aggregation: String(metric.aggregation) }))
    const chartOptions = analyzeDatasetChartOptions({ fields: rawFields, metrics: rawMetrics })
    const allowedTemplateIds = chartOptions.compatibility
      .filter(option => option.status !== 'blocked')
      .map(option => option.template.id)
    const deterministic = buildDeterministicChartSuiteProposal({ instruction: parsed.data.instruction, datasetName: String(dataset.name), fields, metrics, allowedTemplateIds })

    const validate = (candidate: typeof deterministic) => {
      const issues: Array<{ severity: 'error' | 'warning'; code: string; message: string; path?: string[] }> = []
      const names = new Set<string>()
      const charts = candidate.charts.filter((chart, index) => {
        const validation = validateDashboardChartConfig({ templateId: chart.templateId, encoding: chart.encoding, fields: rawFields, metrics: rawMetrics })
        for (const issue of validation.issues) issues.push({ ...issue, path: ['charts', String(index)] })
        const key = chart.name.toLowerCase()
        if (names.has(key)) {
          issues.push({ severity: 'warning', code: 'duplicate_chart_name', message: `Renamed duplicate chart ${chart.name}.`, path: ['charts', String(index), 'name'] })
          chart.name = `${chart.name} ${index + 1}`.slice(0, 120)
        }
        names.add(chart.name.toLowerCase())
        return validation.state !== 'invalid'
      })
      if (charts.length === 0) throw new Error('No valid chart drafts remained after compatibility validation.')
      return { proposal: ChartSuiteCopilotProposalSchema.parse({ ...candidate, charts }), issues, state: issues.length ? 'warning' as const : 'valid' as const }
    }

    try {
      const ai = getAiWorkflowModel({ workflowType: 'dashboard_composition' })
      const workflowRequest = AiWorkflowRequestSchema.parse({
        contractVersion: AI_WORKFLOW_CONTRACT_VERSION,
        tenantId,
        projectId,
        workflowType: 'dashboard_composition',
        instruction: parsed.data.instruction,
        context: { datasetId: id, semanticModelId: String(dataset.model_id), allowedTemplateIds },
      })
      run = await startAiWorkflowRun({ supabase: auth.supabase, request: workflowRequest, actorUserId: auth.userId, providerId: ai.providerId, modelId: ai.modelId, promptVersion: PROMPT_VERSION })
      const result = await generateObject({
        model: ai.model,
        schema: ChartSuiteCopilotProposalSchema,
        system: `You are DashboardOS Chart Suite Copilot. Turn exact dashboard requirements into editable chart drafts. Use only supplied field, metric, and compatible template IDs. Honor requested chart counts and types when compatible. Every chart needs at least one metric. Never invent IDs, SQL, filters, or executable expressions.`,
        prompt: `REQUIREMENT\n${parsed.data.instruction}\n\nDATASET\n${String(dataset.name)}\n\nFIELDS\n${JSON.stringify(fields)}\n\nMETRICS\n${JSON.stringify(metrics)}\n\nCOMPATIBLE TEMPLATES\n${JSON.stringify(allowedTemplateIds)}`,
      })
      const checked = validate(result.object)
      const validation = { state: checked.state, issues: checked.issues }
      const confidence = checked.proposal.charts.reduce((sum, chart) => sum + chart.confidence, 0) / checked.proposal.charts.length
      const saved = await createAiWorkflowProposal({
        supabase: auth.supabase,
        runId: run.id,
        tenantId,
        projectId,
        envelope: { contractVersion: AI_WORKFLOW_CONTRACT_VERSION, workflowType: 'dashboard_composition', artifactType: 'dashboard', confidence, rationale: checked.proposal.summary, proposal: checked.proposal, warnings: [...checked.proposal.warnings, ...checked.issues.map(issue => issue.message)], requiresReview: true },
        validation,
      })
      await markAiWorkflowAwaitingReview({ supabase: auth.supabase, runId: run.id, tenantId, projectId, outputSummary: { proposalId: saved.id, chartCount: checked.proposal.charts.length }, validation, usage: usageRecord(result.usage), latencyMs: Date.now() - startedAt })
      return NextResponse.json({ proposalId: saved.id, proposal: checked.proposal, validation, source: 'ai' })
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : 'Chart suite AI generation failed'
      const fallback = classifyAiWorkflowFallback(aiError)
      if (run) await failAiWorkflowRun({ supabase: auth.supabase, runId: run.id, tenantId, projectId, errorCode: 'chart_suite_generation_failed', errorMessage: message, latencyMs: Date.now() - startedAt }).catch(() => undefined)
      const checked = validate(deterministic)
      return NextResponse.json({
        proposalId: null,
        proposal: checked.proposal,
        validation: { state: checked.state, issues: checked.issues },
        source: 'deterministic',
        warning: message.slice(0, 500),
        fallback,
      })
    }
  } catch (error) {
    return NextResponse.json({ proposal: null, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
