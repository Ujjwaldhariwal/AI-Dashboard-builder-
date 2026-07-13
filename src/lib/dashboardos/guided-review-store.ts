import type { SupabaseClient } from '@supabase/supabase-js'

import {
  applyGuidedReviewDecision,
  approveGuidedSemanticDraft,
  buildGuidedReviewState,
  type GuidedInferenceItem,
  type GuidedReviewDecision,
  type GuidedReviewState,
  type GuidedSemanticAssetLink,
} from '@/lib/dashboardos/guided-review'
import type { DataSourceColumnMetadata } from '@/types/data-source'
import type { BusinessEntityType, BusinessFieldRole, BusinessMetricAggregation, BusinessRelationshipType } from '@/types/semantic-model'

export interface GuidedProfileRecord {
  id: string
  tenantId: string
  projectId: string
  dataSourceId: string
  schemaHash: string | null
  state: GuidedReviewState
  createdAt: string
  updatedAt: string
}

function mapGuidedProfile(row: Record<string, unknown>): GuidedProfileRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    dataSourceId: String(row.data_source_id),
    schemaHash: typeof row.schema_hash === 'string' ? row.schema_hash : null,
    state: row.state as GuidedReviewState,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

function semanticKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '')
    .slice(0, 80)
}

function titleFromKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function singularToken(value: string) {
  return value.endsWith('s') ? value.slice(0, -1) : value
}

function sourceColumnKey(input: { schemaName: string; tableName: string; columnName: string }) {
  return `${input.schemaName}.${input.tableName}.${input.columnName}`
}

function columnRefFromItemId(itemId: string) {
  const cleanId = itemId.replace(/^rel:/, '')
  const parts = cleanId.split('.')
  if (parts.length < 3) return null
  const columnName = parts.pop()
  const tableName = parts.pop()
  const schemaName = parts.join('.')
  if (!schemaName || !tableName || !columnName) return null
  return { schemaName, tableName, columnName }
}

function tableKeyFromColumnRef(ref: { schemaName: string; tableName: string }) {
  return `${ref.schemaName}.${ref.tableName}`
}

function roleForItem(item: GuidedInferenceItem, hidden = false): BusinessFieldRole {
  if (hidden) return 'hidden'
  if (item.kind === 'date_time_column') return 'date'
  if (item.kind === 'id_candidate' || item.kind === 'foreign_key_candidate') return 'identifier'
  if (item.kind === 'numeric_measure') return 'metric_source'
  if (item.kind === 'category_field' || item.kind === 'status_field') return 'dimension'
  if (item.kind === 'sensitive_field') return 'hidden'
  return 'attribute'
}

function aggregationForMetric(label: string): BusinessMetricAggregation {
  if (/avg|average|mean|rate|duration|hours|score|load/i.test(label)) return 'avg'
  if (/count|customers|users|orders|tickets/i.test(label)) return 'count'
  return 'sum'
}

function entityTypeForTable(state: GuidedReviewState, tableKey: string): BusinessEntityType {
  if (state.profile.facts.some(item => item.id === tableKey)) return 'fact'
  if (state.profile.dimensions.some(item => item.id === tableKey)) return 'dimension'
  return 'dimension'
}

function itemAcceptedForAsset(item: GuidedInferenceItem, state: GuidedReviewState) {
  const decision = state.decisions.find(entry => entry.itemId === item.id)
  if (decision?.action === 'reject' || decision?.action === 'reject_relationship') return false
  if (decision?.action === 'approve' || decision?.action === 'confirm_relationship' || decision?.action === 'unhide') return true
  if (decision?.action === 'keep_hidden') return item.kind === 'sensitive_field'
  return !item.reviewRequired && item.confidence >= 70 && item.kind !== 'sensitive_field'
}

async function materializeGuidedSemanticModel({
  supabase,
  profile,
  actorUserId,
  nowIso,
}: {
  supabase: SupabaseClient
  profile: GuidedProfileRecord
  actorUserId: string | null
  nowIso: string
}): Promise<GuidedSemanticAssetLink> {
  if (profile.state.semanticDraft.needsReview.length > 0) {
    throw new Error('Review all guided findings before approving the semantic draft')
  }

  const existingAsset = profile.state.semanticAsset
  if (existingAsset?.modelId) return existingAsset

  const { data: columnRows, error: columnError } = await supabase
    .from('data_source_columns')
    .select('id, data_source_id, schema_name, table_name, column_name, data_type')
    .eq('tenant_id', profile.tenantId)
    .eq('project_id', profile.projectId)
    .eq('data_source_id', profile.dataSourceId)

  if (columnError) throw new Error(columnError.message)

  const columns = (columnRows ?? []) as Array<Record<string, unknown>>
  const columnByKey = new Map(columns.map(column => [
    sourceColumnKey({
      schemaName: String(column.schema_name ?? ''),
      tableName: String(column.table_name ?? ''),
      columnName: String(column.column_name ?? ''),
    }),
    column,
  ]))

  const modelName = 'Guided Semantic Model'
  const { data: previousVersions, error: versionsError } = await supabase
    .from('business_models')
    .select('version')
    .eq('tenant_id', profile.tenantId)
    .eq('project_id', profile.projectId)
    .eq('name', modelName)
    .order('version', { ascending: false })
    .limit(1)

  if (versionsError) throw new Error(versionsError.message)
  const modelVersion = Number((previousVersions?.[0] as Record<string, unknown> | undefined)?.version ?? 0) + 1

  const { data: modelRow, error: modelError } = await supabase
    .from('business_models')
    .insert({
      tenant_id: profile.tenantId,
      project_id: profile.projectId,
      name: modelName,
      description: `Materialized from approved guided semantic draft v${profile.state.semanticDraftVersion ?? 1}.`,
      status: 'review',
      version: modelVersion,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id, name, version')
    .single()

  if (modelError || !modelRow) throw new Error(modelError?.message ?? 'Unable to create guided semantic model')
  const modelId = String(modelRow.id)

  const entityRowsByTable = new Map<string, Record<string, unknown>>()
  const fieldRowsByItemId = new Map<string, Record<string, unknown>>()
  const fieldRowsBySourceKey = new Map<string, Record<string, unknown>>()
  const fieldCandidates = [
    ...profile.state.profile.identifiers,
    ...profile.state.profile.dates,
    ...profile.state.profile.categories,
    ...profile.state.profile.measures,
    ...profile.state.profile.sensitive,
  ]

  for (const candidate of fieldCandidates) {
    const ref = columnRefFromItemId(candidate.id)
    if (!ref || !itemAcceptedForAsset(candidate, profile.state)) continue
    const sourceColumn = columnByKey.get(sourceColumnKey(ref))
    if (!sourceColumn) continue

    const decision = profile.state.decisions.find(entry => entry.itemId === candidate.id)
    const hidden = candidate.kind === 'sensitive_field' && decision?.action !== 'unhide'
    const tableKey = tableKeyFromColumnRef(ref)
    let entity = entityRowsByTable.get(tableKey)
    if (!entity) {
      const { data: entityRow, error: entityError } = await supabase
        .from('business_entities')
        .upsert({
          model_id: modelId,
          name: titleFromKey(ref.tableName),
          semantic_key: semanticKey(ref.tableName),
          type: entityTypeForTable(profile.state, tableKey),
          description: `Guided entity from ${tableKey}.`,
          source_ref: {
            dataSourceId: profile.dataSourceId,
            schemaName: ref.schemaName,
            tableName: ref.tableName,
            guidedProfileId: profile.id,
          },
          updated_at: nowIso,
        }, { onConflict: 'model_id,semantic_key' })
        .select('*')
        .single()

      if (entityError || !entityRow) throw new Error(entityError?.message ?? `Unable to create entity for ${tableKey}`)
      entity = entityRow as Record<string, unknown>
      entityRowsByTable.set(tableKey, entity)
    }

    const role = roleForItem(candidate, hidden)
    const { data: fieldRow, error: fieldError } = await supabase
      .from('business_fields')
      .upsert({
        entity_id: String(entity.id),
        name: candidate.label,
        semantic_key: semanticKey(candidate.label),
        role,
        source_column: {
          dataSourceId: profile.dataSourceId,
          schemaName: ref.schemaName,
          tableName: ref.tableName,
          columnName: ref.columnName,
          dataType: String(sourceColumn.data_type ?? ''),
          guidedItemId: candidate.id,
        },
        is_filterable: role === 'dimension' || role === 'date',
        is_tooltip_field: role === 'dimension' || role === 'date' || role === 'attribute',
        default_aggregation: role === 'metric_source' ? aggregationForMetric(candidate.label) : null,
        updated_at: nowIso,
      }, { onConflict: 'entity_id,semantic_key' })
      .select('*')
      .single()

    if (fieldError || !fieldRow) throw new Error(fieldError?.message ?? `Unable to create field for ${candidate.label}`)
    const field = fieldRow as Record<string, unknown>
    fieldRowsByItemId.set(candidate.id, field)
    fieldRowsBySourceKey.set(sourceColumnKey(ref), field)
  }

  let metricCount = 0
  for (const measure of profile.state.profile.measures) {
    if (!itemAcceptedForAsset(measure, profile.state)) continue
    const field = fieldRowsByItemId.get(measure.id)
    if (!field) continue
    const { error: metricError } = await supabase
      .from('business_metrics')
      .upsert({
        model_id: modelId,
        entity_id: String(field.entity_id),
        name: measure.label,
        semantic_key: semanticKey(measure.label),
        aggregation: aggregationForMetric(measure.label),
        expression: { type: 'field_aggregation', fieldId: String(field.id), guidedItemId: measure.id },
        description: `Guided metric from approved semantic draft v${profile.state.semanticDraftVersion ?? 1}.`,
        updated_at: nowIso,
      }, { onConflict: 'model_id,semantic_key' })

    if (metricError) throw new Error(metricError.message)
    metricCount += 1
  }

  let relationshipCount = 0
  for (const relationship of profile.state.profile.relationships) {
    if (!itemAcceptedForAsset(relationship, profile.state)) continue
    const ref = columnRefFromItemId(relationship.id)
    if (!ref) continue
    const sourceField = fieldRowsBySourceKey.get(sourceColumnKey(ref))
    if (!sourceField) continue
    const targetToken = singularToken(normalizeToken(ref.columnName).replace(/_id$/, ''))
    const targetColumn = columns.find(column => {
      const tableToken = singularToken(normalizeToken(String(column.table_name ?? '')))
      const columnToken = normalizeToken(String(column.column_name ?? ''))
      return tableToken.includes(targetToken) && (columnToken === normalizeToken(ref.columnName) || columnToken === 'id')
    })
    if (!targetColumn) continue
    const targetRef = {
      schemaName: String(targetColumn.schema_name ?? ''),
      tableName: String(targetColumn.table_name ?? ''),
      columnName: String(targetColumn.column_name ?? ''),
    }
    const targetField = fieldRowsBySourceKey.get(sourceColumnKey(targetRef))
    if (!targetField) continue

    const { error: relationshipError } = await supabase
      .from('business_relationships')
      .insert({
        model_id: modelId,
        from_entity_id: String(sourceField.entity_id),
        to_entity_id: String(targetField.entity_id),
        type: 'many_to_one' satisfies BusinessRelationshipType,
        join_config: {
          leftFieldId: String(sourceField.id),
          rightFieldId: String(targetField.id),
          operator: '=',
          guidedItemId: relationship.id,
        },
        description: relationship.label,
        created_at: nowIso,
        updated_at: nowIso,
      })

    if (relationshipError) throw new Error(relationshipError.message)
    relationshipCount += 1
  }

  const { error: approveError } = await supabase
    .from('business_models')
    .update({ status: 'approved', approved_at: nowIso, updated_at: nowIso })
    .eq('id', modelId)

  if (approveError) throw new Error(approveError.message)

  await supabase
    .from('dashboard_projects')
    .update({ active_business_model_id: modelId, updated_at: nowIso })
    .eq('id', profile.projectId)
    .eq('tenant_id', profile.tenantId)

  await supabase.from('audit_logs').insert({
    tenant_id: profile.tenantId,
    project_id: profile.projectId,
    actor_user_id: actorUserId,
    action: 'guided_review.semantic_model_materialized',
    target_type: 'business_model',
    target_id: modelId,
    metadata: {
      guidedProfileId: profile.id,
      schemaHash: profile.schemaHash,
      semanticDraftVersion: profile.state.semanticDraftVersion ?? 1,
      fieldCount: fieldRowsByItemId.size,
      metricCount,
      relationshipCount,
    },
    created_at: nowIso,
  })

  return {
    modelId,
    modelName,
    modelVersion,
    materializedAt: nowIso,
    fieldCount: fieldRowsByItemId.size,
    metricCount,
    relationshipCount,
  }
}

export function columnsFromIntrospectionRows(input: {
  dataSourceId: string
  columns: Array<{
    schemaName: string
    tableName: string
    columnName: string
    ordinalPosition: number
    dataType: string
    udtName: string
    isNullable: boolean
    columnDefault?: string | null
  }>
}): DataSourceColumnMetadata[] {
  return input.columns.map(column => ({
    id: `${input.dataSourceId}:${column.schemaName}.${column.tableName}.${column.columnName}`,
    dataSourceId: input.dataSourceId,
    schemaName: column.schemaName,
    tableName: column.tableName,
    columnName: column.columnName,
    ordinalPosition: column.ordinalPosition,
    dataType: column.dataType,
    udtName: column.udtName,
    isNullable: column.isNullable,
    columnDefault: column.columnDefault ?? null,
    createdAt: new Date(0).toISOString(),
  }))
}

export async function persistGuidedProfileForColumns({
  supabase,
  tenantId,
  projectId,
  dataSourceId,
  schemaHash,
  columns,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  dataSourceId: string
  schemaHash: string
  columns: DataSourceColumnMetadata[]
}) {
  const nowIso = new Date().toISOString()
  const state = buildGuidedReviewState(columns, {
    dataSourceId,
    schemaHash,
    generatedAt: nowIso,
  })

  const { data, error } = await supabase
    .from('guided_schema_profiles')
    .upsert({
      tenant_id: tenantId,
      project_id: projectId,
      data_source_id: dataSourceId,
      schema_hash: schemaHash,
      state,
      created_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: 'data_source_id,schema_hash' })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  const profile = mapGuidedProfile(data as Record<string, unknown>)
  if (!profile.state.lineage?.schemaProfile.profileId) {
    const nextState: GuidedReviewState = {
      ...profile.state,
      lineage: profile.state.lineage
        ? {
          ...profile.state.lineage,
          schemaProfile: {
            ...profile.state.lineage.schemaProfile,
            profileId: profile.id,
          },
        }
        : undefined,
    }
    const { data: updated, error: updateError } = await supabase
      .from('guided_schema_profiles')
      .update({ state: nextState, updated_at: nowIso })
      .eq('id', profile.id)
      .select('*')
      .single()

    if (updateError) throw new Error(updateError.message)
    return mapGuidedProfile(updated as Record<string, unknown>)
  }
  return profile
}

export async function getLatestGuidedProfile({
  supabase,
  projectId,
  dataSourceId,
}: {
  supabase: SupabaseClient
  projectId: string
  dataSourceId?: string | null
}) {
  let query = supabase
    .from('guided_schema_profiles')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (dataSourceId) query = query.eq('data_source_id', dataSourceId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const row = data?.[0] as Record<string, unknown> | undefined
  return row ? mapGuidedProfile(row) : null
}

export async function updateGuidedProfileDecision({
  supabase,
  profileId,
  decision,
}: {
  supabase: SupabaseClient
  profileId: string
  decision: GuidedReviewDecision
}) {
  const { data: profileRow, error: profileError } = await supabase
    .from('guided_schema_profiles')
    .select('*')
    .eq('id', profileId)
    .single()

  if (profileError || !profileRow) throw new Error(profileError?.message ?? 'Guided profile not found')
  const profile = mapGuidedProfile(profileRow as Record<string, unknown>)
  const nextState = applyGuidedReviewDecision(profile.state, decision)
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('guided_schema_profiles')
    .update({ state: nextState, updated_at: nowIso })
    .eq('id', profileId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapGuidedProfile(data as Record<string, unknown>)
}

export async function approveGuidedProfileDraft({
  supabase,
  profileId,
  actorUserId,
}: {
  supabase: SupabaseClient
  profileId: string
  actorUserId: string | null
}) {
  const { data: profileRow, error: profileError } = await supabase
    .from('guided_schema_profiles')
    .select('*')
    .eq('id', profileId)
    .single()

  if (profileError || !profileRow) throw new Error(profileError?.message ?? 'Guided profile not found')
  const profile = mapGuidedProfile(profileRow as Record<string, unknown>)
  const nowIso = new Date().toISOString()
  const semanticAsset = await materializeGuidedSemanticModel({
    supabase,
    profile,
    actorUserId,
    nowIso,
  })
  const nextState = approveGuidedSemanticDraft(profile.state, actorUserId, nowIso, semanticAsset)

  const { data, error } = await supabase
    .from('guided_schema_profiles')
    .update({ state: nextState, updated_at: nowIso })
    .eq('id', profileId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapGuidedProfile(data as Record<string, unknown>)
}
