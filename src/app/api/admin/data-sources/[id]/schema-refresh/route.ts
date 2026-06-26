import { NextResponse } from 'next/server'
import { z } from 'zod'

import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const SchemaRefreshRequestSchema = z.object({
  reason: z.string().max(200).optional().or(z.literal('')),
}).strict()

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const nowIso = new Date().toISOString()

  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ dataSource: null, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = SchemaRefreshRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ dataSource: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: source, error: sourceError } = await auth.supabase
      .from('data_sources')
      .select('id, tenant_id, project_id')
      .eq('id', id)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ dataSource: null, error: sourceError?.message ?? 'Data source not found' }, { status: 404 })
    }

    const row = source as Record<string, unknown>
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ dataSource: null, error: access.error }, { status: access.status })
    }

    const reason = parsed.data.reason?.trim() || 'manual_refresh_requested'
    const { data, error } = await auth.supabase
      .from('data_sources')
      .update({
        schema_last_status: 'pending_refresh',
        schema_refresh_requested_at: nowIso,
        schema_refresh_reason: reason,
        updated_at: nowIso,
      })
      .eq('id', id)
      .select('id, schema_last_status, schema_refresh_requested_at, schema_refresh_reason')
      .single()

    if (error) {
      return NextResponse.json({ dataSource: null, error: error.message }, { status: 500 })
    }

    await auth.supabase
      .from('audit_logs')
      .insert({
        tenant_id: row.tenant_id,
        project_id: row.project_id,
        actor_user_id: auth.userId,
        action: 'data_source.schema_refresh_requested',
        target_type: 'data_source',
        target_id: id,
        metadata: { reason },
        created_at: nowIso,
      })

    return NextResponse.json({ dataSource: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dataSource: null, error: message }, { status: 500 })
  }
}
