import { z } from 'zod'

export const PLATFORM_ASSISTANT_INTENT_STORAGE_KEY = 'dashboardos:assistant-intent'

const PlatformAssistantActionObjectSchema = z.object({
  action: z.literal('navigate_workflow'),
  target: z.enum(['data_sources', 'semantic_model', 'datasets', 'charts', 'publishing', 'builder']),
  path: z.enum(['/admin/data-sources', '/admin/semantic-model', '/admin/datasets', '/admin/charts', '/admin/publishing', '/builder']),
  label: z.string().trim().min(2).max(80),
  reason: z.string().trim().min(2).max(300),
  instruction: z.string().trim().min(3).max(2_000).optional(),
}).strict()

function validateTargetPath(action: z.infer<typeof PlatformAssistantActionObjectSchema>, context: z.RefinementCtx) {
  const expectedPath = {
    data_sources: '/admin/data-sources',
    semantic_model: '/admin/semantic-model',
    datasets: '/admin/datasets',
    charts: '/admin/charts',
    publishing: '/admin/publishing',
    builder: '/builder',
  }[action.target]
  if (action.path !== expectedPath) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Assistant target and path do not match.', path: ['path'] })
}

export const PlatformAssistantActionSchema = PlatformAssistantActionObjectSchema.superRefine(validateTargetPath)

export type PlatformAssistantAction = z.infer<typeof PlatformAssistantActionSchema>

export const PlatformAssistantIntentSchema = PlatformAssistantActionObjectSchema.extend({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  createdAt: z.string().datetime(),
}).superRefine(validateTargetPath)

export type PlatformAssistantIntent = z.infer<typeof PlatformAssistantIntentSchema>

export function readPlatformAssistantIntent(target: PlatformAssistantAction['target']) {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(PLATFORM_ASSISTANT_INTENT_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = PlatformAssistantIntentSchema.safeParse(JSON.parse(raw))
    if (!parsed.success || parsed.data.target !== target) return null
    window.sessionStorage.removeItem(PLATFORM_ASSISTANT_INTENT_STORAGE_KEY)
    return parsed.data
  } catch {
    window.sessionStorage.removeItem(PLATFORM_ASSISTANT_INTENT_STORAGE_KEY)
    return null
  }
}
