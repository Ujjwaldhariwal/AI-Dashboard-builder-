import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'

import {
  AI_CHART_PATCH_SCHEMA_VERSION,
  ChartAiPatch,
  ChartAiPresentationPatchSchema,
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
import {
  createDurableChartRefinementProposal,
  finalizeChartRefinementProposalAtomic,
  loadDurableChartRefinementProposal,
} from '@/lib/ai/chart-refinement-proposals'
import { getAiWorkflowModel } from '@/lib/ai/workflow-provider'
import {
  resolveDeterministicChartIntent,
  selectRelevantChartRefinementExamples,
} from '@/lib/ai/chart-refinement-intent'
import { requireAiProjectAccess } from '@/lib/security/ai-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type {
  DashboardChartConfig,
  DashboardChartValidationResult,
} from '@/types/dashboard-chart'

export const ChartRefineBodySchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  chartId: z.string().uuid(),
  instruction: z.string().min(3).max(1_200),
  includePreview: z.boolean().default(false),
  apply: z.boolean().default(false),
  patch: z.unknown().optional(),
  proposalId: z.string().uuid().optional(),
  mode: z.enum(['general', 'presentation_only']).default('general'),
  baseUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
  if (value.apply && !value.proposalId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proposalId'],
      message: 'Applying a refinement requires its durable proposal.',
    })
  }
  if (value.apply && !value.baseUpdatedAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseUpdatedAt'],
      message: 'Applying a refinement requires its source chart revision.',
    })
  }
})

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

export function staleChartRevisionResponse({
  patch,
  chart,
  validation,
}: {
  patch: ChartAiPatch
  chart: DashboardChartConfig
  validation: DashboardChartValidationResult
}) {
  return NextResponse.json({
    patch,
    chart,
    validation,
    proposalStatus: 'rejected',
    errorCode: 'stale_chart_revision',
    error: 'This chart changed after the proposal was generated. Review the latest chart and generate a new proposal.',
  }, { status: 409 })
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

    let durableProposal: Awaited<ReturnType<typeof loadDurableChartRefinementProposal>> | null = null
    let reviewedPatch: unknown = parsed.data.patch
    let reviewedBaseUpdatedAt = parsed.data.baseUpdatedAt
    if (parsed.data.apply) {
      durableProposal = await loadDurableChartRefinementProposal({
        supabase: auth.supabase,
        proposalId: parsed.data.proposalId!,
        tenantId: access.tenantId,
        projectId: access.projectId,
      })
      if (!durableProposal.ok) {
        return NextResponse.json({
          patch: null,
          chart: context.chart,
          validation: null,
          errorCode: durableProposal.errorCode,
          error: durableProposal.error,
        }, { status: 409 })
      }
      if (
        durableProposal.stored.chartId !== context.chart.id
        || durableProposal.stored.mode !== parsed.data.mode
        || durableProposal.stored.baseUpdatedAt !== parsed.data.baseUpdatedAt
      ) {
        return NextResponse.json({
          patch: null,
          chart: context.chart,
          validation: null,
          errorCode: 'invalid_chart_proposal',
          error: 'The durable proposal does not match this chart, mode, or source revision.',
        }, { status: 409 })
      }
      reviewedPatch = durableProposal.stored.patch
      reviewedBaseUpdatedAt = durableProposal.stored.baseUpdatedAt
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
        patchProvided: Boolean(reviewedPatch),
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
        patchProvided: Boolean(reviewedPatch),
        includePreview: parsed.data.includePreview,
        gateSource: gate.source,
      }),
    })

    if (!reviewedPatch && doesPromptReferenceBlockedAiDescriptors({
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
    let resolution: 'reviewed' | 'deterministic' | 'model' = reviewedPatch ? 'reviewed' : 'model'

    if (reviewedPatch) {
      const providedPatch = parseChartAiPatchPayload(reviewedPatch, parsed.data.mode)
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
      if (durableProposal?.ok) resolution = durableProposal.stored.resolution
    } else {
      const deterministicIntent = parsed.data.mode === 'presentation_only'
        ? null
        : resolveDeterministicChartIntent({
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
- Axis field and metric changes must use semantic UUIDs from the governed context.
${parsed.data.mode === 'presentation_only'
    ? '- Presentation-only mode is active. Return only schemaVersion and presentation; do not change title, description, template, encoding, filters, sorting, or metrics.'
    : ''}`

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
      "labelRotation": 0,
      "labelFormat": "auto|date-only"
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
        const patchSchema = parsed.data.mode === 'presentation_only'
          ? ChartAiPresentationPatchSchema
          : ChartAiPatchSchema
        const result = await generateObject({
          model: ai.model,
          schema: patchSchema,
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
      const patchParse = parseChartAiPatchPayload(parsedJson, parsed.data.mode)
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
      const storedProposal = await createDurableChartRefinementProposal({
        supabase: auth.supabase,
        tenantId: access.tenantId,
        projectId: access.projectId,
        actorUserId: auth.userId,
        chartId: context.chart.id,
        datasetId: context.dataset.id,
        instruction: parsed.data.instruction,
        mode: parsed.data.mode,
        patch,
        baseUpdatedAt: context.chart.updatedAt,
        resolution: resolution === 'model' ? 'model' : 'deterministic',
        validation: allowed.validation,
        nextChart: allowed.nextChart,
      })
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
      return NextResponse.json({
        patch,
        chart: allowed.nextChart,
        validation: allowed.validation,
        resolution,
        baseUpdatedAt: context.chart.updatedAt,
        proposalId: storedProposal.proposalId,
        proposalStatus: storedProposal.proposalStatus,
      })
    }

    if (!durableProposal?.ok) {
      return NextResponse.json({
        patch: null,
        chart: context.chart,
        validation: null,
        errorCode: 'invalid_chart_proposal',
        error: 'A durable chart refinement proposal is required before apply.',
      }, { status: 409 })
    }
    const transaction = await finalizeChartRefinementProposalAtomic({
      supabase: auth.supabase,
      tenantId: access.tenantId,
      projectId: access.projectId,
      chartId: context.chart.id,
      proposalId: durableProposal.proposalId,
      baseUpdatedAt: reviewedBaseUpdatedAt,
      action: 'apply',
    })

    if (!transaction.ok && transaction.errorCode === 'stale_chart_revision') {
      const latestChart = transaction.chart
        ? mapDashboardChartConfig(transaction.chart)
        : context.chart
      return staleChartRevisionResponse({
        patch,
        chart: latestChart,
        validation: allowed.validation,
      })
    }

    if (!transaction.ok) {
      return NextResponse.json({
        patch,
        chart: context.chart,
        validation: allowed.validation,
        errorCode: transaction.errorCode ?? 'invalid_chart_proposal',
        proposalStatus: transaction.proposalStatus,
        error: transaction.error ?? 'This proposal was already applied, rejected, or is not claimable.',
      }, {
        status: transaction.errorCode === 'chart_not_found'
          ? 404
          : transaction.errorCode === 'chart_refinement_apply_failed'
            ? 500
            : 409,
      })
    }

    await logAiChartRefinementMetric({
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
    })

    return NextResponse.json({
      patch,
      chart: transaction.chart ? mapDashboardChartConfig(transaction.chart) : allowed.nextChart,
      validation: allowed.validation,
      resolution,
      proposalId: parsed.data.proposalId,
      proposalStatus: transaction.proposalStatus,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI chart refinement failed'
    console.error('[AI Chart Refine]', message)
    if (message === 'chart_refinement_rpc_unavailable') {
      return NextResponse.json({
        patch: null,
        chart: null,
        validation: null,
        errorCode: 'chart_refinement_migration_required',
        error: 'Chart refinement apply is unavailable until the transactional RPC migration is deployed.',
      }, { status: 503 })
    }
    return NextResponse.json({ patch: null, chart: null, validation: null, error: message }, { status: 500 })
  }
}
