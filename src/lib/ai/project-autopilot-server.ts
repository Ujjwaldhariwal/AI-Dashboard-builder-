import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { buildDeterministicChartSuiteProposal } from '@/lib/ai/chart-suite-copilot'
import { buildDeterministicDatasetProposal } from '@/lib/ai/dataset-copilot'
import {
  buildProjectAutopilotDashboardSlots,
  buildProjectAutopilotPlan,
  projectAutopilotDashboardName,
  projectAutopilotInstruction,
  type ProjectAutopilotSnapshot,
} from '@/lib/ai/project-autopilot'
import { buildDeterministicSemanticProposal } from '@/lib/ai/semantic-copilot'
import { validateSemanticReferencesForModel } from '@/lib/semantic/semantic-hardening'
import { validateDashboardChartConfig } from '@/lib/semantic/chart-config-validator'
import { analyzeDatasetChartOptions } from '@/lib/semantic/dataset-shape-analyzer'
import type { DashboardChartConfig } from '@/types/dashboard-chart'
import type { DataSourceColumnMetadata } from '@/types/data-source'
import type {
  ProjectAutopilotArtifacts,
  ProjectAutopilotBrief,
  ProjectAutopilotPlan,
  ProjectAutopilotRun,
  ProjectAutopilotStepKey,
} from '@/types/project-autopilot'
import type { BusinessModelStatus } from '@/types/semantic-model'
import type { SemanticDatasetStatus } from '@/types/semantic-dataset'

interface ProjectScope {
  tenantId: string
  projectId: string
}

interface RunContext extends ProjectScope {
  runId: string
  actorUserId: string
  brief: ProjectAutopilotBrief
  artifacts: ProjectAutopilotArtifacts
}

const AUTOPILOT_SEMANTIC_MODEL_NAME = 'Autopilot Business Model'

interface SemanticModelSummary {
  id: string
  name: string
  status: BusinessModelStatus
  fieldCount: number
  metricCount: number
}

export interface AutopilotSemanticApprovalDecision {
  approved: boolean
  reason: string
}

export function canAutopilotUseSemanticModel(model: SemanticModelSummary) {
  if (model.status === 'approved') {
    return model.fieldCount > 0 && model.metricCount > 0
  }
  return model.name === AUTOPILOT_SEMANTIC_MODEL_NAME
    && (model.status === 'draft' || model.status === 'review')
}

export function rebindProjectAutopilotArtifacts(
  artifacts: ProjectAutopilotArtifacts,
  semanticModelId?: string,
): ProjectAutopilotArtifacts {
  if (artifacts.semanticModelId === semanticModelId) return { ...artifacts }
  return semanticModelId ? { semanticModelId } : {}
}

export function nextProjectArtifactName(baseName: string, existingNames: string[]) {
  const occupied = new Set(existingNames.map(name => name.trim().toLowerCase()))
  if (!occupied.has(baseName.trim().toLowerCase())) return baseName.slice(0, 120)
  let suffix = 2
  while (occupied.has(`${baseName.trim().toLowerCase()} (${suffix})`)) suffix += 1
  return `${baseName.slice(0, 112).trim()} (${suffix})`
}

export function normalizeAutopilotRelationshipJoin({
  fromEntityId,
  toEntityId,
  leftFieldId,
  rightFieldId,
  fieldEntityById,
}: {
  fromEntityId: string
  toEntityId: string
  leftFieldId: string
  rightFieldId: string
  fieldEntityById: ReadonlyMap<string, string>
}) {
  const leftEntityId = fieldEntityById.get(leftFieldId)
  const rightEntityId = fieldEntityById.get(rightFieldId)
  if (leftEntityId === fromEntityId && rightEntityId === toEntityId) {
    return { action: 'keep' as const, leftFieldId, rightFieldId }
  }
  if (leftEntityId === toEntityId && rightEntityId === fromEntityId) {
    return { action: 'swap' as const, leftFieldId: rightFieldId, rightFieldId: leftFieldId }
  }
  return { action: 'drop' as const, leftFieldId, rightFieldId }
}

export function evaluateAutopilotSemanticApproval({
  modelName,
  fieldCount,
  metricCount,
  validation,
}: {
  modelName: string
  fieldCount: number
  metricCount: number
  validation: { ok: boolean; error?: string }
}): AutopilotSemanticApprovalDecision {
  if (modelName !== AUTOPILOT_SEMANTIC_MODEL_NAME) {
    return { approved: false, reason: 'Only an Autopilot-owned semantic model can be approved automatically.' }
  }
  if (fieldCount === 0) {
    return { approved: false, reason: 'No source-backed semantic fields were generated.' }
  }
  if (metricCount === 0) {
    return { approved: false, reason: 'No aggregatable metrics were detected for dashboard generation.' }
  }
  if (!validation.ok) {
    return { approved: false, reason: validation.error ?? 'Semantic reference validation failed.' }
  }
  return { approved: true, reason: 'All generated fields, metrics, joins, and source columns passed governed validation.' }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function semanticKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '').slice(0, 80)
}

function mapColumn(row: Record<string, unknown>): DataSourceColumnMetadata {
  return {
    id: String(row.id),
    dataSourceId: String(row.data_source_id),
    relationId: typeof row.relation_id === 'string' ? row.relation_id : null,
    schemaName: String(row.schema_name ?? ''),
    tableName: String(row.table_name ?? ''),
    columnName: String(row.column_name ?? ''),
    ordinalPosition: Number(row.ordinal_position ?? 0),
    dataType: String(row.data_type ?? ''),
    udtName: String(row.udt_name ?? ''),
    isNullable: Boolean(row.is_nullable),
    columnDefault: typeof row.column_default === 'string' ? row.column_default : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export function projectAutopilotIdempotencyKey(projectId: string, brief: ProjectAutopilotBrief) {
  return createHash('sha256').update(JSON.stringify({ projectId, brief })).digest('hex')
}

export function mapProjectAutopilotRun(row: Record<string, unknown>): ProjectAutopilotRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : null,
    status: String(row.status) as ProjectAutopilotRun['status'],
    currentStep: String(row.current_step) as ProjectAutopilotStepKey,
    brief: row.brief as ProjectAutopilotBrief,
    plan: row.plan as ProjectAutopilotPlan,
    artifacts: record(row.artifacts) as ProjectAutopilotArtifacts,
    errorCode: typeof row.error_code === 'string' ? row.error_code : null,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

async function selectedRelationIds(supabase: SupabaseClient, scope: ProjectScope) {
  const { data: availableRelations, error: relationError } = await supabase
    .from('data_source_relations')
    .select('id')
    .eq('tenant_id', scope.tenantId)
    .eq('project_id', scope.projectId)
    .eq('is_available', true)
  if (relationError) throw new Error(relationError.message)
  const availableRelationIds = (availableRelations ?? []).map(row => String(row.id))
  if (availableRelationIds.length === 0) return []

  const { data, error } = await supabase
    .from('data_source_relation_selections')
    .select('relation_id')
    .eq('tenant_id', scope.tenantId)
    .eq('project_id', scope.projectId)
    .eq('status', 'included')
    .in('relation_id', availableRelationIds)
  if (error) throw new Error(error.message)
  return (data ?? []).map(row => String(row.relation_id))
}

async function selectedColumns(supabase: SupabaseClient, scope: ProjectScope) {
  const relationIds = await selectedRelationIds(supabase, scope)
  if (relationIds.length === 0) return { relationIds, columns: [] as DataSourceColumnMetadata[] }
  const { data, error } = await supabase
    .from('data_source_columns')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('project_id', scope.projectId)
    .in('relation_id', relationIds)
    .order('table_name')
    .order('ordinal_position')
  if (error) throw new Error(error.message)
  return { relationIds, columns: (data ?? []).map(row => mapColumn(row as Record<string, unknown>)) }
}

async function loadSemanticModelById(
  supabase: SupabaseClient,
  scope: ProjectScope,
  modelId: string,
) {
  const { data, error } = await supabase
    .from('business_models')
    .select('id, name, status, updated_at')
    .eq('tenant_id', scope.tenantId)
    .eq('project_id', scope.projectId)
    .eq('id', modelId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const { data: entities, error: entityError } = await supabase.from('business_entities').select('id').eq('model_id', data.id)
  if (entityError) throw new Error(entityError.message)
  const entityIds = (entities ?? []).map(entity => String(entity.id))
  const [fieldResult, metricResult] = await Promise.all([
    entityIds.length
      ? supabase.from('business_fields').select('id', { count: 'exact', head: true }).in('entity_id', entityIds)
      : Promise.resolve({ count: 0, error: null }),
    supabase.from('business_metrics').select('id', { count: 'exact', head: true }).eq('model_id', data.id),
  ])
  if (fieldResult.error || metricResult.error) throw new Error(fieldResult.error?.message ?? metricResult.error?.message)
  return {
    id: String(data.id),
    name: String(data.name),
    status: String(data.status) as BusinessModelStatus,
    fieldCount: fieldResult.count ?? 0,
    metricCount: metricResult.count ?? 0,
  } satisfies SemanticModelSummary
}

async function loadActiveSemanticModel(supabase: SupabaseClient, scope: ProjectScope) {
  const { data, error } = await supabase
    .from('dashboard_projects')
    .select('active_business_model_id')
    .eq('tenant_id', scope.tenantId)
    .eq('id', scope.projectId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const modelId = typeof data?.active_business_model_id === 'string' ? data.active_business_model_id : null
  return modelId ? loadSemanticModelById(supabase, scope, modelId) : null
}

async function loadLatestAutopilotSemanticModel(supabase: SupabaseClient, scope: ProjectScope) {
  const { data, error } = await supabase
    .from('business_models')
    .select('id')
    .eq('tenant_id', scope.tenantId)
    .eq('project_id', scope.projectId)
    .eq('name', AUTOPILOT_SEMANTIC_MODEL_NAME)
    .in('status', ['draft', 'review', 'approved'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? loadSemanticModelById(supabase, scope, String(data.id)) : null
}

async function resolveProjectSemanticModel(
  supabase: SupabaseClient,
  scope: ProjectScope,
  preferredId?: string,
) {
  const active = await loadActiveSemanticModel(supabase, scope)
  if (active && active.status === 'approved' && canAutopilotUseSemanticModel(active)) return active

  if (preferredId && preferredId !== active?.id) {
    const preferred = await loadSemanticModelById(supabase, scope, preferredId)
    if (preferred && canAutopilotUseSemanticModel(preferred)) return preferred
  }

  const generated = await loadLatestAutopilotSemanticModel(supabase, scope)
  return generated && canAutopilotUseSemanticModel(generated) ? generated : null
}

async function loadDataset(supabase: SupabaseClient, scope: ProjectScope, modelId?: string, preferredId?: string) {
  let query = supabase
    .from('semantic_datasets')
    .select('id, status, model_id, selection, updated_at')
    .eq('tenant_id', scope.tenantId)
    .eq('project_id', scope.projectId)
  if (preferredId) query = query.eq('id', preferredId)
  if (modelId) query = query.eq('model_id', modelId)
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? {
    id: String(data.id),
    status: String(data.status) as SemanticDatasetStatus,
    modelId: String(data.model_id),
    selection: record(data.selection),
  } : null
}

export async function loadProjectAutopilotSnapshot({
  supabase,
  tenantId,
  projectId,
  artifacts = {},
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  artifacts?: ProjectAutopilotArtifacts
}): Promise<ProjectAutopilotSnapshot> {
  const scope = { tenantId, projectId }
  const [{ relationIds, columns }, semanticModel] = await Promise.all([
    selectedColumns(supabase, scope),
    resolveProjectSemanticModel(supabase, scope, artifacts.semanticModelId),
  ])
  const artifactsMatchModel = Boolean(semanticModel && artifacts.semanticModelId === semanticModel.id)
  const dataset = semanticModel
    ? await loadDataset(supabase, scope, semanticModel.id, artifactsMatchModel ? artifacts.datasetId : undefined)
    : null
  const { count, error } = dataset
    ? await supabase
        .from('dashboard_chart_configs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
        .eq('dataset_id', dataset.id)
        .eq('validation_state', 'valid')
        .neq('status', 'archived')
    : { count: 0, error: null }
  if (error) throw new Error(error.message)
  let dashboard: ProjectAutopilotSnapshot['dashboard'] = null
  if (artifactsMatchModel && artifacts.dashboardId && artifacts.dashboardVersionId) {
    const { data: version, error: versionError } = await supabase
      .from('dashboard_versions')
      .select('id, dashboard_id, status')
      .eq('id', artifacts.dashboardVersionId)
      .eq('dashboard_id', artifacts.dashboardId)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .in('status', ['draft', 'published'])
      .maybeSingle()
    if (versionError) throw new Error(versionError.message)
    if (version) {
      const { count: slotCount, error: slotError } = await supabase
        .from('dashboard_chart_slots')
        .select('id', { count: 'exact', head: true })
        .eq('version_id', artifacts.dashboardVersionId)
        .eq('dashboard_id', artifacts.dashboardId)
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
      if (slotError) throw new Error(slotError.message)
      dashboard = {
        id: artifacts.dashboardId,
        versionId: artifacts.dashboardVersionId,
        slotCount: slotCount ?? 0,
        status: String((version as Record<string, unknown>).status) as 'draft' | 'published',
      }
    }
  }
  return {
    selectedRelationCount: relationIds.length,
    selectedColumnCount: columns.length,
    semanticModel,
    dataset,
    chartCount: count ?? 0,
    dashboard,
  }
}

export async function persistProjectAutopilotPlan({
  supabase,
  runId,
  tenantId,
  projectId,
  plan,
  artifacts,
  errorCode = null,
  errorMessage = null,
}: {
  supabase: SupabaseClient
  runId: string
  tenantId: string
  projectId: string
  plan: ProjectAutopilotPlan
  artifacts: ProjectAutopilotArtifacts
  errorCode?: string | null
  errorMessage?: string | null
}) {
  const nowIso = new Date().toISOString()
  const runStatus = errorMessage ? 'failed' : plan.status
  const { data, error } = await supabase
    .from('project_autopilot_runs')
    .update({
      status: runStatus,
      current_step: plan.currentStep,
      plan,
      artifacts,
      error_code: errorCode,
      error_message: errorMessage,
      started_at: nowIso,
      completed_at: runStatus === 'succeeded' ? nowIso : null,
      updated_at: nowIso,
    })
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Unable to update Autopilot run')
  const stepRows = plan.steps.map(item => ({
    run_id: runId,
    tenant_id: tenantId,
    project_id: projectId,
    step_key: item.key,
    status: errorMessage && item.key === plan.currentStep ? 'failed' : item.status,
    input: { automatic: item.automatic },
    output: { detail: item.detail, href: item.href },
    error_message: errorMessage && item.key === plan.currentStep ? errorMessage : null,
    completed_at: item.status === 'succeeded' ? nowIso : null,
    updated_at: nowIso,
  }))
  const { error: stepError } = await supabase
    .from('project_autopilot_steps')
    .upsert(stepRows, { onConflict: 'run_id,step_key' })
  if (stepError) throw new Error(stepError.message)
  return mapProjectAutopilotRun(data as Record<string, unknown>)
}

async function ensureDraftSemanticModel(supabase: SupabaseClient, context: RunContext) {
  const preferred = context.artifacts.semanticModelId
    ? await loadSemanticModelById(supabase, context, context.artifacts.semanticModelId)
    : null
  if (
    preferred?.name === AUTOPILOT_SEMANTIC_MODEL_NAME
    && (preferred.status === 'draft' || preferred.status === 'review')
  ) return preferred.id

  const existing = await loadLatestAutopilotSemanticModel(supabase, context)
  if (existing && (existing.status === 'draft' || existing.status === 'review')) return existing.id
  const { data: latestVersion, error: versionError } = await supabase
    .from('business_models')
    .select('version')
    .eq('tenant_id', context.tenantId)
    .eq('project_id', context.projectId)
    .eq('name', AUTOPILOT_SEMANTIC_MODEL_NAME)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (versionError) throw new Error(versionError.message)
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('business_models')
    .insert({
      tenant_id: context.tenantId,
      project_id: context.projectId,
      name: AUTOPILOT_SEMANTIC_MODEL_NAME,
      description: `Generated for: ${context.brief.objective}`.slice(0, 500),
      status: 'draft',
      version: Number(latestVersion?.version ?? 0) + 1,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Unable to create semantic model')
  return String(data.id)
}

async function materializeSemanticModel(supabase: SupabaseClient, context: RunContext, modelId: string) {
  const { columns } = await selectedColumns(supabase, context)
  if (columns.length === 0) throw new Error('No selected schema columns are available')
  const proposal = buildDeterministicSemanticProposal(columns, context.brief.objective)
  const columnById = new Map(columns.map(column => [column.id, column]))
  const materialized = new Map<string, { entityId: string; fieldId: string }>()
  const nowIso = new Date().toISOString()

  for (const mapping of proposal.mappings) {
    const column = columnById.get(mapping.columnId)
    if (!column) continue
    const { data: entity, error: entityError } = await supabase
      .from('business_entities')
      .upsert({
        model_id: modelId,
        name: mapping.entityName,
        semantic_key: semanticKey(mapping.entityName),
        type: mapping.entityType,
        source_ref: { dataSourceId: column.dataSourceId, schemaName: column.schemaName, tableName: column.tableName },
        updated_at: nowIso,
      }, { onConflict: 'model_id,semantic_key' })
      .select('id')
      .single()
    if (entityError || !entity) throw new Error(entityError?.message ?? 'Unable to materialize semantic entity')
    const entityId = String(entity.id)
    const { data: field, error: fieldError } = await supabase
      .from('business_fields')
      .upsert({
        entity_id: entityId,
        name: mapping.fieldName,
        semantic_key: semanticKey(mapping.fieldName),
        role: mapping.role,
        source_column: {
          dataSourceId: column.dataSourceId,
          schemaName: column.schemaName,
          tableName: column.tableName,
          columnName: column.columnName,
          dataType: column.dataType,
        },
        is_filterable: mapping.isFilterable,
        is_tooltip_field: mapping.isTooltipField,
        updated_at: nowIso,
      }, { onConflict: 'entity_id,semantic_key' })
      .select('id')
      .single()
    if (fieldError || !field) throw new Error(fieldError?.message ?? 'Unable to materialize semantic field')
    const fieldId = String(field.id)
    materialized.set(mapping.columnId, { entityId, fieldId })
    if (mapping.metric) {
      const { error: metricError } = await supabase.from('business_metrics').upsert({
        model_id: modelId,
        entity_id: entityId,
        name: mapping.metric.name,
        semantic_key: semanticKey(mapping.metric.name),
        aggregation: mapping.metric.aggregation,
        expression: { type: 'field_aggregation', fieldId },
        unit: mapping.metric.unit ?? null,
        display_format: mapping.metric.displayFormat ?? null,
        updated_at: nowIso,
      }, { onConflict: 'model_id,semantic_key' })
      if (metricError) throw new Error(metricError.message)
    }
  }

  const { data: existingRelationships, error: existingError } = await supabase
    .from('business_relationships')
    .select('from_entity_id, to_entity_id, join_config')
    .eq('model_id', modelId)
  if (existingError) throw new Error(existingError.message)
  const existingKeys = new Set((existingRelationships ?? []).map(row => {
    const join = record(row.join_config)
    return `${row.from_entity_id}:${row.to_entity_id}:${join.leftFieldId}:${join.rightFieldId}`
  }))
  for (const relationship of proposal.relationships) {
    const from = materialized.get(relationship.fromColumnId)
    const to = materialized.get(relationship.toColumnId)
    if (!from || !to || from.entityId === to.entityId) continue
    const key = `${from.entityId}:${to.entityId}:${from.fieldId}:${to.fieldId}`
    if (existingKeys.has(key)) continue
    const { error } = await supabase.from('business_relationships').insert({
      model_id: modelId,
      from_entity_id: from.entityId,
      to_entity_id: to.entityId,
      type: relationship.type,
      join_config: { leftFieldId: from.fieldId, rightFieldId: to.fieldId, operator: '=' },
      description: relationship.reason,
      created_at: nowIso,
      updated_at: nowIso,
    })
    if (error) throw new Error(error.message)
  }
  const { error: statusError } = await supabase
    .from('business_models')
    .update({ status: 'review', updated_at: nowIso })
    .eq('id', modelId)
    .eq('tenant_id', context.tenantId)
    .eq('project_id', context.projectId)
  if (statusError) throw new Error(statusError.message)
  return { mappingCount: materialized.size, relationshipCount: proposal.relationships.length }
}

async function semanticEvidence(supabase: SupabaseClient, modelId: string) {
  const { data: entities, error: entityError } = await supabase.from('business_entities').select('id, name').eq('model_id', modelId)
  if (entityError) throw new Error(entityError.message)
  const entityById = new Map((entities ?? []).map(row => [String(row.id), String(row.name)]))
  const entityIds = [...entityById.keys()]
  const [fieldResult, metricResult, relationshipResult] = await Promise.all([
    entityIds.length ? supabase.from('business_fields').select('*').in('entity_id', entityIds) : Promise.resolve({ data: [], error: null }),
    supabase.from('business_metrics').select('*').eq('model_id', modelId),
    supabase.from('business_relationships').select('*').eq('model_id', modelId),
  ])
  const error = fieldResult.error ?? metricResult.error ?? relationshipResult.error
  if (error) throw new Error(error.message)
  const rawFields = (fieldResult.data ?? []) as Record<string, unknown>[]
  const rawMetrics = (metricResult.data ?? []) as Record<string, unknown>[]
  const fields = rawFields.map(field => ({
    id: String(field.id),
    entityId: String(field.entity_id),
    entityName: entityById.get(String(field.entity_id)) ?? 'Entity',
    name: String(field.name),
    role: String(field.role) as 'identifier' | 'dimension' | 'metric_source' | 'date' | 'attribute' | 'hidden',
  }))
  const metrics = rawMetrics.map(metric => ({
    id: String(metric.id),
    entityId: typeof metric.entity_id === 'string' ? metric.entity_id : null,
    name: String(metric.name),
    aggregation: String(metric.aggregation) as 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct' | 'ratio' | 'custom',
    description: typeof metric.description === 'string' ? metric.description : null,
  }))
  const relationships = ((relationshipResult.data ?? []) as Record<string, unknown>[]).map(relationship => ({
    id: String(relationship.id),
    fromEntityId: String(relationship.from_entity_id),
    toEntityId: String(relationship.to_entity_id),
    type: String(relationship.type) as 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many',
    description: typeof relationship.description === 'string' ? relationship.description : null,
  }))
  return { fields, metrics, relationships, rawFields, rawMetrics }
}

async function repairAutopilotRelationships(supabase: SupabaseClient, modelId: string) {
  const { data: entities, error: entityError } = await supabase
    .from('business_entities')
    .select('id')
    .eq('model_id', modelId)
  if (entityError) throw new Error(entityError.message)
  const entityIds = (entities ?? []).map(entity => String(entity.id))
  const [fieldResult, relationshipResult] = await Promise.all([
    entityIds.length
      ? supabase.from('business_fields').select('id, entity_id').in('entity_id', entityIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('business_relationships').select('id, from_entity_id, to_entity_id, join_config').eq('model_id', modelId),
  ])
  const error = fieldResult.error ?? relationshipResult.error
  if (error) throw new Error(error.message)

  const fieldEntityById = new Map(
    (fieldResult.data ?? []).map(field => [String(field.id), String(field.entity_id)]),
  )
  let swapped = 0
  let dropped = 0
  for (const relationship of relationshipResult.data ?? []) {
    const join = record(relationship.join_config)
    const normalized = normalizeAutopilotRelationshipJoin({
      fromEntityId: String(relationship.from_entity_id),
      toEntityId: String(relationship.to_entity_id),
      leftFieldId: String(join.leftFieldId ?? ''),
      rightFieldId: String(join.rightFieldId ?? ''),
      fieldEntityById,
    })
    if (normalized.action === 'keep') continue
    if (normalized.action === 'swap') {
      const { error: updateError } = await supabase
        .from('business_relationships')
        .update({
          join_config: {
            ...join,
            leftFieldId: normalized.leftFieldId,
            rightFieldId: normalized.rightFieldId,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', relationship.id)
        .eq('model_id', modelId)
      if (updateError) throw new Error(updateError.message)
      swapped += 1
      continue
    }
    const { error: deleteError } = await supabase
      .from('business_relationships')
      .delete()
      .eq('id', relationship.id)
      .eq('model_id', modelId)
    if (deleteError) throw new Error(deleteError.message)
    dropped += 1
  }
  return { swapped, dropped }
}

async function validateAndApproveAutopilotSemanticModel(
  supabase: SupabaseClient,
  context: RunContext,
  modelId: string,
): Promise<AutopilotSemanticApprovalDecision> {
  const { data: model, error: modelError } = await supabase
    .from('business_models')
    .select('id, name, status, version')
    .eq('id', modelId)
    .eq('tenant_id', context.tenantId)
    .eq('project_id', context.projectId)
    .single()
  if (modelError || !model) throw new Error(modelError?.message ?? 'Autopilot semantic model not found')
  if (model.status === 'approved') {
    return { approved: true, reason: 'The Autopilot semantic model is already approved.' }
  }
  if (model.status !== 'draft' && model.status !== 'review') {
    return { approved: false, reason: `Semantic model status ${String(model.status)} cannot be approved automatically.` }
  }

  const relationshipRepairs = model.name === AUTOPILOT_SEMANTIC_MODEL_NAME
    ? await repairAutopilotRelationships(supabase, modelId)
    : { swapped: 0, dropped: 0 }
  const evidence = await semanticEvidence(supabase, modelId)
  const validation = await validateSemanticReferencesForModel({
    supabase,
    tenantId: context.tenantId,
    projectId: context.projectId,
    modelId,
    selection: {
      fieldIds: evidence.fields.map(field => field.id),
      metricIds: evidence.metrics.map(metric => metric.id),
      relationshipIds: evidence.relationships.map(relationship => relationship.id),
    },
  })
  const decision = evaluateAutopilotSemanticApproval({
    modelName: String(model.name),
    fieldCount: evidence.fields.length,
    metricCount: evidence.metrics.length,
    validation,
  })
  if (!decision.approved) return decision

  const nowIso = new Date().toISOString()
  const { error: approvalError } = await supabase
    .from('business_models')
    .update({ status: 'approved', approved_at: nowIso, updated_at: nowIso })
    .eq('id', modelId)
    .eq('tenant_id', context.tenantId)
    .eq('project_id', context.projectId)
    .in('status', ['draft', 'review'])
  if (approvalError) throw new Error(approvalError.message)

  const { error: projectError } = await supabase
    .from('dashboard_projects')
    .update({ active_business_model_id: modelId, updated_at: nowIso })
    .eq('id', context.projectId)
    .eq('tenant_id', context.tenantId)
  if (projectError) throw new Error(projectError.message)

  await supabase.from('audit_logs').insert({
    tenant_id: context.tenantId,
    project_id: context.projectId,
    actor_user_id: context.actorUserId,
    action: 'business_model.approved',
    target_type: 'business_model',
    target_id: modelId,
    metadata: {
      source: 'project_autopilot',
      validation: 'governed_semantic_references',
      version: Number(model.version ?? 1),
      fieldCount: evidence.fields.length,
      metricCount: evidence.metrics.length,
      relationshipCount: evidence.relationships.length,
      relationshipRepairs,
    },
    created_at: nowIso,
  })

  return decision
}

async function ensurePublishedDataset(supabase: SupabaseClient, context: RunContext, modelId: string) {
  const existing = await loadDataset(supabase, context, modelId, context.artifacts.datasetId)
  if (existing?.status === 'published') {
    const existingSelection = record(existing.selection)
    const existingValidation = await validateSemanticReferencesForModel({
      supabase,
      tenantId: context.tenantId,
      projectId: context.projectId,
      modelId,
      selection: {
        fieldIds: strings(existingSelection.fieldIds),
        metricIds: strings(existingSelection.metricIds),
        relationshipIds: strings(existingSelection.relationshipIds),
      },
    })
    if (existingValidation.ok) return existing.id
  }
  const evidence = await semanticEvidence(supabase, modelId)
  const proposal = buildDeterministicDatasetProposal({ instruction: context.brief.objective, ...evidence })
  const selection = {
    fieldIds: proposal.fieldIds,
    metricIds: proposal.metricIds,
    relationshipIds: proposal.relationshipIds,
  }
  const validation = await validateSemanticReferencesForModel({
    supabase,
    tenantId: context.tenantId,
    projectId: context.projectId,
    modelId,
    selection,
  })
  if (!validation.ok) throw new Error(validation.error)
  const { data: namedDatasets, error: nameError } = await supabase
    .from('semantic_datasets')
    .select('name')
    .eq('tenant_id', context.tenantId)
    .eq('project_id', context.projectId)
  if (nameError) throw new Error(nameError.message)
  const datasetName = nextProjectArtifactName(
    proposal.name,
    (namedDatasets ?? []).map(row => String(row.name)),
  )
  const nowIso = new Date().toISOString()
  if (existing) {
    const { error } = await supabase.from('semantic_datasets').update({ selection, status: 'published', updated_at: nowIso }).eq('id', existing.id)
    if (error) throw new Error(error.message)
    const { error: chartInvalidationError } = await supabase
      .from('dashboard_chart_configs')
      .update({
        validation_state: 'invalid',
        last_validated_at: nowIso,
        updated_at: nowIso,
      })
      .eq('tenant_id', context.tenantId)
      .eq('project_id', context.projectId)
      .eq('dataset_id', existing.id)
      .neq('status', 'archived')
    if (chartInvalidationError) throw new Error(chartInvalidationError.message)
    return existing.id
  }
  const { data, error } = await supabase.from('semantic_datasets').insert({
    tenant_id: context.tenantId,
    project_id: context.projectId,
    model_id: modelId,
    name: datasetName,
    description: proposal.description,
    status: 'published',
    selection,
    cache_policy: { ttlSeconds: 300 },
    created_at: nowIso,
    updated_at: nowIso,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Unable to create governed dataset')
  return String(data.id)
}

async function ensureChartSuite(supabase: SupabaseClient, context: RunContext, datasetId: string) {
  const { data: dataset, error: datasetError } = await supabase
    .from('semantic_datasets')
    .select('id, name, selection')
    .eq('id', datasetId)
    .eq('tenant_id', context.tenantId)
    .eq('project_id', context.projectId)
    .single()
  if (datasetError || !dataset) throw new Error(datasetError?.message ?? 'Autopilot dataset not found')
  const selection = record(dataset.selection)
  const fieldIds = strings(selection.fieldIds)
  const metricIds = strings(selection.metricIds)
  const [fieldResult, metricResult, chartResult] = await Promise.all([
    fieldIds.length ? supabase.from('business_fields').select('*').in('id', fieldIds) : Promise.resolve({ data: [], error: null }),
    metricIds.length ? supabase.from('business_metrics').select('*').in('id', metricIds) : Promise.resolve({ data: [], error: null }),
    supabase
      .from('dashboard_chart_configs')
      .select('id, template_id, encoding')
      .eq('dataset_id', datasetId)
      .eq('tenant_id', context.tenantId)
      .eq('project_id', context.projectId)
      .eq('validation_state', 'valid')
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(context.brief.chartCount),
  ])
  const error = fieldResult.error ?? metricResult.error ?? chartResult.error
  if (error) throw new Error(error.message)
  const rawFields = (fieldResult.data ?? []) as Record<string, unknown>[]
  const rawMetrics = (metricResult.data ?? []) as Record<string, unknown>[]
  const existingRows = (chartResult.data ?? []) as Record<string, unknown>[]
  const reusableRows = existingRows.filter(chart => validateDashboardChartConfig({
    templateId: String(chart.template_id),
    encoding: record(chart.encoding) as unknown as DashboardChartConfig['encoding'],
    fields: rawFields,
    metrics: rawMetrics,
  }).state === 'valid')
  const rejectedIds = existingRows
    .filter(chart => !reusableRows.includes(chart))
    .map(chart => String(chart.id))
  if (rejectedIds.length > 0) {
    const nowIso = new Date().toISOString()
    const { error: invalidationError } = await supabase
      .from('dashboard_chart_configs')
      .update({ validation_state: 'invalid', last_validated_at: nowIso, updated_at: nowIso })
      .in('id', rejectedIds)
      .eq('tenant_id', context.tenantId)
      .eq('project_id', context.projectId)
    if (invalidationError) throw new Error(invalidationError.message)
  }
  const existingIds = reusableRows.map(row => String(row.id))
  const remaining = Math.max(0, context.brief.chartCount - existingIds.length)
  if (remaining === 0) return existingIds
  const fields = rawFields.map(field => ({ id: String(field.id), name: String(field.name), role: String(field.role) }))
  const metrics = rawMetrics.map(metric => ({ id: String(metric.id), name: String(metric.name), aggregation: String(metric.aggregation) }))
  const allowedTemplateIds = analyzeDatasetChartOptions({ fields: rawFields, metrics: rawMetrics }).compatibility
    .filter(item => item.status !== 'blocked')
    .map(item => item.template.id)
  const instruction = `${projectAutopilotInstruction(context.brief)} Create exactly ${remaining} additional charts.`
  const proposal = buildDeterministicChartSuiteProposal({
    instruction,
    datasetName: String(dataset.name),
    fields,
    metrics,
    allowedTemplateIds,
  })
  const charts = proposal.charts.slice(0, remaining).map(chart => {
    const validation = validateDashboardChartConfig({ templateId: chart.templateId, encoding: chart.encoding, fields: rawFields, metrics: rawMetrics })
    if (validation.state !== 'valid') throw new Error(`Generated chart ${chart.name} requires review before Autopilot can compose it`)
    return { ...chart, validationState: validation.state, validationIssues: validation.issues }
  })
  const { data, error: rpcError } = await supabase.rpc('create_dashboard_chart_drafts', {
    p_tenant_id: context.tenantId,
    p_project_id: context.projectId,
    p_dataset_id: datasetId,
    p_charts: charts,
  })
  if (rpcError) throw new Error(rpcError.message)
  return [...existingIds, ...((data ?? []) as Record<string, unknown>[]).map(row => String(row.id))]
}

async function ensureDashboardDraft(supabase: SupabaseClient, context: RunContext, chartIds: string[]) {
  const selectedIds = [...new Set(chartIds)].slice(0, context.brief.chartCount)
  if (selectedIds.length < context.brief.chartCount) throw new Error('Autopilot does not have enough valid charts to compose the requested dashboard')
  const { data, error } = await supabase
    .from('dashboard_chart_configs')
    .select('id, name, template_id, presentation, layout, validation_state, status')
    .eq('tenant_id', context.tenantId)
    .eq('project_id', context.projectId)
    .eq('dataset_id', context.artifacts.datasetId as string)
    .in('id', selectedIds)
  if (error) throw new Error(error.message)
  const chartById = new Map(((data ?? []) as Record<string, unknown>[]).map(chart => [String(chart.id), chart]))
  const charts = selectedIds.map(id => chartById.get(id)).filter(Boolean) as Record<string, unknown>[]
  if (charts.length !== selectedIds.length) throw new Error('Autopilot dashboard charts no longer match the governed dataset')
  const slots = buildProjectAutopilotDashboardSlots(charts.map(chart => ({
    id: String(chart.id),
    name: String(chart.name),
    templateId: String(chart.template_id) as ProjectAutopilotBrief['chartTypes'][number],
    presentation: record(chart.presentation) as { size?: 'compact' | 'standard' | 'wide' | 'full' },
    layout: record(chart.layout) as { order?: number; gridSpan?: number },
  })))
  const { data: composed, error: composeError } = await supabase.rpc('compose_project_autopilot_dashboard_draft', {
    p_run_id: context.runId,
    p_tenant_id: context.tenantId,
    p_project_id: context.projectId,
    p_dashboard_name: projectAutopilotDashboardName(context.brief),
    p_dashboard_description: context.brief.objective,
    p_slots: slots,
  })
  if (composeError) throw new Error(composeError.message)
  const result = ((composed ?? []) as Record<string, unknown>[])[0]
  if (!result?.dashboard_id || !result?.version_id || !result?.page_id) throw new Error('Autopilot dashboard composition returned no draft identity')
  return {
    dashboardId: String(result.dashboard_id),
    dashboardVersionId: String(result.version_id),
    dashboardPageId: String(result.page_id),
  }
}

export async function executeProjectAutopilot(supabase: SupabaseClient, context: RunContext) {
  let artifacts = { ...context.artifacts }
  let snapshot = await loadProjectAutopilotSnapshot({ supabase, ...context, artifacts })
  if (snapshot.semanticModel?.id !== artifacts.semanticModelId) {
    artifacts = rebindProjectAutopilotArtifacts(artifacts, snapshot.semanticModel?.id)
    snapshot = await loadProjectAutopilotSnapshot({ supabase, ...context, artifacts })
  }
  let plan = buildProjectAutopilotPlan(snapshot, context.brief)
  if (plan.currentStep === 'schema_scope') {
    return persistProjectAutopilotPlan({ supabase, ...context, plan, artifacts })
  }

  if (plan.currentStep === 'semantic_model') {
    let semanticModelId: string
    if (
      snapshot.semanticModel?.status === 'review'
      && snapshot.semanticModel.fieldCount > 0
      && snapshot.semanticModel.metricCount > 0
    ) {
      semanticModelId = snapshot.semanticModel.id
    } else {
      semanticModelId = await ensureDraftSemanticModel(supabase, { ...context, artifacts })
      artifacts.semanticModelId = semanticModelId
      await materializeSemanticModel(supabase, { ...context, artifacts }, semanticModelId)
    }
    artifacts.semanticModelId = semanticModelId
    const approval = await validateAndApproveAutopilotSemanticModel(
      supabase,
      { ...context, artifacts },
      semanticModelId,
    )
    snapshot = await loadProjectAutopilotSnapshot({ supabase, ...context, artifacts })
    plan = buildProjectAutopilotPlan(snapshot, context.brief)
    if (!approval.approved) {
      plan = {
        ...plan,
        status: 'awaiting_review',
        currentStep: 'semantic_model',
        steps: plan.steps.map(item => item.key === 'semantic_model'
          ? { ...item, status: 'awaiting_review', automatic: false, detail: `Automatic approval paused: ${approval.reason}` }
          : item),
      }
      return persistProjectAutopilotPlan({ supabase, ...context, plan, artifacts })
    }
  }

  const modelId = snapshot.semanticModel?.id
  if (!modelId || snapshot.semanticModel?.status !== 'approved') {
    return persistProjectAutopilotPlan({ supabase, ...context, plan, artifacts })
  }
  artifacts.semanticModelId = modelId
  if (snapshot.dataset?.status === 'published') artifacts.datasetId = snapshot.dataset.id
  artifacts.datasetId = await ensurePublishedDataset(supabase, { ...context, artifacts }, modelId)
  snapshot = await loadProjectAutopilotSnapshot({ supabase, ...context, artifacts })
  plan = buildProjectAutopilotPlan(snapshot, context.brief)

  if (plan.currentStep === 'charts' && artifacts.datasetId) {
    artifacts.chartIds = await ensureChartSuite(supabase, { ...context, artifacts }, artifacts.datasetId)
    snapshot = await loadProjectAutopilotSnapshot({ supabase, ...context, artifacts })
    plan = buildProjectAutopilotPlan(snapshot, context.brief)
  }

  if (plan.currentStep === 'dashboard' && artifacts.datasetId) {
    artifacts.chartIds = await ensureChartSuite(supabase, { ...context, artifacts }, artifacts.datasetId)
    await persistProjectAutopilotPlan({ supabase, ...context, plan, artifacts })
    Object.assign(artifacts, await ensureDashboardDraft(supabase, { ...context, artifacts }, artifacts.chartIds))
    snapshot = await loadProjectAutopilotSnapshot({ supabase, ...context, artifacts })
    plan = buildProjectAutopilotPlan(snapshot, context.brief)
  }

  return persistProjectAutopilotPlan({ supabase, ...context, plan, artifacts })
}
