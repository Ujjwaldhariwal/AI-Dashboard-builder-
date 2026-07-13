import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  buildGuidedDatasetDraftFromRecipe,
  buildGuidedDatasetRecipes,
} from '@/lib/dashboardos/guided-review'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { validateSemanticReferencesForModel } from '@/lib/semantic/semantic-hardening'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { BusinessMetric, BusinessRelationship } from '@/types/semantic-model'
import type { SemanticDataset, SemanticDatasetStatus } from '@/types/semantic-dataset'

const DatasetDraftSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  modelId: z.string().uuid(),
  recipeId: z.string().min(2).max(80),
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

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ dataset: null, plan: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = DatasetDraftSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ dataset: null, plan: null, error: parsed.error.flatten() }, { status: 400 })

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      editor: true,
    })
    if (!access.ok) return NextResponse.json({ dataset: null, plan: null, error: access.error }, { status: access.status })

    const { data: model, error: modelError } = await auth.supabase
      .from('business_models')
      .select('id, tenant_id, project_id, status')
      .eq('id', parsed.data.modelId)
      .eq('tenant_id', parsed.data.tenantId)
      .eq('project_id', parsed.data.projectId)
      .single()

    if (modelError || !model) return NextResponse.json({ dataset: null, plan: null, error: modelError?.message ?? 'Business model not found' }, { status: 404 })
    if (model.status !== 'approved') {
      return NextResponse.json({ dataset: null, plan: null, error: 'Approve the semantic model before generating dataset drafts' }, { status: 409 })
    }

    const [fieldsResult, metricsResult, relationshipsResult] = await Promise.all([
      auth.supabase
        .from('business_entities')
        .select('id, name, fields:business_fields(id, name, role)')
        .eq('model_id', parsed.data.modelId),
      auth.supabase
        .from('business_metrics')
        .select('*')
        .eq('model_id', parsed.data.modelId),
      auth.supabase
        .from('business_relationships')
        .select('*')
        .eq('model_id', parsed.data.modelId),
    ])

    if (fieldsResult.error) return NextResponse.json({ dataset: null, plan: null, error: fieldsResult.error.message }, { status: 500 })
    if (metricsResult.error) return NextResponse.json({ dataset: null, plan: null, error: metricsResult.error.message }, { status: 500 })
    if (relationshipsResult.error) return NextResponse.json({ dataset: null, plan: null, error: relationshipsResult.error.message }, { status: 500 })

    const fields = (fieldsResult.data ?? []).flatMap(entity => {
      const record = entity as Record<string, unknown>
      const entityName = String(record.name ?? '')
      const nestedFields = Array.isArray(record.fields) ? record.fields as Record<string, unknown>[] : []
      return nestedFields.map(field => ({
        id: String(field.id),
        name: String(field.name ?? ''),
        role: String(field.role ?? ''),
        entityName,
      }))
    })
    const metrics = (metricsResult.data ?? []).map(metric => ({
      id: String(metric.id),
      name: String(metric.name ?? ''),
      aggregation: String(metric.aggregation ?? 'sum') as BusinessMetric['aggregation'],
    }))
    const relationships = (relationshipsResult.data ?? []) as BusinessRelationship[]
    const recipe = buildGuidedDatasetRecipes({ fields, metrics, relationships }).find(item => item.id === parsed.data.recipeId)
    if (!recipe) return NextResponse.json({ dataset: null, plan: null, error: 'Recipe is not available for this semantic model' }, { status: 404 })

    const plan = buildGuidedDatasetDraftFromRecipe({ recipe, fields, metrics, relationships })
    if (plan.metricIds.length === 0) {
      return NextResponse.json({ dataset: null, plan, error: 'Recipe needs at least one approved metric' }, { status: 422 })
    }

    const selection = {
      fieldIds: plan.fieldIds,
      metricIds: plan.metricIds,
      relationshipIds: plan.relationshipIds,
    }
    const semanticValidation = await validateSemanticReferencesForModel({
      supabase: auth.supabase,
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      modelId: parsed.data.modelId,
      selection,
    })
    if (!semanticValidation.ok) return NextResponse.json({ dataset: null, plan, error: semanticValidation.error }, { status: 422 })

    const nowIso = new Date().toISOString()
    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .insert({
        tenant_id: parsed.data.tenantId,
        project_id: parsed.data.projectId,
        model_id: parsed.data.modelId,
        name: plan.name,
        description: `Guided draft from ${recipe.title}. ${plan.reviewNotes.join(' ')}`.trim(),
        status: 'draft',
        selection,
        cache_policy: { ttlSeconds: 300 },
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single()

    if (datasetError) return NextResponse.json({ dataset: null, plan, error: datasetError.message }, { status: 400 })
    const dataset = mapDataset(datasetRow as Record<string, unknown>)

    await auth.supabase.from('audit_logs').insert({
      tenant_id: dataset.tenantId,
      project_id: dataset.projectId,
      actor_user_id: auth.userId,
      action: 'guided_review.dataset_draft_created',
      target_type: 'semantic_dataset',
      target_id: dataset.id,
      metadata: { recipeId: recipe.id, reviewNoteCount: plan.reviewNotes.length, selection },
      created_at: nowIso,
    })

    return NextResponse.json({ dataset, plan }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ dataset: null, plan: null, error: message }, { status: 500 })
  }
}
