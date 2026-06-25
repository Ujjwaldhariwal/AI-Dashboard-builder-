import { NextResponse } from 'next/server'
import { z } from 'zod'

import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { BusinessEntityType, BusinessFieldRole } from '@/types/semantic-model'

const FieldMappingSchema = z.object({
  entityName: z.string().min(2).max(120),
  entityType: z.enum(['fact', 'dimension', 'event', 'snapshot']).default('dimension'),
  fieldName: z.string().min(2).max(120),
  role: z.enum(['identifier', 'dimension', 'metric_source', 'date', 'attribute', 'hidden']).default('attribute'),
  dataSourceId: z.string().uuid(),
  schemaName: z.string().min(1).max(120),
  tableName: z.string().min(1).max(120),
  columnName: z.string().min(1).max(120),
  dataType: z.string().max(120).optional(),
  isFilterable: z.boolean().default(false),
  isTooltipField: z.boolean().default(false),
}).strict()

function semanticKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '')
    .slice(0, 80)
}

function mapEntity(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    modelId: String(row.model_id),
    name: String(row.name ?? ''),
    semanticKey: String(row.semantic_key ?? ''),
    type: String(row.type ?? 'dimension') as BusinessEntityType,
    description: typeof row.description === 'string' ? row.description : null,
    sourceRef: row.source_ref && typeof row.source_ref === 'object' ? row.source_ref : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

function mapField(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    entityId: String(row.entity_id),
    name: String(row.name ?? ''),
    semanticKey: String(row.semantic_key ?? ''),
    role: String(row.role ?? 'attribute') as BusinessFieldRole,
    sourceColumn: row.source_column && typeof row.source_column === 'object' ? row.source_column : null,
    isFilterable: Boolean(row.is_filterable),
    isTooltipField: Boolean(row.is_tooltip_field),
    displayFormat: typeof row.display_format === 'string' ? row.display_format : null,
    defaultAggregation: typeof row.default_aggregation === 'string' ? row.default_aggregation : null,
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
    if (!auth) {
      return NextResponse.json({ entities: [], error: 'Unauthorized' }, { status: 401 })
    }

    const { data: model, error: modelError } = await auth.supabase
      .from('business_models')
      .select('tenant_id, project_id')
      .eq('id', id)
      .single()

    if (modelError || !model) {
      return NextResponse.json({ entities: [], error: modelError?.message ?? 'Business model not found' }, { status: 404 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(model.tenant_id),
      projectId: String(model.project_id),
    })
    if (!access.ok) {
      return NextResponse.json({ entities: [], error: access.error }, { status: access.status })
    }

    const { data: entities, error: entitiesError } = await auth.supabase
      .from('business_entities')
      .select('*')
      .eq('model_id', id)
      .order('name', { ascending: true })

    if (entitiesError) {
      return NextResponse.json({ entities: [], error: entitiesError.message }, { status: 500 })
    }

    const entityIds = (entities ?? []).map(entity => String(entity.id))
    const { data: fields, error: fieldsError } = entityIds.length > 0
      ? await auth.supabase
          .from('business_fields')
          .select('*')
          .in('entity_id', entityIds)
          .order('name', { ascending: true })
      : { data: [], error: null }

    if (fieldsError) {
      return NextResponse.json({ entities: [], error: fieldsError.message }, { status: 500 })
    }

    const fieldsByEntity = new Map<string, ReturnType<typeof mapField>[]>()
    for (const field of fields ?? []) {
      const mapped = mapField(field as Record<string, unknown>)
      fieldsByEntity.set(mapped.entityId, [...(fieldsByEntity.get(mapped.entityId) ?? []), mapped])
    }

    return NextResponse.json({
      entities: (entities ?? []).map(entityRow => {
        const entity = mapEntity(entityRow as Record<string, unknown>)
        return { ...entity, fields: fieldsByEntity.get(entity.id) ?? [] }
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ entities: [], error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ entity: null, field: null, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = FieldMappingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ entity: null, field: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const { data: model, error: modelError } = await auth.supabase
      .from('business_models')
      .select('id, tenant_id, project_id')
      .eq('id', id)
      .single()

    if (modelError) {
      return NextResponse.json({ entity: null, field: null, error: modelError.message }, { status: 404 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(model.tenant_id),
      projectId: String(model.project_id),
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ entity: null, field: null, error: access.error }, { status: access.status })
    }

    const nowIso = new Date().toISOString()
    const entityKey = semanticKey(parsed.data.entityName)
    const fieldKey = semanticKey(parsed.data.fieldName)
    const sourceColumn = {
      dataSourceId: parsed.data.dataSourceId,
      schemaName: parsed.data.schemaName,
      tableName: parsed.data.tableName,
      columnName: parsed.data.columnName,
      dataType: parsed.data.dataType,
    }

    const { data: entityRow, error: entityError } = await auth.supabase
      .from('business_entities')
      .upsert({
        model_id: id,
        name: parsed.data.entityName.trim(),
        semantic_key: entityKey,
        type: parsed.data.entityType,
        source_ref: {
          dataSourceId: parsed.data.dataSourceId,
          schemaName: parsed.data.schemaName,
          tableName: parsed.data.tableName,
        },
        updated_at: nowIso,
      }, {
        onConflict: 'model_id,semantic_key',
      })
      .select('*')
      .single()

    if (entityError) {
      return NextResponse.json({ entity: null, field: null, error: entityError.message }, { status: 400 })
    }

    const entity = mapEntity(entityRow as Record<string, unknown>)
    const { data: fieldRow, error: fieldError } = await auth.supabase
      .from('business_fields')
      .upsert({
        entity_id: entity.id,
        name: parsed.data.fieldName.trim(),
        semantic_key: fieldKey,
        role: parsed.data.role,
        source_column: sourceColumn,
        is_filterable: parsed.data.isFilterable,
        is_tooltip_field: parsed.data.isTooltipField,
        updated_at: nowIso,
      }, {
        onConflict: 'entity_id,semantic_key',
      })
      .select('*')
      .single()

    if (fieldError) {
      return NextResponse.json({ entity, field: null, error: fieldError.message }, { status: 400 })
    }

    const field = mapField(fieldRow as Record<string, unknown>)
    await auth.supabase
      .from('audit_logs')
      .insert({
        tenant_id: model.tenant_id,
        project_id: model.project_id,
        actor_user_id: auth.userId,
        action: 'business_model.updated',
        target_type: 'business_field',
        target_id: field.id,
        metadata: {
          modelId: id,
          entity: entity.name,
          field: field.name,
          sourceColumn,
        },
        created_at: nowIso,
      })

    return NextResponse.json({ entity, field }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ entity: null, field: null, error: message }, { status: 500 })
  }
}
