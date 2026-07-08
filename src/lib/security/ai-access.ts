import { requireTenantCapability } from '@/lib/security/entitlements'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import type { AuthedSupabaseContext } from '@/lib/supabase/server'

export interface AiScopeInput {
  tenantId?: string | null
  projectId?: string | null
}

export function resolveAiScope(input: AiScopeInput) {
  if (input.tenantId && input.projectId) {
    return { tenantId: input.tenantId, projectId: input.projectId }
  }

  return null
}

export async function requireAiProjectAccess({
  auth,
  scope,
}: {
  auth: AuthedSupabaseContext
  scope: AiScopeInput
}) {
  const resolved = resolveAiScope(scope)
  if (!resolved) {
    return {
      ok: false as const,
      status: 400 as const,
      error: 'tenantId and projectId are required for AI access',
    }
  }

  const projectAccess = await requireProjectAccess({
    ...accessContext(auth),
    tenantId: resolved.tenantId,
    projectId: resolved.projectId,
    editor: true,
  })
  if (!projectAccess.ok) return projectAccess

  const capability = await requireTenantCapability({
    supabase: auth.supabase,
    tenantId: resolved.tenantId,
    capability: 'ai_chat',
  })
  if (!capability.ok) return capability

  return { ok: true as const, ...resolved }
}
