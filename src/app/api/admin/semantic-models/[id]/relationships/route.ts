import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getAuthedSupabase } from '@/lib/supabase/server'
import type { BusinessRelationship, BusinessRelationshipType } from '@/types/semantic-model'

const RelationshipSchema = z.object({
  fromEntityId: z.string().uuid(),
  toEntityId: z.string().uuid(),
  fromFieldId: z.string().uuid(),
  toFieldId: z.string().uuid(),
  type: z.enum(['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many']).default('many_to_one'),
  description: z.string().max(300).optional().or(z.literal('')),
}).strict()

function mapRelationship(row: Record<string, unknown>): BusinessRelationship {
  return {
    id: String(row.id),
    modelId: String(row.model_id),
    fromEntityId: String(row.from_entity_id),
    toEntityId: String(row.to_entity_id),
    type: String(row.type ?? 'many_to_one') as BusinessRelationshipType,
    joinConfig: row.join_config && typeof row.join_config === 'object' ? row.join_config as Record<string, unknown> : {},
    description: typeof row.description === 'string' ? row.description : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const auth = await getAuthedSupabase()
  if (!auth) return NextResponse.json({ relationships: [], error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await auth.supabase
    .from('business_relationships')
    .select('*')
    .eq('model_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ relationships: [], error: error.message }, { status: 500 })
  return NextResponse.json({ relationships: (data ?? []).map(row => mapRelationship(row as Record<string, unknown>)) })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ relationship: null, error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parsed = RelationshipSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ relationship: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: model, error: modelError } = await auth.supabase
      .from('business_models')
      .select('id, tenant_id, project_id')
      .eq('id', id)
      .single()

    if (modelError) return NextResponse.json({ relationship: null, error: modelError.message }, { status: 404 })

    const nowIso = new Date().toISOString()
    const joinConfig = {
      leftFieldId: parsed.data.fromFieldId,
      rightFieldId: parsed.data.toFieldId,
      operator: '=',
    }

    const { data, error } = await auth.supabase
      .from('business_relationships')
      .insert({
        model_id: id,
        from_entity_id: parsed.data.fromEntityId,
        to_entity_id: parsed.data.toEntityId,
        type: parsed.data.type,
        join_config: joinConfig,
        description: parsed.data.description?.trim() || null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ relationship: null, error: error.message }, { status: 400 })
    const relationship = mapRelationship(data as Record<string, unknown>)

    await auth.supabase.from('audit_logs').insert({
      tenant_id: model.tenant_id,
      project_id: model.project_id,
      actor_user_id: auth.userId,
      action: 'business_model.updated',
      target_type: 'business_relationship',
      target_id: relationship.id,
      metadata: { modelId: id, type: relationship.type, joinConfig },
      created_at: nowIso,
    })

    return NextResponse.json({ relationship }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ relationship: null, error: message }, { status: 500 })
  }
}
