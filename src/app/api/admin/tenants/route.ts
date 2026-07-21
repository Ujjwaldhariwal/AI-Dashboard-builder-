import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requirePlatformAdmin } from '@/lib/supabase/server'
import type { Tenant, TenantStatus } from '@/types/tenancy'

const TenantCreateSchema = z.object({
  name: z.string().min(2, 'Tenant name is required').max(120),
  slug: z.string().max(80).optional(),
  primaryDomain: z.string().max(255).optional().or(z.literal('')),
  status: z.enum(['active', 'suspended', 'archived']).default('active'),
}).strict()

function slugifyTenantName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

function mapTenant(row: Record<string, unknown>): Tenant {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    status: String(row.status ?? 'active') as TenantStatus,
    primaryDomain: typeof row.primary_domain === 'string' ? row.primary_domain : null,
    branding: row.branding && typeof row.branding === 'object' && !Array.isArray(row.branding)
      ? row.branding as Tenant['branding']
      : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

function isMissingTenancySchema(message: string) {
  return /relation .*tenants.* does not exist|schema cache|could not find the table/i.test(message)
}

export async function GET() {
  try {
    const auth = await requirePlatformAdmin()
    if (auth instanceof Response) return auth

    const { data, error } = await auth.supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      const status = isMissingTenancySchema(error.message) ? 503 : 500
      return NextResponse.json({ tenants: [], error: error.message }, { status })
    }

    return NextResponse.json({
      tenants: (data ?? []).map(row => mapTenant(row as Record<string, unknown>)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ tenants: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePlatformAdmin()
    if (auth instanceof Response) return auth

    const body = await req.json().catch(() => null)
    const parsed = TenantCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ tenant: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const slug = slugifyTenantName(parsed.data.slug || parsed.data.name)
    if (!slug) {
      return NextResponse.json({ tenant: null, error: 'Tenant slug is required' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const { data, error } = await auth.supabase
      .from('tenants')
      .insert({
        name: parsed.data.name.trim(),
        slug,
        status: parsed.data.status,
        primary_domain: parsed.data.primaryDomain?.trim() || null,
        branding: {},
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single()

    if (error) {
      const status = isMissingTenancySchema(error.message) ? 503 : 400
      return NextResponse.json({ tenant: null, error: error.message }, { status })
    }

    const tenant = mapTenant(data as Record<string, unknown>)

    const { error: membershipError } = await auth.supabase
      .from('tenant_memberships')
      .upsert({
        tenant_id: tenant.id,
        user_id: auth.userId,
        role: 'owner',
        created_at: nowIso,
      }, { onConflict: 'tenant_id,user_id' })

    if (membershipError) {
      return NextResponse.json({ tenant, project: null, error: membershipError.message }, { status: 400 })
    }

    const { data: project, error: projectError } = await auth.supabase
      .from('dashboard_projects')
      .insert({
        tenant_id: tenant.id,
        name: 'Dashboard Workspace',
        description: 'Default project for this tenant',
        status: 'active',
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, tenant_id, name, description, status, created_at, updated_at')
      .single()

    if (projectError || !project) {
      return NextResponse.json({
        tenant,
        project: null,
        error: projectError?.message ?? 'Default project could not be created',
      }, { status: 400 })
    }

    await auth.supabase
      .from('audit_logs')
      .insert({
        tenant_id: tenant.id,
        actor_user_id: auth.userId,
        action: 'tenant.created',
        target_type: 'tenant',
        target_id: tenant.id,
        metadata: { slug: tenant.slug },
        created_at: nowIso,
      })

    await auth.supabase
      .from('audit_logs')
      .insert({
        tenant_id: tenant.id,
        project_id: project.id,
        actor_user_id: auth.userId,
        action: 'project.created',
        target_type: 'dashboard_project',
        target_id: project.id,
        metadata: { name: project.name, source: 'tenant_creation' },
        created_at: nowIso,
      })

    return NextResponse.json({ tenant, project }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ tenant: null, error: message }, { status: 500 })
  }
}
