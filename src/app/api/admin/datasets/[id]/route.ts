import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getAuthedSupabase } from '@/lib/supabase/server'
import type { SemanticDataset, SemanticDatasetStatus } from '@/types/semantic-dataset'

const StatusSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']),
}).strict()

function mapDataset(row: Record<string, unknown>): SemanticDataset {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    modelId: String(row.model_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as SemanticDatasetStatus,
    selection: row.selection && typeof row.selection === 'object'
      ? row.selection as SemanticDataset['selection']
      : { fieldIds: [], metricIds: [], relationshipIds: [] },
    cachePolicy: row.cache_policy && typeof row.cache_policy === 'object'
      ? row.cache_policy as SemanticDataset['cachePolicy']
      : { ttlSeconds: 300 },
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ dataset: null, error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parsed = StatusSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ dataset: null, error: parsed.error.flatten() }, { status: 400 })

    const nowIso = new Date().toISOString()
    const { data, error } = await auth.supabase
      .from('semantic_datasets')
      .update({ status: parsed.data.status, updated_at: nowIso })
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ dataset: null, error: error.message }, { status: 400 })
    const dataset = mapDataset(data as Record<string, unknown>)

    await auth.supabase.from('audit_logs').insert({
      tenant_id: dataset.tenantId,
      project_id: dataset.projectId,
      actor_user_id: auth.userId,
      action: 'dataset.updated',
      target_type: 'semantic_dataset',
      target_id: dataset.id,
      metadata: { status: dataset.status },
      created_at: nowIso,
    })

    return NextResponse.json({ dataset })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dataset: null, error: message }, { status: 500 })
  }
}
