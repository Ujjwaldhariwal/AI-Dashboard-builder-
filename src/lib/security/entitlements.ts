import type { SupabaseClient } from '@supabase/supabase-js'

import type { AuthedSupabaseContext } from '@/lib/supabase/server'
import type { TenantRole } from '@/types/tenancy'

export type TenantCapability = 'ai_chat' | 'client_runtime' | 'dataset_preview' | 'report_exports'

export type EntitlementDecision =
  | { ok: true }
  | { ok: false; status: 403 | 404; error: string }

interface EntitlementContext {
  supabase: SupabaseClient
  userId: string
  platformRole: AuthedSupabaseContext['role']
}

interface ScopedTarget extends EntitlementContext {
  tenantId: string
  projectId: string
}

interface DashboardEntitlementInput extends ScopedTarget {
  dashboardId: string
  access: 'view' | 'export'
}

interface DatasetEntitlementInput extends ScopedTarget {
  datasetId: string
}

function allow(): EntitlementDecision {
  return { ok: true }
}

function deny(error = 'Forbidden'): EntitlementDecision {
  return { ok: false, status: 403, error }
}

async function tenantRoleForUser({
  supabase,
  userId,
  tenantId,
}: {
  supabase: SupabaseClient
  userId: string
  tenantId: string
}) {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return typeof data?.role === 'string' ? data.role as TenantRole : null
}

export async function hasTenantCapability({
  supabase,
  tenantId,
  capability,
}: {
  supabase: SupabaseClient
  tenantId: string
  capability: TenantCapability
}) {
  const { data, error } = await supabase
    .from('tenant_capabilities')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('capability', capability)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.enabled === true
}

export async function requireTenantCapability(input: {
  supabase: SupabaseClient
  tenantId: string
  capability: TenantCapability
}): Promise<EntitlementDecision> {
  return await hasTenantCapability(input)
    ? allow()
    : deny(`Tenant capability is disabled: ${input.capability}`)
}

export async function requireDashboardEntitlement({
  supabase,
  userId,
  platformRole,
  tenantId,
  projectId,
  dashboardId,
  access,
}: DashboardEntitlementInput): Promise<EntitlementDecision> {
  const capability = await requireTenantCapability({
    supabase,
    tenantId,
    capability: access === 'export' ? 'report_exports' : 'client_runtime',
  })
  if (!capability.ok) return capability
  if (platformRole === 'admin') return allow()

  const role = await tenantRoleForUser({ supabase, userId, tenantId })
  const selectColumn = access === 'export' ? 'can_export' : 'can_view'
  const { data, error } = await supabase
    .from('published_dashboard_entitlements')
    .select(`id, principal_type, principal_id, role, ${selectColumn}`)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('dashboard_id', dashboardId)
    .eq(selectColumn, true)

  if (error) throw new Error(error.message)

  const hasGrant = ((data ?? []) as Record<string, unknown>[]).some(row => {
    const principalType = String(row.principal_type ?? '')
    if (principalType === 'tenant') return role !== null
    if (principalType === 'role') return role !== null && row.role === role
    if (principalType === 'user') return row.principal_id === userId
    return false
  })

  return hasGrant ? allow() : deny('Dashboard entitlement is required')
}

export async function requireDatasetEntitlement({
  supabase,
  userId,
  platformRole,
  tenantId,
  projectId,
  datasetId,
}: DatasetEntitlementInput): Promise<EntitlementDecision> {
  const capability = await requireTenantCapability({
    supabase,
    tenantId,
    capability: 'dataset_preview',
  })
  if (!capability.ok) return capability
  if (platformRole === 'admin') return allow()

  const role = await tenantRoleForUser({ supabase, userId, tenantId })
  const { data, error } = await supabase
    .from('semantic_dataset_entitlements')
    .select('id, principal_type, principal_id, role')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('dataset_id', datasetId)
    .eq('can_preview', true)

  if (error) throw new Error(error.message)

  const hasGrant = ((data ?? []) as Record<string, unknown>[]).some(row => {
    const principalType = String(row.principal_type ?? '')
    if (principalType === 'tenant') return role !== null
    if (principalType === 'role') return role !== null && row.role === role
    if (principalType === 'user') return row.principal_id === userId
    return false
  })

  return hasGrant ? allow() : deny('Dataset entitlement is required')
}

export async function listEntitledDashboardIds({
  supabase,
  userId,
  platformRole,
  tenantId,
  access = 'view',
}: EntitlementContext & {
  tenantId: string
  access?: 'view' | 'export'
}) {
  const capability = await requireTenantCapability({
    supabase,
    tenantId,
    capability: access === 'export' ? 'report_exports' : 'client_runtime',
  })
  if (!capability.ok) return []

  if (platformRole === 'admin') {
    const { data, error } = await supabase
      .from('published_dashboards')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')

    if (error) throw new Error(error.message)
    return (data ?? []).map(row => String(row.id))
  }

  const role = await tenantRoleForUser({ supabase, userId, tenantId })
  if (!role) return []

  const selectColumn = access === 'export' ? 'can_export' : 'can_view'
  const { data, error } = await supabase
    .from('published_dashboard_entitlements')
    .select('dashboard_id, principal_type, principal_id, role')
    .eq('tenant_id', tenantId)
    .eq(selectColumn, true)

  if (error) throw new Error(error.message)
  return Array.from(new Set(((data ?? []) as Record<string, unknown>[])
    .filter(row => {
      const principalType = String(row.principal_type ?? '')
      if (principalType === 'tenant') return true
      if (principalType === 'role') return row.role === role
      if (principalType === 'user') return row.principal_id === userId
      return false
    })
    .map(row => String(row.dashboard_id))))
}

export async function listEntitledDatasetIds({
  supabase,
  userId,
  platformRole,
  tenantId,
}: EntitlementContext & {
  tenantId: string
}) {
  const capability = await requireTenantCapability({
    supabase,
    tenantId,
    capability: 'dataset_preview',
  })
  if (!capability.ok) return []

  if (platformRole === 'admin') {
    const { data, error } = await supabase
      .from('semantic_datasets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')

    if (error) throw new Error(error.message)
    return (data ?? []).map(row => String(row.id))
  }

  const role = await tenantRoleForUser({ supabase, userId, tenantId })
  if (!role) return []

  const { data, error } = await supabase
    .from('semantic_dataset_entitlements')
    .select('dataset_id, principal_type, principal_id, role')
    .eq('tenant_id', tenantId)
    .eq('can_preview', true)

  if (error) throw new Error(error.message)
  return Array.from(new Set(((data ?? []) as Record<string, unknown>[])
    .filter(row => {
      const principalType = String(row.principal_type ?? '')
      if (principalType === 'tenant') return true
      if (principalType === 'role') return row.role === role
      if (principalType === 'user') return row.principal_id === userId
      return false
    })
    .map(row => String(row.dataset_id))))
}

export async function createDefaultDashboardEntitlement({
  supabase,
  tenantId,
  projectId,
  dashboardId,
  createdBy,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  dashboardId: string
  createdBy?: string | null
}) {
  const nowIso = new Date().toISOString()
  const { data: existing, error: existingError } = await supabase
    .from('published_dashboard_entitlements')
    .select('id')
    .eq('dashboard_id', dashboardId)
    .eq('principal_type', 'tenant')
    .is('principal_id', null)
    .is('role', null)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existing) {
    const { error } = await supabase
      .from('published_dashboard_entitlements')
      .update({ can_view: true, can_export: true, updated_at: nowIso })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabase
    .from('published_dashboard_entitlements')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      dashboard_id: dashboardId,
      principal_type: 'tenant',
      principal_id: null,
      role: null,
      can_view: true,
      can_export: true,
      created_by: createdBy ?? null,
      updated_at: nowIso,
    })
  if (error) throw new Error(error.message)
}

export async function createDefaultDatasetEntitlement({
  supabase,
  tenantId,
  projectId,
  datasetId,
  createdBy,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  datasetId: string
  createdBy?: string | null
}) {
  const nowIso = new Date().toISOString()
  const { data: existing, error: existingError } = await supabase
    .from('semantic_dataset_entitlements')
    .select('id')
    .eq('dataset_id', datasetId)
    .eq('principal_type', 'tenant')
    .is('principal_id', null)
    .is('role', null)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (existing) {
    const { error } = await supabase
      .from('semantic_dataset_entitlements')
      .update({ can_preview: true, updated_at: nowIso })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabase
    .from('semantic_dataset_entitlements')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      dataset_id: datasetId,
      principal_type: 'tenant',
      principal_id: null,
      role: null,
      can_preview: true,
      created_by: createdBy ?? null,
      updated_at: nowIso,
    })
  if (error) throw new Error(error.message)
}
