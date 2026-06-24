import { NextResponse } from 'next/server'

import { getAuthedSupabase } from '@/lib/supabase/server'
import type { SemanticDataset } from '@/types/semantic-dataset'

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function mapDataset(row: Record<string, unknown>): SemanticDataset {
  const selectionRecord = row.selection && typeof row.selection === 'object'
    ? row.selection as Record<string, unknown>
    : {}
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    modelId: String(row.model_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as SemanticDataset['status'],
    selection: {
      fieldIds: toStringArray(selectionRecord.fieldIds),
      metricIds: toStringArray(selectionRecord.metricIds),
      relationshipIds: toStringArray(selectionRecord.relationshipIds),
    },
    cachePolicy: row.cache_policy && typeof row.cache_policy === 'object'
      ? row.cache_policy as SemanticDataset['cachePolicy']
      : { ttlSeconds: 300 },
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ plan: null, error: 'Unauthorized' }, { status: 401 })

    const { data: datasetRow, error: datasetError } = await auth.supabase
      .from('semantic_datasets')
      .select('*')
      .eq('id', id)
      .single()

    if (datasetError) return NextResponse.json({ plan: null, error: datasetError.message }, { status: 404 })
    const dataset = mapDataset(datasetRow as Record<string, unknown>)

    const [fieldsResult, metricsResult, relationshipsResult] = await Promise.all([
      dataset.selection.fieldIds.length > 0
        ? auth.supabase.from('business_fields').select('*').in('id', dataset.selection.fieldIds)
        : Promise.resolve({ data: [], error: null }),
      dataset.selection.metricIds.length > 0
        ? auth.supabase.from('business_metrics').select('*').in('id', dataset.selection.metricIds)
        : Promise.resolve({ data: [], error: null }),
      dataset.selection.relationshipIds.length > 0
        ? auth.supabase.from('business_relationships').select('*').in('id', dataset.selection.relationshipIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (fieldsResult.error) return NextResponse.json({ plan: null, error: fieldsResult.error.message }, { status: 500 })
    if (metricsResult.error) return NextResponse.json({ plan: null, error: metricsResult.error.message }, { status: 500 })
    if (relationshipsResult.error) return NextResponse.json({ plan: null, error: relationshipsResult.error.message }, { status: 500 })

    return NextResponse.json({
      plan: {
        dataset: {
          id: dataset.id,
          name: dataset.name,
          status: dataset.status,
          cachePolicy: dataset.cachePolicy,
        },
        fields: (fieldsResult.data ?? []).map(row => ({
          id: row.id,
          name: row.name,
          role: row.role,
          sourceColumn: row.source_column,
          filterable: row.is_filterable,
          tooltip: row.is_tooltip_field,
        })),
        metrics: (metricsResult.data ?? []).map(row => ({
          id: row.id,
          name: row.name,
          aggregation: row.aggregation,
          expression: row.expression,
          format: row.display_format,
        })),
        relationships: (relationshipsResult.data ?? []).map(row => ({
          id: row.id,
          type: row.type,
          fromEntityId: row.from_entity_id,
          toEntityId: row.to_entity_id,
          joinConfig: row.join_config,
        })),
        limits: {
          rowLimit: 500,
          timeoutMs: 12_000,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ plan: null, error: message }, { status: 500 })
  }
}
