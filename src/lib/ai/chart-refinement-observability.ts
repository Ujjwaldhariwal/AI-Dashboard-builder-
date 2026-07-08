import type { SupabaseClient } from '@supabase/supabase-js'

export type AiChartRefinementEventType =
  | 'prompt_submitted'
  | 'proposal_success'
  | 'proposal_rejected'
  | 'patch_validation_failure'
  | 'apply_success'
  | 'blocked_sensitive_request'
  | 'preview_render_available'
  | 'preview_render_unavailable'
  | 'model_parse_failure'

export type AiChartRefinementPromptType =
  | 'rename'
  | 'chart_type'
  | 'grouping'
  | 'metric_compare'
  | 'sort_limit'
  | 'filter'
  | 'unsupported'
  | 'general'

const PROMPT_CLASSIFIERS: Array<[AiChartRefinementPromptType, RegExp]> = [
  ['rename', /\b(rename|title|call it)\b/i],
  ['chart_type', /\b(line|bar|pie|donut|gauge|chart type|make this a)\b/i],
  ['grouping', /\b(group|segment|split|by city|by region|by status)\b/i],
  ['metric_compare', /\b(compare|versus| vs |metric|measure)\b/i],
  ['sort_limit', /\b(sort|top|limit|highest|lowest)\b/i],
  ['filter', /\b(filter|only|where|last \d+|latest)\b/i],
  ['unsupported', /\b(sql|query|code|component|javascript|react)\b/i],
]

export function classifyAiChartRefinementPrompt(instruction: string): AiChartRefinementPromptType {
  const match = PROMPT_CLASSIFIERS.find(([, pattern]) => pattern.test(instruction))
  return match?.[0] ?? 'general'
}

export function buildAiChartRefinementEventMetadata({
  eventType,
  instruction,
  errorCode,
  validationState,
  schemaVersion,
  previewAvailable,
  patchProvided,
  includePreview,
  gateSource,
}: {
  eventType: AiChartRefinementEventType
  instruction?: string
  errorCode?: string | null
  validationState?: string | null
  schemaVersion?: string | null
  previewAvailable?: boolean | null
  patchProvided?: boolean
  includePreview?: boolean
  gateSource?: string | null
}) {
  return {
    eventType,
    promptType: instruction ? classifyAiChartRefinementPrompt(instruction) : null,
    errorCode: errorCode ?? null,
    validationState: validationState ?? null,
    schemaVersion: schemaVersion ?? null,
    previewAvailable: previewAvailable ?? null,
    patchProvided: patchProvided ?? null,
    includePreview: includePreview ?? null,
    gateSource: gateSource ?? null,
  }
}

export async function logAiChartRefinementMetric({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  chartId,
  eventType,
  metadata,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  chartId: string
  eventType: AiChartRefinementEventType
  metadata: ReturnType<typeof buildAiChartRefinementEventMetadata>
}) {
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    project_id: projectId,
    actor_user_id: actorUserId,
    action: `ai.chart_refine.metric.${eventType}`,
    target_type: 'dashboard_chart_config',
    target_id: chartId,
    metadata,
    created_at: new Date().toISOString(),
  })
}
