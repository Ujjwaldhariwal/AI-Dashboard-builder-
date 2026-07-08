import type { SupabaseClient } from '@supabase/supabase-js'

export type AiChartRefinementEventType =
  | 'prompt_submitted'
  | 'proposal_success'
  | 'proposal_rejected'
  | 'patch_validation_failure'
  | 'unsupported_schema_version'
  | 'apply_success'
  | 'blocked_sensitive_request'
  | 'preview_render_available'
  | 'preview_render_unavailable'
  | 'model_parse_failure'
  | 'gated_off_access'

export type AiChartRefinementFailureCategory =
  | 'restricted_field_request'
  | 'unsupported_schema_version'
  | 'model_parse_failure'
  | 'validation_failure'
  | 'gated_off_access'
  | 'preview_unavailable'

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

export function classifyAiChartRefinementFailureCategory({
  eventType,
  errorCode,
}: {
  eventType: AiChartRefinementEventType
  errorCode?: string | null
}): AiChartRefinementFailureCategory | null {
  if (eventType === 'blocked_sensitive_request' || errorCode === 'restricted_field_request') return 'restricted_field_request'
  if (eventType === 'unsupported_schema_version' || errorCode === 'schema_version_mismatch') return 'unsupported_schema_version'
  if (eventType === 'model_parse_failure' || errorCode === 'model_parse_failure') return 'model_parse_failure'
  if (eventType === 'patch_validation_failure' || errorCode === 'chart_validation_failed' || errorCode === 'invalid_model_patch') return 'validation_failure'
  if (eventType === 'gated_off_access' || errorCode?.startsWith('gate_') || errorCode === 'feature_gated') return 'gated_off_access'
  if (eventType === 'preview_render_unavailable') return 'preview_unavailable'
  return null
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
    failureCategory: classifyAiChartRefinementFailureCategory({ eventType, errorCode }),
    validationState: validationState ?? null,
    schemaVersion: schemaVersion ?? null,
    previewAvailable: previewAvailable ?? null,
    patchProvided: patchProvided ?? null,
    includePreview: includePreview ?? null,
    gateSource: gateSource ?? null,
  }
}

export interface AiChartRefinementMetricRow {
  action?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
}

export interface AiChartRefinementSummary {
  promptsSubmitted: number
  proposalsSucceeded: number
  blockedSensitiveRequests: number
  validationFailures: number
  applySuccesses: number
  previewUnavailableCases: number
  unsupportedSchemaVersions: number
  modelParseFailures: number
  gatedOffAccess: number
  lastEventAt: string | null
}

const EMPTY_SUMMARY: AiChartRefinementSummary = {
  promptsSubmitted: 0,
  proposalsSucceeded: 0,
  blockedSensitiveRequests: 0,
  validationFailures: 0,
  applySuccesses: 0,
  previewUnavailableCases: 0,
  unsupportedSchemaVersions: 0,
  modelParseFailures: 0,
  gatedOffAccess: 0,
  lastEventAt: null,
}

function eventTypeFromMetricRow(row: AiChartRefinementMetricRow): AiChartRefinementEventType | null {
  const metadataEventType = row.metadata?.eventType
  if (typeof metadataEventType === 'string') return metadataEventType as AiChartRefinementEventType
  const action = row.action ?? ''
  const suffix = action.startsWith('ai.chart_refine.metric.')
    ? action.slice('ai.chart_refine.metric.'.length)
    : ''
  return suffix ? suffix as AiChartRefinementEventType : null
}

export function summarizeAiChartRefinementMetrics(rows: AiChartRefinementMetricRow[]): AiChartRefinementSummary {
  const summary = { ...EMPTY_SUMMARY }

  for (const row of rows) {
    const eventType = eventTypeFromMetricRow(row)
    const errorCode = typeof row.metadata?.errorCode === 'string' ? row.metadata.errorCode : null
    const category = eventType
      ? classifyAiChartRefinementFailureCategory({ eventType, errorCode })
      : null

    if (eventType === 'prompt_submitted') summary.promptsSubmitted += 1
    if (eventType === 'proposal_success') summary.proposalsSucceeded += 1
    if (eventType === 'apply_success') summary.applySuccesses += 1
    if (eventType === 'preview_render_unavailable') summary.previewUnavailableCases += 1
    if (eventType === 'model_parse_failure' || category === 'model_parse_failure') summary.modelParseFailures += 1
    if (eventType === 'unsupported_schema_version' || category === 'unsupported_schema_version') summary.unsupportedSchemaVersions += 1
    if (eventType === 'gated_off_access' || category === 'gated_off_access') summary.gatedOffAccess += 1
    if (eventType === 'blocked_sensitive_request' || category === 'restricted_field_request') summary.blockedSensitiveRequests += 1
    if (eventType === 'patch_validation_failure' || category === 'validation_failure') summary.validationFailures += 1

    if (row.created_at && (!summary.lastEventAt || row.created_at > summary.lastEventAt)) {
      summary.lastEventAt = row.created_at
    }
  }

  return summary
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
