export const AI_WORKFLOW_FOUNDATION_MIGRATION = '20260716090000_ai_workflow_foundation.sql'
export const AI_DATASET_PLANNING_MIGRATION = '20260722090000_dataset_planning_workflow.sql'

export type AiWorkflowFallbackReason =
  | 'setup_required'
  | 'provider_configuration'
  | 'provider_unavailable'
  | 'generation_failed'

export interface AiWorkflowFallback {
  reason: AiWorkflowFallbackReason
  message: string
  migrations: string[]
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).message === 'string') {
    return String((value as Record<string, unknown>).message)
  }
  return ''
}

export function classifyAiWorkflowFallback(value: unknown): AiWorkflowFallback {
  const message = errorMessage(value)
  if (/ai_workflow_(runs|proposals)|ai_workflow_runs_workflow_type_check|start_ai_workflow_run|create_ai_workflow_proposal/i.test(message)) {
    return {
      reason: 'setup_required',
      message: `AI workflow storage needs setup. Apply ${AI_WORKFLOW_FOUNDATION_MIGRATION}, then ${AI_DATASET_PLANNING_MIGRATION}, in the AI Builder Supabase.`,
      migrations: [AI_WORKFLOW_FOUNDATION_MIGRATION, AI_DATASET_PLANNING_MIGRATION],
    }
  }
  if (/api key|ai key|required for the .* provider|no model configured|unsupported ai provider|base_url|baseurl/i.test(message)) {
    return {
      reason: 'provider_configuration',
      message: 'The configured AI provider is incomplete. Check the server AI provider, model, and API key settings, then restart the app.',
      migrations: [],
    }
  }
  if (/\b429\b|quota|rate.?limit|fetch failed|network|timed? out|econn|service unavailable|provider unavailable/i.test(message)) {
    return {
      reason: 'provider_unavailable',
      message: 'The AI provider could not complete this request. A governed rules-based proposal was generated instead.',
      migrations: [],
    }
  }
  return {
    reason: 'generation_failed',
    message: 'The AI proposal did not pass generation or validation. A governed rules-based proposal was generated instead.',
    migrations: [],
  }
}
