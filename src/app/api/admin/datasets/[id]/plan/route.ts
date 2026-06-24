import { NextResponse } from 'next/server'

import { getAuthedSupabase } from '@/lib/supabase/server'
import type { CompiledDatasetQueryPlan, SemanticDataset } from '@/types/semantic-dataset'

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

function compileQueryPlan(
  fields: Record<string, unknown>[],
  metrics: Record<string, unknown>[],
  relationships: Record<string, unknown>[],
): CompiledDatasetQueryPlan {
  const selectedFields = fields.map(row => ({
    id: String(row.id),
    label: String(row.name ?? ''),
    expression: {
      type: 'source_column',
      sourceColumn: row.source_column ?? null,
    },
    role: 'field' as const,
  }))
  const selectedMetrics = metrics.map(row => ({
    id: String(row.id),
    label: String(row.name ?? ''),
    expression: {
      type: 'aggregation',
      aggregation: row.aggregation,
      metricExpression: row.expression ?? {},
    },
    role: 'metric' as const,
  }))

  return {
    dialect: 'postgres',
    select: [...selectedFields, ...selectedMetrics],
    joins: relationships.map(row => {
      const joinConfig = row.join_config && typeof row.join_config === 'object'
        ? row.join_config as Record<string, unknown>
        : {}
      return {
        id: String(row.id),
        type: String(row.type ?? 'many_to_one'),
        leftFieldId: typeof joinConfig.leftFieldId === 'string' ? joinConfig.leftFieldId : undefined,
        rightFieldId: typeof joinConfig.rightFieldId === 'string' ? joinConfig.rightFieldId : undefined,
        operator: '=' as const,
      }
    }),
    groupByFieldIds: fields.map(row => String(row.id)),
    filters: [],
    limits: {
      rowLimit: 500,
      timeoutMs: 12_000,
    },
    executableSql: null,
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

    const fields = (fieldsResult.data ?? []) as Record<string, unknown>[]
    const metrics = (metricsResult.data ?? []) as Record<string, unknown>[]
    const relationships = (relationshipsResult.data ?? []) as Record<string, unknown>[]
    const queryPlan = compileQueryPlan(fields, metrics, relationships)

    return NextResponse.json({
      plan: {
        dataset: {
          id: dataset.id,
          name: dataset.name,
          status: dataset.status,
          cachePolicy: dataset.cachePolicy,
        },
        fields: fields.map(row => ({
          id: row.id,
          name: row.name,
          role: row.role,
          sourceColumn: row.source_column,
          filterable: row.is_filterable,
          tooltip: row.is_tooltip_field,
        })),
        metrics: metrics.map(row => ({
          id: row.id,
          name: row.name,
          aggregation: row.aggregation,
          expression: row.expression,
          format: row.display_format,
        })),
        relationships: relationships.map(row => ({
          id: row.id,
          type: row.type,
          fromEntityId: row.from_entity_id,
          toEntityId: row.to_entity_id,
          joinConfig: row.join_config,
        })),
        limits: queryPlan.limits,
        queryPlan,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ plan: null, error: message }, { status: 500 })
  }
}
