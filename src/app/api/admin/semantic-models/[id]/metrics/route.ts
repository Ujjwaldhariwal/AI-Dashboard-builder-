import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getAuthedSupabase } from '@/lib/supabase/server'
import type { BusinessMetric, BusinessMetricAggregation } from '@/types/semantic-model'

const MetricSchema = z.object({
  entityId: z.string().uuid().optional(),
  fieldId: z.string().uuid(),
  name: z.string().min(2).max(120),
  aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count', 'count_distinct']).default('sum'),
  unit: z.string().max(40).optional().or(z.literal('')),
  displayFormat: z.string().max(80).optional().or(z.literal('')),
}).strict()

function semanticKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '').slice(0, 80)
}

function mapMetric(row: Record<string, unknown>): BusinessMetric {
  return {
    id: String(row.id),
    modelId: String(row.model_id),
    entityId: typeof row.entity_id === 'string' ? row.entity_id : null,
    name: String(row.name ?? ''),
    semanticKey: String(row.semantic_key ?? ''),
    aggregation: String(row.aggregation ?? 'sum') as BusinessMetricAggregation,
    expression: row.expression && typeof row.expression === 'object' ? row.expression as Record<string, unknown> : {},
    unit: typeof row.unit === 'string' ? row.unit : null,
    displayFormat: typeof row.display_format === 'string' ? row.display_format : null,
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
  if (!auth) return NextResponse.json({ metrics: [], error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await auth.supabase
    .from('business_metrics')
    .select('*')
    .eq('model_id', id)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ metrics: [], error: error.message }, { status: 500 })
  return NextResponse.json({ metrics: (data ?? []).map(row => mapMetric(row as Record<string, unknown>)) })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ metric: null, error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parsed = MetricSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ metric: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: model, error: modelError } = await auth.supabase
      .from('business_models')
      .select('id, tenant_id, project_id')
      .eq('id', id)
      .single()

    if (modelError) return NextResponse.json({ metric: null, error: modelError.message }, { status: 404 })

    const nowIso = new Date().toISOString()
    const expression = { type: 'field_aggregation', fieldId: parsed.data.fieldId }
    const { data, error } = await auth.supabase
      .from('business_metrics')
      .upsert({
        model_id: id,
        entity_id: parsed.data.entityId ?? null,
        name: parsed.data.name.trim(),
        semantic_key: semanticKey(parsed.data.name),
        aggregation: parsed.data.aggregation,
        expression,
        unit: parsed.data.unit?.trim() || null,
        display_format: parsed.data.displayFormat?.trim() || null,
        updated_at: nowIso,
      }, { onConflict: 'model_id,semantic_key' })
      .select('*')
      .single()

    if (error) return NextResponse.json({ metric: null, error: error.message }, { status: 400 })
    const metric = mapMetric(data as Record<string, unknown>)

    await auth.supabase.from('audit_logs').insert({
      tenant_id: model.tenant_id,
      project_id: model.project_id,
      actor_user_id: auth.userId,
      action: 'business_model.updated',
      target_type: 'business_metric',
      target_id: metric.id,
      metadata: { modelId: id, metric: metric.name, aggregation: metric.aggregation, expression },
      created_at: nowIso,
    })

    return NextResponse.json({ metric }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ metric: null, error: message }, { status: 500 })
  }
}
