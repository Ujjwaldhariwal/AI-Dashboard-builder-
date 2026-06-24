import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getAuthedSupabase } from '@/lib/supabase/server'
import type { BusinessModel, BusinessModelStatus } from '@/types/semantic-model'

const StatusSchema = z.object({
  status: z.enum(['draft', 'review', 'approved', 'archived']),
}).strict()

function mapBusinessModel(row: Record<string, unknown>): BusinessModel {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as BusinessModelStatus,
    version: typeof row.version === 'number' ? row.version : Number(row.version ?? 1),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    approvedAt: typeof row.approved_at === 'string' ? row.approved_at : null,
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ model: null, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = StatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ model: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const { data, error } = await auth.supabase
      .from('business_models')
      .update({
        status: parsed.data.status,
        approved_at: parsed.data.status === 'approved' ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ model: null, error: error.message }, { status: 400 })
    }

    const model = mapBusinessModel(data as Record<string, unknown>)

    await auth.supabase
      .from('audit_logs')
      .insert({
        tenant_id: model.tenantId,
        project_id: model.projectId,
        actor_user_id: auth.userId,
        action: parsed.data.status === 'approved' ? 'business_model.approved' : 'business_model.updated',
        target_type: 'business_model',
        target_id: model.id,
        metadata: { status: model.status, version: model.version },
        created_at: nowIso,
      })

    return NextResponse.json({ model })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ model: null, error: message }, { status: 500 })
  }
}
