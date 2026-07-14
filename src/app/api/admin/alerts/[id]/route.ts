import { NextResponse } from 'next/server'
import { z } from 'zod'

import { updatePlatformAlertState } from '@/lib/alerts/platform-alerts'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const UpdateAlertSchema = z.object({
  state: z.enum(['acknowledged', 'resolved']),
}).strict()

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ alert: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = UpdateAlertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ alert: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: existing, error: existingError } = await auth.supabase
      .from('platform_alerts')
      .select('id, tenant_id, project_id')
      .eq('id', id)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ alert: null, error: existingError?.message ?? 'Alert not found' }, { status: 404 })
    }

    const row = existing as Record<string, unknown>
    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ alert: null, error: access.error }, { status: access.status })
    }

    const alert = await updatePlatformAlertState({
      supabase: auth.supabase,
      alertId: id,
      state: parsed.data.state,
      actorUserId: auth.userId,
    })

    return NextResponse.json({ alert })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ alert: null, error: message }, { status: 500 })
  }
}
