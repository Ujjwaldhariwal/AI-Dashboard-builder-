import { NextResponse } from 'next/server'
import { z } from 'zod'

import { mapPublishedDashboard, slugifyDashboardName } from '@/lib/publishing/dashboard-publishing'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const DashboardUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().max(500).optional().or(z.literal('')),
  status: z.enum(['draft', 'archived']).optional(),
}).strict()

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ dashboard: null, error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parsed = DashboardUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ dashboard: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: existingRow, error: existingError } = await auth.supabase
      .from('published_dashboards')
      .select('*')
      .eq('id', id)
      .single()

    if (existingError || !existingRow) {
      return NextResponse.json({ dashboard: null, error: existingError?.message ?? 'Dashboard not found' }, { status: 404 })
    }

    const existing = mapPublishedDashboard(existingRow as Record<string, unknown>)
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: existing.tenantId,
      projectId: existing.projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ dashboard: null, error: access.error }, { status: access.status })
    }

    const nowIso = new Date().toISOString()
    const update: Record<string, unknown> = {
      updated_by: auth.userId,
      updated_at: nowIso,
    }

    if (parsed.data.name) update.name = parsed.data.name.trim()
    if (parsed.data.slug) update.slug = parsed.data.slug
    if (!parsed.data.slug && parsed.data.name && !existing.slug) {
      update.slug = slugifyDashboardName(parsed.data.name)
    }
    if ('description' in parsed.data) update.description = parsed.data.description?.trim() || null
    if (parsed.data.status) {
      update.status = parsed.data.status
      if (parsed.data.status === 'archived') update.published_at = null
    }

    const { data: updatedRow, error: updateError } = await auth.supabase
      .from('published_dashboards')
      .update(update)
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) return NextResponse.json({ dashboard: null, error: updateError.message }, { status: 400 })
    const dashboard = mapPublishedDashboard(updatedRow as Record<string, unknown>)

    await auth.supabase.from('audit_logs').insert({
      tenant_id: dashboard.tenantId,
      project_id: dashboard.projectId,
      actor_user_id: auth.userId,
      action: 'published_dashboard.updated',
      target_type: 'published_dashboard',
      target_id: dashboard.id,
      metadata: { status: dashboard.status, name: dashboard.name, slug: dashboard.slug },
      created_at: nowIso,
    })

    if (parsed.data.status === 'archived') {
      await auth.supabase.from('dashboard_publish_events').insert({
        dashboard_id: dashboard.id,
        version_id: dashboard.currentVersionId,
        tenant_id: dashboard.tenantId,
        project_id: dashboard.projectId,
        actor_user_id: auth.userId,
        event_type: 'archived',
        metadata: {},
        created_at: nowIso,
      })
    }

    return NextResponse.json({ dashboard })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dashboard: null, error: message }, { status: 500 })
  }
}
