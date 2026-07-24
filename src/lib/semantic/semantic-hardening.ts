import type { SupabaseClient } from '@supabase/supabase-js'

export interface SemanticSelection {
  fieldIds: string[]
  metricIds: string[]
  relationshipIds: string[]
}

export interface SemanticReferenceValidation {
  ok: boolean
  error?: string
  fields: Record<string, unknown>[]
  metrics: Record<string, unknown>[]
  relationships: Record<string, unknown>[]
  // Runtime support fields include metric inputs and relationship join keys that
  // should not be projected as visible dataset columns.
  metricSourceFields: Record<string, unknown>[]
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function semanticSupportFieldIds({
  selectedFieldIds,
  metrics,
  relationships,
}: {
  selectedFieldIds: string[]
  metrics: Record<string, unknown>[]
  relationships: Record<string, unknown>[]
}) {
  const selected = new Set(selectedFieldIds)
  const metricFieldIds = metrics.map(metric => {
    const expression = asRecord(metric.expression)
    return typeof expression.fieldId === 'string' ? expression.fieldId : ''
  })
  const relationshipFieldIds = relationships.flatMap(relationship => {
    const joinConfig = asRecord(relationship.join_config)
    return [
      typeof joinConfig.leftFieldId === 'string'
        ? joinConfig.leftFieldId
        : typeof joinConfig.left_field_id === 'string'
          ? joinConfig.left_field_id
          : '',
      typeof joinConfig.rightFieldId === 'string'
        ? joinConfig.rightFieldId
        : typeof joinConfig.right_field_id === 'string'
          ? joinConfig.right_field_id
          : '',
    ]
  })
  return unique([...metricFieldIds, ...relationshipFieldIds]).filter(fieldId => !selected.has(fieldId))
}

function sourceColumn(field: Record<string, unknown>) {
  return asRecord(field.source_column)
}

function sourceColumnKey(column: Record<string, unknown>) {
  return [
    column.dataSourceId,
    column.schemaName,
    column.tableName,
    column.columnName,
  ].map(value => String(value ?? '')).join('.')
}

export async function validateSelectedSourceColumn({
  supabase,
  tenantId,
  projectId,
  dataSourceId,
  schemaName,
  tableName,
  columnName,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  dataSourceId: string
  schemaName: string
  tableName: string
  columnName: string
}): Promise<{ ok: true; relationId: string } | { ok: false; error: string }> {
  const label = `${dataSourceId}.${schemaName}.${tableName}.${columnName}`
  const { data: column, error } = await supabase
    .from('data_source_columns')
    .select('id, relation_id')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('data_source_id', dataSourceId)
    .eq('schema_name', schemaName)
    .eq('table_name', tableName)
    .eq('column_name', columnName)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!column) return { ok: false, error: `Mapped source column is missing from discovered schema: ${label}` }
  if (!column.relation_id) return { ok: false, error: `Confirm the analytics table scope before mapping: ${schemaName}.${tableName}` }

  const { data: selection, error: selectionError } = await supabase
    .from('data_source_relation_selections')
    .select('status')
    .eq('relation_id', column.relation_id)
    .maybeSingle()
  if (selectionError) throw new Error(selectionError.message)
  if (!selection || selection.status !== 'included') {
    return { ok: false, error: `Table is not included in the confirmed analytics scope: ${schemaName}.${tableName}` }
  }
  return { ok: true, relationId: String(column.relation_id) }
}

export function selectionFromRecord(value: unknown): SemanticSelection {
  const record = asRecord(value)
  const toStrings = (input: unknown) => Array.isArray(input)
    ? unique(input.filter(item => typeof item === 'string') as string[])
    : []

  return {
    fieldIds: toStrings(record.fieldIds),
    metricIds: toStrings(record.metricIds),
    relationshipIds: toStrings(record.relationshipIds),
  }
}

async function loadModelEntities(supabase: SupabaseClient, modelId: string) {
  const { data, error } = await supabase
    .from('business_entities')
    .select('id, model_id')
    .eq('model_id', modelId)

  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}

async function loadFieldsForEntityIds(supabase: SupabaseClient, entityIds: string[], fieldIds: string[]) {
  if (entityIds.length === 0 || fieldIds.length === 0) return []
  const { data, error } = await supabase
    .from('business_fields')
    .select('*')
    .in('entity_id', entityIds)
    .in('id', fieldIds)

  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}

export async function validateSourceColumnsForFields({
  supabase,
  tenantId,
  projectId,
  fields,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  fields: Record<string, unknown>[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const seen = new Set<string>()
  const sourceColumns = fields.map(field => sourceColumn(field)).filter(column => {
    const required = ['dataSourceId', 'schemaName', 'tableName', 'columnName']
    if (!required.every(key => typeof column[key] === 'string' && String(column[key]).length > 0)) return false
    const key = sourceColumnKey(column)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (sourceColumns.length !== fields.length || sourceColumns.length === 0) {
    return { ok: false, error: 'All semantic fields must map to discovered source columns' }
  }

  for (const column of sourceColumns) {
    const result = await validateSelectedSourceColumn({
      supabase,
      tenantId,
      projectId,
      dataSourceId: String(column.dataSourceId),
      schemaName: String(column.schemaName),
      tableName: String(column.tableName),
      columnName: String(column.columnName),
    })
    if (!result.ok) return result
  }

  return { ok: true }
}

export async function validateSemanticReferencesForModel({
  supabase,
  tenantId,
  projectId,
  modelId,
  selection,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  modelId: string
  selection: SemanticSelection
}): Promise<SemanticReferenceValidation> {
  const entities = await loadModelEntities(supabase, modelId)
  const entityIds = entities.map(entity => String(entity.id))
  const entityIdSet = new Set(entityIds)

  const [fieldsResult, metricsResult, relationshipsResult] = await Promise.all([
    loadFieldsForEntityIds(supabase, entityIds, selection.fieldIds),
    selection.metricIds.length > 0
      ? supabase.from('business_metrics').select('*').eq('model_id', modelId).in('id', selection.metricIds)
      : Promise.resolve({ data: [], error: null }),
    selection.relationshipIds.length > 0
      ? supabase.from('business_relationships').select('*').eq('model_id', modelId).in('id', selection.relationshipIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const fields = fieldsResult
  if (metricsResult.error) throw new Error(metricsResult.error.message)
  if (relationshipsResult.error) throw new Error(relationshipsResult.error.message)
  const metrics = (metricsResult.data ?? []) as Record<string, unknown>[]
  const relationships = (relationshipsResult.data ?? []) as Record<string, unknown>[]

  if (fields.length !== selection.fieldIds.length) {
    return { ok: false, error: 'Dataset contains fields outside the selected semantic model', fields, metrics, relationships, metricSourceFields: [] }
  }
  if (metrics.length !== selection.metricIds.length) {
    return { ok: false, error: 'Dataset contains metrics outside the selected semantic model', fields, metrics, relationships, metricSourceFields: [] }
  }
  if (relationships.length !== selection.relationshipIds.length) {
    return { ok: false, error: 'Dataset contains relationships outside the selected semantic model', fields, metrics, relationships, metricSourceFields: [] }
  }

  const selectedFieldIds = new Set(fields.map(field => String(field.id)))
  const supportFieldIds = semanticSupportFieldIds({
    selectedFieldIds: [...selectedFieldIds],
    metrics,
    relationships,
  })
  const metricSourceFields = supportFieldIds.length > 0
    ? await loadFieldsForEntityIds(supabase, entityIds, supportFieldIds)
    : []

  if (metricSourceFields.length !== supportFieldIds.length) {
    return { ok: false, error: 'Metric and relationship support fields must belong to the same semantic model', fields, metrics, relationships, metricSourceFields }
  }

  const allFields = [...fields, ...metricSourceFields]
  const allFieldById = new Map(allFields.map(field => [String(field.id), field]))
  for (const metric of metrics) {
    const entityId = typeof metric.entity_id === 'string' ? metric.entity_id : null
    const expression = asRecord(metric.expression)
    const fieldId = typeof expression.fieldId === 'string' ? expression.fieldId : null
    if (entityId && !entityIdSet.has(entityId)) {
      return { ok: false, error: 'Metric entity must belong to the same semantic model', fields, metrics, relationships, metricSourceFields }
    }
    if (!fieldId || !allFieldById.has(fieldId)) {
      return { ok: false, error: 'Metric source field is invalid or missing', fields, metrics, relationships, metricSourceFields }
    }
  }

  for (const relationship of relationships) {
    const joinConfig = asRecord(relationship.join_config)
    const fromEntityId = String(relationship.from_entity_id ?? '')
    const toEntityId = String(relationship.to_entity_id ?? '')
    const leftField = allFieldById.get(String(joinConfig.leftFieldId ?? ''))
    const rightField = allFieldById.get(String(joinConfig.rightFieldId ?? ''))
    if (!entityIdSet.has(fromEntityId) || !entityIdSet.has(toEntityId)) {
      return { ok: false, error: 'Relationship entities must belong to the same semantic model', fields, metrics, relationships, metricSourceFields }
    }
    if (!leftField || !rightField || String(leftField.entity_id) !== fromEntityId || String(rightField.entity_id) !== toEntityId) {
      return { ok: false, error: 'Relationship join fields must belong to their declared entities', fields, metrics, relationships, metricSourceFields }
    }
  }

  const sourceCheck = await validateSourceColumnsForFields({
    supabase,
    tenantId,
    projectId,
    fields: allFields,
  })
  if (!sourceCheck.ok) {
    return { ok: false, error: sourceCheck.error, fields, metrics, relationships, metricSourceFields }
  }

  return { ok: true, fields, metrics, relationships, metricSourceFields }
}

export async function validateBusinessModelForApproval({
  supabase,
  tenantId,
  projectId,
  modelId,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  modelId: string
}) {
  const entities = await loadModelEntities(supabase, modelId)
  if (entities.length === 0) return { ok: false, error: 'Map at least one entity before approval' }

  const entityIds = entities.map(entity => String(entity.id))
  const { data: fieldsData, error: fieldsError } = await supabase
    .from('business_fields')
    .select('*')
    .in('entity_id', entityIds)

  if (fieldsError) throw new Error(fieldsError.message)
  const fields = (fieldsData ?? []) as Record<string, unknown>[]
  if (fields.length === 0) return { ok: false, error: 'Map at least one field before approval' }

  return validateSourceColumnsForFields({ supabase, tenantId, projectId, fields })
}

export async function invalidateSemanticDependentsForDataSource({
  supabase,
  tenantId,
  projectId,
  dataSourceId,
  actorUserId = null,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  dataSourceId: string
  actorUserId?: string | null
}) {
  const { data: fields, error: fieldsError } = await supabase
    .from('business_fields')
    .select('id, entity_id, source_column')
    .filter('source_column->>dataSourceId', 'eq', dataSourceId)

  if (fieldsError) throw new Error(fieldsError.message)
  const entityIds = unique(((fields ?? []) as Record<string, unknown>[]).map(field => String(field.entity_id ?? '')))
  if (entityIds.length === 0) return { modelIds: [], datasetIds: [], chartIds: [] }

  const { data: entities, error: entitiesError } = await supabase
    .from('business_entities')
    .select('id, model_id')
    .in('id', entityIds)

  if (entitiesError) throw new Error(entitiesError.message)
  const modelIds = unique(((entities ?? []) as Record<string, unknown>[]).map(entity => String(entity.model_id ?? '')))
  if (modelIds.length === 0) return { modelIds: [], datasetIds: [], chartIds: [] }

  const nowIso = new Date().toISOString()
  await supabase
    .from('business_models')
    .update({ status: 'review', approved_at: null, updated_at: nowIso })
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('status', 'approved')
    .in('id', modelIds)

  const { data: datasets, error: datasetsError } = await supabase
    .from('semantic_datasets')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('status', 'published')
    .in('model_id', modelIds)

  if (datasetsError) throw new Error(datasetsError.message)
  const datasetIds = unique(((datasets ?? []) as Record<string, unknown>[]).map(dataset => String(dataset.id ?? '')))

  if (datasetIds.length > 0) {
    await supabase
      .from('semantic_datasets')
      .update({ status: 'draft', updated_at: nowIso })
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .in('id', datasetIds)

    await supabase
      .from('dashboard_chart_configs')
      .update({ validation_state: 'invalid', updated_at: nowIso })
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .in('dataset_id', datasetIds)
  }

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    project_id: projectId,
    actor_user_id: actorUserId,
    action: 'semantic_model.schema_drift_invalidated',
    target_type: 'data_source',
    target_id: dataSourceId,
    metadata: { modelIds, datasetIds },
    created_at: nowIso,
  })

  return { modelIds, datasetIds, chartIds: [] }
}

export async function deleteSemanticFieldsForDataSource({
  supabase,
  tenantId,
  projectId,
  dataSourceId,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  dataSourceId: string
}) {
  const { data: models, error: modelsError } = await supabase
    .from('business_models')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)

  if (modelsError) throw new Error(modelsError.message)
  const modelIds = unique(((models ?? []) as Record<string, unknown>[]).map(model => String(model.id ?? '')))
  if (modelIds.length === 0) return { deletedFieldCount: 0 }

  const { data: entities, error: entitiesError } = await supabase
    .from('business_entities')
    .select('id')
    .in('model_id', modelIds)

  if (entitiesError) throw new Error(entitiesError.message)
  const entityIds = unique(((entities ?? []) as Record<string, unknown>[]).map(entity => String(entity.id ?? '')))
  if (entityIds.length === 0) return { deletedFieldCount: 0 }

  const { data: fields, error: fieldsError } = await supabase
    .from('business_fields')
    .select('id')
    .in('entity_id', entityIds)
    .filter('source_column->>dataSourceId', 'eq', dataSourceId)

  if (fieldsError) throw new Error(fieldsError.message)
  const fieldIds = unique(((fields ?? []) as Record<string, unknown>[]).map(field => String(field.id ?? '')))
  if (fieldIds.length === 0) return { deletedFieldCount: 0 }

  const { error: deleteError } = await supabase
    .from('business_fields')
    .delete()
    .in('id', fieldIds)

  if (deleteError) throw new Error(deleteError.message)
  return { deletedFieldCount: fieldIds.length }
}
