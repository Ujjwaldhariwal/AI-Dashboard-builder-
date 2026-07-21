import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { validateSemanticReferencesForModel } from '@/lib/semantic/semantic-hardening'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { SemanticDataset, SemanticDatasetStatus } from '@/types/semantic-dataset'

const DatasetSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  modelId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().or(z.literal('')),
  fieldIds: z.array(z.string().uuid()).default([]),
  metricIds: z.array(z.string().uuid()).default([]),
  relationshipIds: z.array(z.string().uuid()).default([]),
}).strict()

function mapDataset(row: Record<string, unknown>): SemanticDataset {
  const selection = row.selection && typeof row.selection === 'object'
    ? row.selection as SemanticDataset['selection']
    : { fieldIds: [], metricIds: [], relationshipIds: [] }
  const cachePolicy = row.cache_policy && typeof row.cache_policy === 'object'
    ? row.cache_policy as SemanticDataset['cachePolicy']
    : { ttlSeconds: 300 }

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    modelId: String(row.model_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as SemanticDatasetStatus,
    selection,
    cachePolicy,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthedSupabase()
  if (!auth) return NextResponse.json({ datasets: [], error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (projectId) {
    const access = await requireProjectAccess({ ...accessContext(auth), projectId })
    if (!access.ok) {
      return NextResponse.json({ datasets: [], error: access.error }, { status: access.status })
    }
  }

  let query = auth.supabase.from('semantic_datasets').select('*').order('updated_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return NextResponse.json({ datasets: [], error: error.message }, { status: 500 })
  return NextResponse.json({ datasets: (data ?? []).map(row => mapDataset(row as Record<string, unknown>)) })
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ dataset: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = DatasetSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ dataset: null, error: parsed.error.flatten() }, { status: 400 })
    if (parsed.data.fieldIds.length === 0 && parsed.data.metricIds.length === 0) {
      return NextResponse.json({ dataset: null, error: 'Select at least one field or metric' }, { status: 400 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ dataset: null, error: access.error }, { status: access.status })
    }

    const { data: model, error: modelError } = await auth.supabase
      .from('business_models')
      .select('id, tenant_id, project_id, status')
      .eq('id', parsed.data.modelId)
      .eq('tenant_id', parsed.data.tenantId)
      .eq('project_id', parsed.data.projectId)
      .single()

    if (modelError) return NextResponse.json({ dataset: null, error: modelError.message }, { status: 404 })
    if (model.status !== 'approved') {
      return NextResponse.json({ dataset: null, error: 'Business model must be approved before creating datasets' }, { status: 409 })
    }

    const nowIso = new Date().toISOString()
    const selection = {
      fieldIds: parsed.data.fieldIds,
      metricIds: parsed.data.metricIds,
      relationshipIds: parsed.data.relationshipIds,
    }
    const semanticValidation = await validateSemanticReferencesForModel({
      supabase: auth.supabase,
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      modelId: parsed.data.modelId,
      selection,
    })
    if (!semanticValidation.ok) {
      return NextResponse.json({ dataset: null, error: semanticValidation.error }, { status: 409 })
    }
    const { data, error } = await auth.supabase
      .from('semantic_datasets')
      .insert({
        tenant_id: parsed.data.tenantId,
        project_id: parsed.data.projectId,
        model_id: parsed.data.modelId,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        status: 'draft',
        selection,
        cache_policy: { ttlSeconds: 300 },
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ dataset: null, error: error.message }, { status: 400 })
    const dataset = mapDataset(data as Record<string, unknown>)

    await auth.supabase.from('audit_logs').insert({
      tenant_id: dataset.tenantId,
      project_id: dataset.projectId,
      actor_user_id: auth.userId,
      action: 'dataset.created',
      target_type: 'semantic_dataset',
      target_id: dataset.id,
      metadata: { modelId: dataset.modelId, name: dataset.name, selection },
      created_at: nowIso,
    })

    return NextResponse.json({ dataset }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dataset: null, error: message }, { status: 500 })
  }
}
