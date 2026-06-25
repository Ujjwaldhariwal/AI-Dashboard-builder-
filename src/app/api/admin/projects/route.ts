import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { accessContext, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DashboardProject, TenantStatus } from '@/types/tenancy'

const ProjectCreateSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2, 'Project name is required').max(120),
  description: z.string().max(500).optional().or(z.literal('')),
}).strict()

interface ProjectWithTenant extends DashboardProject {
  tenantName?: string | null
  tenantSlug?: string | null
}

function mapProject(row: Record<string, unknown>): ProjectWithTenant {
  const tenant = row.tenant && typeof row.tenant === 'object' && !Array.isArray(row.tenant)
    ? row.tenant as Record<string, unknown>
    : {}

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'active') as TenantStatus,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    tenantName: typeof tenant.name === 'string' ? tenant.name : null,
    tenantSlug: typeof tenant.slug === 'string' ? tenant.slug : null,
  }
}

function isMissingProjectSchema(message: string) {
  return /relation .*dashboard_projects.* does not exist|schema cache|could not find the table/i.test(message)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ projects: [], error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = req.nextUrl.searchParams.get('tenantId')
    if (tenantId) {
      const access = await requireTenantAccess({ ...accessContext(auth), tenantId })
      if (!access.ok) {
        return NextResponse.json({ projects: [], error: access.error }, { status: access.status })
      }
    }

    let query = auth.supabase
      .from('dashboard_projects')
      .select('id, tenant_id, name, description, status, created_at, updated_at, tenant:tenants(name, slug)')
      .order('updated_at', { ascending: false })

    if (tenantId) query = query.eq('tenant_id', tenantId)

    const { data, error } = await query
    if (error) {
      const status = isMissingProjectSchema(error.message) ? 503 : 500
      return NextResponse.json({ projects: [], error: error.message }, { status })
    }

    return NextResponse.json({
      projects: (data ?? []).map(row => mapProject(row as Record<string, unknown>)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ projects: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ project: null, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const parsed = ProjectCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ project: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireTenantAccess({
      ...accessContext(auth),
      tenantId: parsed.data.tenantId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ project: null, error: access.error }, { status: access.status })
    }

    const nowIso = new Date().toISOString()
    const { data, error } = await auth.supabase
      .from('dashboard_projects')
      .insert({
        tenant_id: parsed.data.tenantId,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        status: 'active',
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, tenant_id, name, description, status, created_at, updated_at, tenant:tenants(name, slug)')
      .single()

    if (error) {
      const status = isMissingProjectSchema(error.message) ? 503 : 400
      return NextResponse.json({ project: null, error: error.message }, { status })
    }

    const project = mapProject(data as Record<string, unknown>)

    await auth.supabase
      .from('audit_logs')
      .insert({
        tenant_id: project.tenantId,
        project_id: project.id,
        actor_user_id: auth.userId,
        action: 'project.created',
        target_type: 'dashboard_project',
        target_id: project.id,
        metadata: { name: project.name },
        created_at: nowIso,
      })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ project: null, error: message }, { status: 500 })
  }
}
