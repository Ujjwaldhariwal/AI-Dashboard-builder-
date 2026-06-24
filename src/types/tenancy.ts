export type PlatformRole = 'admin' | 'engineer'

export type TenantStatus = 'active' | 'suspended' | 'archived'

export type TenantRole = 'owner' | 'admin' | 'viewer'

export type ProjectRole = 'lead' | 'editor' | 'viewer'

export type TenantDomainStatus = 'pending' | 'verified' | 'disabled'

export type DashboardPublishState = 'draft' | 'published' | 'archived'

export type AuditAction =
  | 'tenant.created'
  | 'tenant.updated'
  | 'project.created'
  | 'project.updated'
  | 'dashboard.published'
  | 'dashboard.unpublished'
  | 'data_source.created'
  | 'data_source.updated'
  | 'dataset.created'
  | 'dataset.updated'
  | 'business_model.created'
  | 'business_model.updated'
  | 'business_model.approved'
  | 'report.generated'

export interface Tenant {
  id: string
  name: string
  slug: string
  status: TenantStatus
  primaryDomain?: string | null
  branding?: TenantBranding | null
  createdAt: string
  updatedAt: string
}

export interface TenantBranding {
  logoUrl?: string
  accentColor?: string
  navColor?: string
  reportFooter?: string
}

export interface TenantDomain {
  id: string
  tenantId: string
  hostname: string
  status: TenantDomainStatus
  isPrimary: boolean
  verifiedAt?: string | null
  createdAt: string
}

export interface TenantMembership {
  id: string
  tenantId: string
  userId: string
  role: TenantRole
  createdAt: string
}

export interface DashboardProject {
  id: string
  tenantId: string
  name: string
  description?: string | null
  status: TenantStatus
  createdAt: string
  updatedAt: string
}

export interface ProjectAssignment {
  id: string
  projectId: string
  userId: string
  role: ProjectRole
  createdAt: string
}

export interface AuditLog {
  id: string
  tenantId?: string | null
  projectId?: string | null
  actorUserId?: string | null
  action: AuditAction
  targetType: string
  targetId?: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export const TENANT_ROLES: readonly TenantRole[] = ['owner', 'admin', 'viewer']

export const PROJECT_ROLES: readonly ProjectRole[] = ['lead', 'editor', 'viewer']
