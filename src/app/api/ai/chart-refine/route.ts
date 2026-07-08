import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'

import {
  ChartAiPatch,
  ChartAiPatchSchema,
  buildGovernedAiChartContext,
  doesPromptReferenceBlockedAiDescriptors,
  serializeGovernedAiChartContext,
  validateChartAiPatchAgainstAllowlist,
} from '@/lib/ai/chart-ai-contract'
import { requireAiProjectAccess } from '@/lib/security/ai-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { getAuthedSupabase } from '@/lib/supabase/server'

const ChartRefineBodySchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  chartId: z.string().uuid(),
  instruction: z.string().min(3).max(1_200),
  includePreview: z.boolean().default(false),
  apply: z.boolean().default(false),
  patch: ChartAiPatchSchema.optional(),
}).strict()

function parseJsonObject(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return JSON.parse(fenced?.[1] ?? trimmed)
}

async function auditChartRefine({
  auth,
  tenantId,
  projectId,
  chartId,
  action,
  metadata,
}: {
  auth: NonNullable<Awaited<ReturnType<typeof getAuthedSupabase>>>
  tenantId: string
  projectId: string
  chartId: string
  action: string
  metadata: Record<string, unknown>
}) {
  await auth.supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    project_id: projectId,
    actor_user_id: auth.userId,
    action,
    target_type: 'dashboard_chart_config',
    target_id: chartId,
    metadata,
    created_at: new Date().toISOString(),
  })
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ patch: null, chart: null, validation: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = ChartRefineBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ patch: null, chart: null, validation: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireAiProjectAccess({ auth, scope: parsed.data })
    if (!access.ok) {
      return NextResponse.json({ patch: null, chart: null, validation: null, error: access.error }, { status: access.status })
    }

    const rateLimit = await checkRuntimeRateLimit({
      key: `ai-chart-refine:${access.tenantId}:${access.projectId}:${auth.userId}`,
      maxRequests: 15,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { patch: null, chart: null, validation: null, error: 'Too many AI chart refinement requests. Please retry shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    const context = await buildGovernedAiChartContext({
      supabase: auth.supabase,
      tenantId: access.tenantId,
      projectId: access.projectId,
      chartId: parsed.data.chartId,
      actorUserId: auth.userId,
      purpose: 'chart_refinement',
      includePreview: parsed.data.includePreview,
    })
    if (!context.chart) {
      return NextResponse.json({ patch: null, chart: null, validation: null, error: 'Chart not found' }, { status: 404 })
    }

    await auditChartRefine({
      auth,
      tenantId: access.tenantId,
      projectId: access.projectId,
      chartId: parsed.data.chartId,
      action: 'ai.chart_refine.prompt_submitted',
      metadata: { apply: parsed.data.apply, patchProvided: Boolean(parsed.data.patch), includePreview: parsed.data.includePreview },
    })

    if (!parsed.data.patch && doesPromptReferenceBlockedAiDescriptors({
      instruction: parsed.data.instruction,
      blockedFields: context.blockedFields,
      blockedMetrics: context.blockedMetrics,
    })) {
      await auditChartRefine({
        auth,
        tenantId: access.tenantId,
        projectId: access.projectId,
        chartId: parsed.data.chartId,
        action: 'ai.chart_refine.rejected',
        metadata: { reason: 'blocked_field_prompt_reference' },
      })
      return NextResponse.json({
        patch: null,
        chart: context.chart,
        validation: null,
        errorCode: 'restricted_field_request',
        error: 'That request mentions a field that is not available to AI because it is classified as sensitive or restricted.',
      }, { status: 422 })
    }

    const publicContext = serializeGovernedAiChartContext(context)
    let patch: ChartAiPatch

    if (parsed.data.patch) {
      patch = parsed.data.patch
    } else {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        return NextResponse.json({ patch: null, chart: null, validation: null, error: 'OPENAI_API_KEY is not configured' }, { status: 503 })
      }

      const prompt = `You refine DashboardOS chart configs. Return ONLY JSON matching the chartPatch shape.

Privacy rules:
- Use only allowedFields and allowedMetrics from the governed context.
- Never invent SQL, source table names, source column names, code, credentials, or raw records.
- Blocked fields are not exposed. If the request cannot be done with allowed fields, return an empty JSON object.
- Prefer small, valid changes.

chartPatch shape:
{
  "name": "optional title",
  "description": "optional short description or null",
  "templateId": "optional chart template id",
  "encoding": {
    "xAxisFieldId": "optional allowed field uuid",
    "yMetricIds": ["optional allowed metric uuids"],
    "seriesFieldId": "optional allowed field uuid or null",
    "stackMetricIds": ["optional allowed metric uuids"],
    "tooltipFieldIds": ["optional allowed field uuids"],
    "sort": { "byId": "allowed field or metric uuid", "direction": "asc|desc" },
    "limit": 1,
    "filters": [
      { "fieldId": "allowed field uuid", "operator": "eq|not_eq|in|contains|gte|lte", "value": "literal value only" }
    ]
  },
  "presentation": {
    "size": "compact|standard|wide|full",
    "showLegend": true,
    "showLabels": false,
    "valueFormat": "optional"
  }
}

User instruction:
${parsed.data.instruction}

Governed context:
${JSON.stringify(publicContext, null, 2)}`

      const openai = new OpenAI({ apiKey })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 900,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      })

      const raw = completion.choices[0]?.message?.content ?? '{}'
      const patchParse = ChartAiPatchSchema.safeParse(parseJsonObject(raw))
      if (!patchParse.success) {
        await auditChartRefine({
          auth,
          tenantId: access.tenantId,
          projectId: access.projectId,
          chartId: parsed.data.chartId,
          action: 'ai.chart_refine.validation_failed',
          metadata: { reason: 'patch_schema_invalid', issues: patchParse.error.flatten() },
        })
        return NextResponse.json({ patch: null, chart: context.chart, validation: null, errorCode: 'invalid_model_patch', error: 'AI patch failed schema validation' }, { status: 422 })
      }
      patch = patchParse.data
    }

    const allowed = validateChartAiPatchAgainstAllowlist({
      currentChart: context.chart,
      patch,
      allowedFieldIds: context.allowedFieldIds,
      allowedMetricIds: context.allowedMetricIds,
      fields: context.fields,
      metrics: context.metrics,
    })

    if (!allowed.ok) {
      await auditChartRefine({
        auth,
        tenantId: access.tenantId,
        projectId: access.projectId,
        chartId: parsed.data.chartId,
        action: 'ai.chart_refine.rejected',
        metadata: { reason: allowed.error, blockedIds: allowed.blockedIds, validation: 'validation' in allowed ? allowed.validation : null },
      })
      return NextResponse.json({
        patch,
        chart: context.chart,
        validation: 'validation' in allowed ? allowed.validation : null,
        errorCode: allowed.blockedIds.length > 0 ? 'restricted_field_request' : 'chart_validation_failed',
        error: allowed.error,
      }, { status: 422 })
    }

    if (!parsed.data.apply) {
      await auditChartRefine({
        auth,
        tenantId: access.tenantId,
        projectId: access.projectId,
        chartId: parsed.data.chartId,
        action: 'ai.chart_refine.patch_proposed',
        metadata: { validationState: allowed.validation.state, patch },
      })
      return NextResponse.json({ patch, chart: allowed.nextChart, validation: allowed.validation })
    }

    const nowIso = new Date().toISOString()
    const { data: chartRow, error: updateError } = await auth.supabase
      .from('dashboard_chart_configs')
      .update({
        name: allowed.nextChart.name,
        description: allowed.nextChart.description ?? null,
        template_id: allowed.nextChart.templateId,
        encoding: allowed.nextChart.encoding,
        presentation: allowed.nextChart.presentation,
        validation_state: allowed.validation.state,
        last_validated_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', context.chart.id)
      .eq('tenant_id', access.tenantId)
      .eq('project_id', access.projectId)
      .select('*')
      .single()

    if (updateError) {
      return NextResponse.json({ patch, chart: context.chart, validation: allowed.validation, error: updateError.message }, { status: 400 })
    }

    await Promise.all([
      auth.supabase.from('dashboard_chart_validation_results').insert({
        chart_id: context.chart.id,
        tenant_id: access.tenantId,
        project_id: access.projectId,
        state: allowed.validation.state,
        issues: allowed.validation.issues,
        checked_by: auth.userId,
        checked_at: nowIso,
      }),
      auditChartRefine({
        auth,
        tenantId: access.tenantId,
        projectId: access.projectId,
        chartId: context.chart.id,
        action: 'ai.chart_refine.patch_accepted',
        metadata: { instruction: parsed.data.instruction, validationState: allowed.validation.state },
      }),
    ])

    return NextResponse.json({ patch, chart: chartRow, validation: allowed.validation })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart refinement failed'
    console.error('[AI Chart Refine]', message)
    return NextResponse.json({ patch: null, chart: null, validation: null, error: message }, { status: 500 })
  }
}
