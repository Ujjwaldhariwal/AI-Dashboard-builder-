import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { mapPublishedDashboard, slugifyDashboardName } from '@/lib/publishing/dashboard-publishing'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const DashboardCreateSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().max(500).optional().or(z.literal('')),
}).strict()

export async function GET(req: NextRequest) {
  const auth = await getAuthedSupabase()
  if (!auth) return NextResponse.json({ dashboards: [], error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (projectId) {
    const access = await requireProjectAccess({ ...accessContext(auth), projectId })
    if (!access.ok) {
      return NextResponse.json({ dashboards: [], error: access.error }, { status: access.status })
    }
  }

  let query = auth.supabase
    .from('published_dashboards')
    .select('*')
    .order('updated_at', { ascending: false })

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return NextResponse.json({ dashboards: [], error: error.message }, { status: 500 })

  return NextResponse.json({
    dashboards: (data ?? []).map(row => mapPublishedDashboard(row as Record<string, unknown>)),
  })
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ dashboard: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = DashboardCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ dashboard: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ dashboard: null, error: access.error }, { status: access.status })
    }

    const nowIso = new Date().toISOString()
    const slug = parsed.data.slug ?? slugifyDashboardName(parsed.data.name)
    if (!slug) return NextResponse.json({ dashboard: null, error: 'Dashboard slug is required' }, { status: 400 })

    const { data, error } = await auth.supabase
      .from('published_dashboards')
      .insert({
        tenant_id: parsed.data.tenantId,
        project_id: parsed.data.projectId,
        name: parsed.data.name.trim(),
        slug,
        description: parsed.data.description?.trim() || null,
        status: 'draft',
        created_by: auth.userId,
        updated_by: auth.userId,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ dashboard: null, error: error.message }, { status: 400 })
    const dashboard = mapPublishedDashboard(data as Record<string, unknown>)

    await Promise.all([
      auth.supabase.from('dashboard_publish_events').insert({
        dashboard_id: dashboard.id,
        tenant_id: dashboard.tenantId,
        project_id: dashboard.projectId,
        actor_user_id: auth.userId,
        event_type: 'created',
        metadata: { name: dashboard.name, slug: dashboard.slug },
        created_at: nowIso,
      }),
      auth.supabase.from('audit_logs').insert({
        tenant_id: dashboard.tenantId,
        project_id: dashboard.projectId,
        actor_user_id: auth.userId,
        action: 'published_dashboard.created',
        target_type: 'published_dashboard',
        target_id: dashboard.id,
        metadata: { name: dashboard.name, slug: dashboard.slug },
        created_at: nowIso,
      }),
    ])

    return NextResponse.json({ dashboard }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dashboard: null, error: message }, { status: 500 })
  }
}
