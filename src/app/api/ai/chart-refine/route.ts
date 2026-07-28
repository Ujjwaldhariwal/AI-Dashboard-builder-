import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'

import {
  AI_CHART_PATCH_SCHEMA_VERSION,
  ChartAiPatch,
  ChartAiPatchSchema,
  buildDeterministicPresentationPatch,
  buildGovernedAiChartContext,
  doesPromptReferenceBlockedAiDescriptors,
  parseChartAiPatchPayload,
  mapDashboardChartConfig,
  serializeGovernedAiChartContext,
  validateChartAiPatchAgainstAllowlist,
} from '@/lib/ai/chart-ai-contract'
import { resolveAiChartRefinementGateWithDb } from '@/lib/ai/chart-refinement-gate'
import {
  buildAiChartRefinementEventMetadata,
  logAiChartRefinementMetric,
} from '@/lib/ai/chart-refinement-observability'
import { getAiWorkflowModel } from '@/lib/ai/workflow-provider'
import {
  resolveDeterministicChartIntent,
  selectRelevantChartRefinementExamples,
} from '@/lib/ai/chart-refinement-intent'
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
  patch: z.unknown().optional(),
}).strict()

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

    const gate = await resolveAiChartRefinementGateWithDb({
      supabase: auth.supabase,
      tenantId: access.tenantId,
      projectId: access.projectId,
      userId: auth.userId,
    })
    if (!gate.enabled) {
      await logAiChartRefinementMetric({
        supabase: auth.supabase,
        tenantId: access.tenantId,
        projectId: access.projectId,
        actorUserId: auth.userId,
        chartId: parsed.data.chartId,
        eventType: 'gated_off_access',
        metadata: buildAiChartRefinementEventMetadata({
          eventType: 'gated_off_access',
          errorCode: gate.reasonCode,
          patchProvided: Boolean(parsed.data.patch),
          includePreview: parsed.data.includePreview,
          gateSource: gate.source,
        }),
      })
      return NextResponse.json({
        patch: null,
        chart: null,
        validation: null,
        errorCode: 'feature_gated',
        reasonCode: gate.reasonCode,
        error: gate.reason,
      }, { status: 403 })
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
      metadata: buildAiChartRefinementEventMetadata({
        eventType: 'prompt_submitted',
        instruction: parsed.data.instruction,
        patchProvided: Boolean(parsed.data.patch),
        includePreview: parsed.data.includePreview,
        gateSource: gate.source,
      }),
    })
    await logAiChartRefinementMetric({
      supabase: auth.supabase,
      tenantId: access.tenantId,
      projectId: access.projectId,
      actorUserId: auth.userId,
      chartId: parsed.data.chartId,
      eventType: 'prompt_submitted',
      metadata: buildAiChartRefinementEventMetadata({
        eventType: 'prompt_submitted',
        instruction: parsed.data.instruction,
        patchProvided: Boolean(parsed.data.patch),
        includePreview: parsed.data.includePreview,
        gateSource: gate.source,
      }),
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
        metadata: buildAiChartRefinementEventMetadata({
          eventType: 'blocked_sensitive_request',
          instruction: parsed.data.instruction,
          errorCode: 'restricted_field_request',
          gateSource: gate.source,
        }),
      })
      await logAiChartRefinementMetric({
        supabase: auth.supabase,
        tenantId: access.tenantId,
        projectId: access.projectId,
        actorUserId: auth.userId,
        chartId: parsed.data.chartId,
        eventType: 'blocked_sensitive_request',
        metadata: buildAiChartRefinementEventMetadata({
          eventType: 'blocked_sensitive_request',
          instruction: parsed.data.instruction,
          errorCode: 'restricted_field_request',
          gateSource: gate.source,
        }),
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
    let resolution: 'reviewed' | 'deterministic' | 'model' = parsed.data.patch ? 'reviewed' : 'model'

    if (parsed.data.patch) {
      const providedPatch = parseChartAiPatchPayload(parsed.data.patch)
      if (!providedPatch.ok) {
        const eventType = providedPatch.errorCode === 'schema_version_mismatch'
          ? 'unsupported_schema_version'
          : 'patch_validation_failure'
        await auditChartRefine({
          auth,
          tenantId: access.tenantId,
          projectId: access.projectId,
          chartId: parsed.data.chartId,
          action: 'ai.chart_refine.validation_failed',
          metadata: buildAiChartRefinementEventMetadata({
            eventType,
            instruction: parsed.data.instruction,
            errorCode: providedPatch.errorCode,
            gateSource: gate.source,
          }),
        })
        await logAiChartRefinementMetric({
          supabase: auth.supabase,
          tenantId: access.tenantId,
          projectId: access.projectId,
          actorUserId: auth.userId,
          chartId: parsed.data.chartId,
          eventType,
          metadata: buildAiChartRefinementEventMetadata({
            eventType,
            instruction: parsed.data.instruction,
            errorCode: providedPatch.errorCode,
            gateSource: gate.source,
          }),
        })
        return NextResponse.json({
          patch: null,
          chart: context.chart,
          validation: null,
          errorCode: providedPatch.errorCode,
          error: providedPatch.error,
        }, { status: 422 })
      }
      patch = providedPatch.patch
    } else {
      const deterministicIntent = resolveDeterministicChartIntent({
        instruction: parsed.data.instruction,
        context: {
          chart: context.chart,
          allowedFields: context.allowedFields,
          allowedMetrics: context.allowedMetrics,
        },
      })
      const deterministicPatch = deterministicIntent?.patch ?? buildDeterministicPresentationPatch(parsed.data.instruction)
      if (deterministicPatch) {
        patch = deterministicPatch
        resolution = 'deterministic'
      } else {
      let ai: ReturnType<typeof getAiWorkflowModel>
      try {
        ai = getAiWorkflowModel({ workflowType: 'chart_refinement' })
      } catch (providerError) {
        console.error(
          '[AI Chart Refine Provider]',
          providerError instanceof Error ? providerError.message : 'AI provider configuration failed',
        )
        return NextResponse.json({
          patch: null,
          chart: context.chart,
          validation: null,
          error: 'AI chart refinement provider is not configured for this environment.',
        }, { status: 503 })
      }

      const system = `You refine DashboardOS chart configs. Return only a chart patch that matches the supplied schema.

Privacy and safety rules:
- Use only allowedFields and allowedMetrics from the governed context.
- Never invent SQL, source table names, source column names, code, credentials, or raw records.
- Blocked fields are not exposed. If the request cannot be done with allowed fields, return an empty JSON object.
- Prefer small, valid changes.
- Convert common color names to six-digit hex values.
- Keep typography, margins, line widths, and bar radii within the supplied schema bounds.
- Axis field and metric changes must use semantic UUIDs from the governed context.`

      const prompt = `chartPatch shape:
{
  "schemaVersion": "${AI_CHART_PATCH_SCHEMA_VERSION}",
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
    "colors": ["#EC4899"],
    "showLegend": true,
    "legendPosition": "top|right|bottom|left",
    "showLabels": false,
    "showGrid": true,
    "valueFormat": "currency|percent|null",
    "xAxis": {
      "show": true,
      "title": "optional title or null",
      "labelColor": "#475569 or null",
      "labelFontSize": 8,
      "labelFontWeight": "normal|medium|bold",
      "labelRotation": 0
    },
    "yAxis": {
      "show": true,
      "title": "optional title or null",
      "labelColor": "#475569 or null",
      "labelFontSize": 8,
      "labelFontWeight": "normal|medium|bold"
    },
    "labels": {
      "color": "#0F172A or null",
      "fontSize": 8,
      "fontWeight": "normal|medium|bold",
      "position": "auto|top|right|inside|outside"
    },
    "tooltip": {
      "enabled": true,
      "backgroundColor": "#FFFFFF or null",
      "borderColor": "#E2E8F0 or null",
      "textColor": "#0F172A or null"
    },
    "margins": { "top": 16, "right": 16, "bottom": 16, "left": 16 },
    "line": { "smooth": true, "width": 2.5 },
    "bar": { "radius": 8 }
  }
}

User instruction:
${parsed.data.instruction}

Relevant approved examples (adapt only using IDs from the governed context):
${JSON.stringify(selectRelevantChartRefinementExamples({
  instruction: parsed.data.instruction,
  context: {
    chart: context.chart,
    allowedFields: context.allowedFields,
    allowedMetrics: context.allowedMetrics,
  },
}), null, 2)}

Governed context:
${JSON.stringify(publicContext, null, 2)}`

      let parsedJson: unknown
      try {
        const result = await generateObject({
          model: ai.model,
          schema: ChartAiPatchSchema,
          system,
          prompt,
          maxOutputTokens: 900,
          temperature: 0.1,
        })
        parsedJson = result.object
      } catch {
        await auditChartRefine({
          auth,
          tenantId: access.tenantId,
          projectId: access.projectId,
          chartId: parsed.data.chartId,
          action: 'ai.chart_refine.validation_failed',
          metadata: buildAiChartRefinementEventMetadata({
            eventType: 'model_parse_failure',
            instruction: parsed.data.instruction,
            errorCode: 'model_parse_failure',
            gateSource: gate.source,
          }),
        })
        await logAiChartRefinementMetric({
          supabase: auth.supabase,
          tenantId: access.tenantId,
          projectId: access.projectId,
          actorUserId: auth.userId,
          chartId: parsed.data.chartId,
          eventType: 'model_parse_failure',
          metadata: buildAiChartRefinementEventMetadata({
            eventType: 'model_parse_failure',
            instruction: parsed.data.instruction,
            errorCode: 'model_parse_failure',
            gateSource: gate.source,
          }),
        })
        return NextResponse.json({ patch: null, chart: context.chart, validation: null, errorCode: 'model_parse_failure', error: 'AI response could not be parsed as a chart patch. The current chart was left unchanged.' }, { status: 422 })
      }
      const patchParse = parseChartAiPatchPayload(parsedJson)
      if (!patchParse.ok) {
        const eventType = patchParse.errorCode === 'schema_version_mismatch'
          ? 'unsupported_schema_version'
          : 'patch_validation_failure'
        await auditChartRefine({
          auth,
          tenantId: access.tenantId,
          projectId: access.projectId,
          chartId: parsed.data.chartId,
          action: 'ai.chart_refine.validation_failed',
          metadata: buildAiChartRefinementEventMetadata({
            eventType,
            instruction: parsed.data.instruction,
            errorCode: patchParse.errorCode,
            gateSource: gate.source,
          }),
        })
        await logAiChartRefinementMetric({
          supabase: auth.supabase,
          tenantId: access.tenantId,
          projectId: access.projectId,
          actorUserId: auth.userId,
          chartId: parsed.data.chartId,
          eventType,
          metadata: buildAiChartRefinementEventMetadata({
            eventType,
            instruction: parsed.data.instruction,
            errorCode: patchParse.errorCode,
            gateSource: gate.source,
          }),
        })
        return NextResponse.json({ patch: null, chart: context.chart, validation: null, errorCode: patchParse.errorCode, error: patchParse.error }, { status: 422 })
      }
      patch = patchParse.patch
      }
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
      const failedValidation = 'validation' in allowed && allowed.validation ? allowed.validation : null
      await auditChartRefine({
        auth,
        tenantId: access.tenantId,
        projectId: access.projectId,
        chartId: parsed.data.chartId,
        action: 'ai.chart_refine.rejected',
        metadata: buildAiChartRefinementEventMetadata({
          eventType: allowed.blockedIds.length > 0 ? 'blocked_sensitive_request' : 'patch_validation_failure',
          instruction: parsed.data.instruction,
          errorCode: allowed.blockedIds.length > 0 ? 'restricted_field_request' : 'chart_validation_failed',
          validationState: failedValidation?.state ?? null,
          schemaVersion: patch.schemaVersion,
          gateSource: gate.source,
        }),
      })
      await logAiChartRefinementMetric({
        supabase: auth.supabase,
        tenantId: access.tenantId,
        projectId: access.projectId,
        actorUserId: auth.userId,
        chartId: parsed.data.chartId,
        eventType: allowed.blockedIds.length > 0 ? 'blocked_sensitive_request' : 'patch_validation_failure',
        metadata: buildAiChartRefinementEventMetadata({
          eventType: allowed.blockedIds.length > 0 ? 'blocked_sensitive_request' : 'patch_validation_failure',
          instruction: parsed.data.instruction,
          errorCode: allowed.blockedIds.length > 0 ? 'restricted_field_request' : 'chart_validation_failed',
          validationState: failedValidation?.state ?? null,
          schemaVersion: patch.schemaVersion,
          gateSource: gate.source,
        }),
      })
      return NextResponse.json({
        patch,
        chart: context.chart,
        validation: failedValidation,
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
        metadata: buildAiChartRefinementEventMetadata({
          eventType: 'proposal_success',
          instruction: parsed.data.instruction,
          validationState: allowed.validation.state,
          schemaVersion: patch.schemaVersion,
          gateSource: gate.source,
          resolution,
        }),
      })
      await logAiChartRefinementMetric({
        supabase: auth.supabase,
        tenantId: access.tenantId,
        projectId: access.projectId,
        actorUserId: auth.userId,
        chartId: parsed.data.chartId,
        eventType: 'proposal_success',
        metadata: buildAiChartRefinementEventMetadata({
          eventType: 'proposal_success',
          instruction: parsed.data.instruction,
          validationState: allowed.validation.state,
          schemaVersion: patch.schemaVersion,
          gateSource: gate.source,
          resolution,
        }),
      })
      return NextResponse.json({ patch, chart: allowed.nextChart, validation: allowed.validation, resolution })
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
        metadata: buildAiChartRefinementEventMetadata({
          eventType: 'apply_success',
          instruction: parsed.data.instruction,
          validationState: allowed.validation.state,
          schemaVersion: patch.schemaVersion,
          gateSource: gate.source,
          resolution,
        }),
      }),
      logAiChartRefinementMetric({
        supabase: auth.supabase,
        tenantId: access.tenantId,
        projectId: access.projectId,
        actorUserId: auth.userId,
        chartId: context.chart.id,
        eventType: 'apply_success',
        metadata: buildAiChartRefinementEventMetadata({
          eventType: 'apply_success',
          instruction: parsed.data.instruction,
          validationState: allowed.validation.state,
          schemaVersion: patch.schemaVersion,
          gateSource: gate.source,
          resolution,
        }),
      }),
    ])

    return NextResponse.json({
      patch,
      chart: mapDashboardChartConfig(chartRow as Record<string, unknown>),
      validation: allowed.validation,
      resolution,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart refinement failed'
    console.error('[AI Chart Refine]', message)
    return NextResponse.json({ patch: null, chart: null, validation: null, error: message }, { status: 500 })
  }
}
