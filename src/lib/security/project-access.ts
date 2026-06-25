import type { SupabaseClient } from '@supabase/supabase-js'

import type { AuthedSupabaseContext } from '@/lib/supabase/server'
import type { ProjectRole, TenantRole } from '@/types/tenancy'

type AccessRole = 'platform_admin' | TenantRole | ProjectRole

export type AccessDecision =
  | { ok: true; role: AccessRole }
  | { ok: false; status: 403 | 404; error: string }

interface AccessContext {
  supabase: SupabaseClient
  userId: string
  platformRole: AuthedSupabaseContext['role']
}

interface TenantAccessInput extends AccessContext {
  tenantId: string
  editor?: boolean
}

interface ProjectAccessInput extends AccessContext {
  projectId: string
  tenantId?: string
  editor?: boolean
}

const EDITOR_PROJECT_ROLES = new Set<ProjectRole>(['lead', 'editor'])
const TENANT_EDITOR_ROLES = new Set<TenantRole>(['owner', 'admin'])

function allow(role: AccessRole): AccessDecision {
  return { ok: true, role }
}

function deny(error = 'Forbidden'): AccessDecision {
  return { ok: false, status: 403, error }
}

function notFound(error = 'Project not found'): AccessDecision {
  return { ok: false, status: 404, error }
}

export async function requireTenantAccess({
  supabase,
  userId,
  platformRole,
  tenantId,
  editor = false,
}: TenantAccessInput): Promise<AccessDecision> {
  if (platformRole === 'admin') return allow('platform_admin')

  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return deny(error.message)

  const role = data?.role as TenantRole | undefined
  if (!role) {
    if (editor) return deny('Project editor access is required')

    const { data: hasAccess, error: rpcError } = await supabase.rpc('has_tenant_access', {
      target_tenant_id: tenantId,
    })

    if (rpcError) return deny(rpcError.message)
    return hasAccess === true ? allow('viewer') : deny()
  }
  if (editor && !TENANT_EDITOR_ROLES.has(role)) return deny('Project editor access is required')

  return allow(role)
}

export async function requireProjectAccess({
  supabase,
  userId,
  platformRole,
  projectId,
  tenantId,
  editor = false,
}: ProjectAccessInput): Promise<AccessDecision> {
  if (platformRole === 'admin') return allow('platform_admin')

  const { data: assignment, error: assignmentError } = await supabase
    .from('project_assignments')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (assignmentError) return deny(assignmentError.message)

  const projectRole = assignment?.role as ProjectRole | undefined
  if (projectRole) {
    if (!editor || EDITOR_PROJECT_ROLES.has(projectRole)) return allow(projectRole)
    return deny('Project editor access is required')
  }

  const { data: project, error: projectError } = await supabase
    .from('dashboard_projects')
    .select('tenant_id')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) return deny(projectError.message)
  if (!project) return notFound()
  if (tenantId && project.tenant_id !== tenantId) return notFound()

  return requireTenantAccess({
    supabase,
    userId,
    platformRole,
    tenantId: String(project.tenant_id),
    editor: true,
  })
}

export function accessContext(auth: AuthedSupabaseContext): AccessContext {
  return {
    supabase: auth.supabase,
    userId: auth.userId,
    platformRole: auth.role,
  }
}
