import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

import { getGoogleModel } from '@/lib/ai/google-model'
import type { AiWorkflowType } from '@/lib/ai/workflow-contracts'

export const AI_PROVIDER_IDS = ['google', 'openai', 'openai_compatible'] as const
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number]

type EnvLike = Record<string, string | undefined>

const WORKFLOW_ENV_KEYS: Record<AiWorkflowType, string> = {
  semantic_mapping: 'SEMANTIC',
  dataset_planning: 'DATASET',
  dashboard_composition: 'DASHBOARD',
  report_generation: 'REPORT',
  chart_refinement: 'CHART',
  data_transform: 'TRANSFORM',
}

const DEFAULT_MODEL_BY_PROVIDER: Partial<Record<AiProviderId, string>> = {
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
}

export interface AiWorkflowModelSelection {
  providerId: AiProviderId
  modelId: string
  source: 'workflow_override' | 'global_override' | 'default'
  compatibleBaseUrl: string | null
  compatibleProviderName: string | null
  supportsStructuredOutputs: boolean
}

export interface AiWorkflowModel extends AiWorkflowModelSelection {
  model: LanguageModel
}

function trimmed(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function parseProvider(value: string | null): AiProviderId {
  const normalized = value?.toLowerCase().replace(/-/g, '_') ?? 'google'
  if (AI_PROVIDER_IDS.includes(normalized as AiProviderId)) return normalized as AiProviderId
  throw new Error(`Unsupported AI provider "${value}". Expected one of: ${AI_PROVIDER_IDS.join(', ')}.`)
}

function envFlag(value: string | undefined, defaultValue: boolean) {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return defaultValue
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return defaultValue
}

export function resolveAiWorkflowModelSelection({
  workflowType,
  env = process.env,
}: {
  workflowType: AiWorkflowType
  env?: EnvLike
}): AiWorkflowModelSelection {
  const workflowKey = WORKFLOW_ENV_KEYS[workflowType]
  const workflowProvider = trimmed(env[`AI_${workflowKey}_PROVIDER`])
  const globalProvider = trimmed(env.AI_PROVIDER)
  const providerId = parseProvider(workflowProvider ?? globalProvider)
  const source = workflowProvider
    ? 'workflow_override' as const
    : globalProvider
      ? 'global_override' as const
      : 'default' as const

  const compatibleBaseUrl = providerId === 'openai_compatible'
    ? trimmed(env.AI_COMPATIBLE_BASE_URL)
    : null
  const compatibleProviderName = providerId === 'openai_compatible'
    ? trimmed(env.AI_COMPATIBLE_PROVIDER_NAME) ?? 'dashboardos-compatible'
    : null
  const modelId = trimmed(env[`AI_${workflowKey}_MODEL`])
    ?? trimmed(env.AI_MODEL)
    ?? (providerId === 'openai_compatible' ? trimmed(env.AI_COMPATIBLE_MODEL) : null)
    ?? DEFAULT_MODEL_BY_PROVIDER[providerId]

  if (!modelId) {
    throw new Error(`No model configured for AI provider "${providerId}".`)
  }
  if (providerId === 'openai_compatible' && !compatibleBaseUrl) {
    throw new Error('AI_COMPATIBLE_BASE_URL is required for the openai_compatible provider.')
  }

  return {
    providerId,
    modelId,
    source,
    compatibleBaseUrl,
    compatibleProviderName,
    supportsStructuredOutputs: providerId === 'openai_compatible'
      ? envFlag(env.AI_COMPATIBLE_STRUCTURED_OUTPUTS, true)
      : true,
  }
}

export function getAiWorkflowModel({
  workflowType,
  env = process.env,
}: {
  workflowType: AiWorkflowType
  env?: EnvLike
}): AiWorkflowModel {
  const selection = resolveAiWorkflowModelSelection({ workflowType, env })

  if (selection.providerId === 'google') {
    return { ...selection, model: getGoogleModel(selection.modelId) }
  }

  if (selection.providerId === 'openai') {
    const apiKey = trimmed(env.OPENAI_API_KEY)
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for the OpenAI AI provider.')
    const openai = createOpenAI({ apiKey })
    return { ...selection, model: openai(selection.modelId) }
  }

  const apiKey = trimmed(env.AI_COMPATIBLE_API_KEY)
  const compatible = createOpenAICompatible({
    name: selection.compatibleProviderName ?? 'dashboardos-compatible',
    baseURL: selection.compatibleBaseUrl ?? '',
    ...(apiKey ? { apiKey } : {}),
    supportsStructuredOutputs: selection.supportsStructuredOutputs,
  })
  return { ...selection, model: compatible(selection.modelId) }
}
