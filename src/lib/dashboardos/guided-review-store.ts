import type { SupabaseClient } from '@supabase/supabase-js'

import {
  applyGuidedReviewDecision,
  approveGuidedSemanticDraft,
  buildGuidedReviewState,
  type GuidedReviewDecision,
  type GuidedReviewState,
} from '@/lib/dashboardos/guided-review'
import type { DataSourceColumnMetadata } from '@/types/data-source'

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
  const state = buildGuidedReviewState(columns)

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
  return mapGuidedProfile(data as Record<string, unknown>)
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
  const nextState = approveGuidedSemanticDraft(profile.state, actorUserId, nowIso)

  const { data, error } = await supabase
    .from('guided_schema_profiles')
    .update({ state: nextState, updated_at: nowIso })
    .eq('id', profileId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapGuidedProfile(data as Record<string, unknown>)
}
