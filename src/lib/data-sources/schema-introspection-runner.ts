import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  introspectPostgresSchema,
  profilePostgresSchema,
  testPostgresConnection,
  type PostgresSchemaIntrospectionResult,
  type PostgresTableMetadata,
} from '@/lib/data-sources/postgres-runtime'
import { SCHEMA_PROFILE_VERSION, type SchemaIntelligenceProfile } from '@/lib/data-sources/schema-profile'
import { buildSchemaInventoryRelations, buildSchemaInventorySummary } from '@/lib/data-sources/schema-inventory'
import { columnsFromIntrospectionRows, persistGuidedProfileForColumns } from '@/lib/dashboardos/guided-review-store'
import { invalidateSemanticDependentsForDataSource } from '@/lib/semantic/semantic-hardening'
import type { DataSourceSchemaInventorySummary, DataSourceSchemaScopeStatus } from '@/types/data-source'

const SCHEMA_REFRESH_TTL_MS = 24 * 60 * 60 * 1000

export interface SchemaIntrospectionRunResult {
  dataSourceId: string
  tenantId: string
  projectId: string
  tableCount: number
  columnCount: number
  schemaHash: string
  previousSchemaHash: string | null
  schemaChanged: boolean
  noOp: boolean
  complete: true
  refreshAfter: string
  latencyMs: number
  tables: PostgresTableMetadata[]
  profileSummary: SchemaIntelligenceProfile['summary'] | null
  profileCached: boolean
  profilingWarnings: string[]
  inventorySummary: DataSourceSchemaInventorySummary
}

export interface SchemaRefreshPlan {
  complete: boolean
  schemaChanged: boolean
  noOp: boolean
  replaceSnapshot: boolean
  invalidateDependents: boolean
  persistGuidedProfile: boolean
}

export function buildSchemaRefreshPlan({
  previousSchemaHash,
  nextSchemaHash,
  complete,
}: {
  previousSchemaHash: string | null
  nextSchemaHash: string
  complete: boolean
}): SchemaRefreshPlan {
  if (!complete) {
    return {
      complete: false,
      schemaChanged: false,
      noOp: false,
      replaceSnapshot: false,
      invalidateDependents: false,
      persistGuidedProfile: false,
    }
  }

  const schemaChanged = previousSchemaHash !== nextSchemaHash
  return {
    complete: true,
    schemaChanged,
    noOp: !schemaChanged,
    replaceSnapshot: schemaChanged,
    invalidateDependents: Boolean(previousSchemaHash && schemaChanged),
    persistGuidedProfile: schemaChanged,
  }
}

export class SchemaIntrospectionIncompleteError extends Error {
  readonly code = 'SCHEMA_INTROSPECTION_INCOMPLETE'

  constructor(readonly completeness: PostgresSchemaIntrospectionResult['completeness']) {
    const reasons = completeness.reasons.map(reason => reason.replace('_', ' ')).join(', ')
    super(
      `Schema introspection is incomplete (${reasons}). At least ${completeness.observedColumnCount} columns were observed; `
      + `the safe scan limits are ${completeness.maxColumns} columns and ${completeness.maxTables} tables. `
      + 'The previous complete schema snapshot remains active.',
    )
    this.name = 'SchemaIntrospectionIncompleteError'
  }
}

class SchemaIntrospectionRecordingError extends Error {
  constructor(message: string) {
    super(`Schema refresh completed, but its run record could not be persisted: ${message}`)
    this.name = 'SchemaIntrospectionRecordingError'
  }
}

function isMissingSchemaSnapshotRpc(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? ''
  return error?.code === 'PGRST202'
    || /apply_data_source_schema_snapshot_atomic.*(function|schema cache)|could not find the function/i.test(message)
}

function isMissingSchemaInventoryRpc(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? ''
  return error?.code === 'PGRST202'
    || /apply_data_source_schema_inventory_atomic.*(function|schema cache)|could not find the function/i.test(message)
}

function summaryFromSourceRow(
  row: Record<string, unknown>,
  fallback: DataSourceSchemaInventorySummary,
): DataSourceSchemaInventorySummary {
  if (row.schema_object_count === undefined) return fallback
  return {
    discoveredObjectCount: Number(row.schema_object_count ?? fallback.discoveredObjectCount),
    discoveredTableCount: Number(row.schema_base_table_count ?? fallback.discoveredTableCount),
    discoveredViewCount: Number(row.schema_view_count ?? fallback.discoveredViewCount),
    discoveredColumnCount: Number(row.schema_column_count ?? fallback.discoveredColumnCount),
    includedObjectCount: Number(row.schema_included_object_count ?? fallback.includedObjectCount),
    includedColumnCount: Number(row.schema_included_column_count ?? fallback.includedColumnCount),
    excludedObjectCount: Number(row.schema_excluded_object_count ?? fallback.excludedObjectCount),
    reviewObjectCount: Number(row.schema_review_object_count ?? fallback.reviewObjectCount),
    scopeStatus: String(row.schema_scope_status ?? fallback.scopeStatus) as DataSourceSchemaScopeStatus,
  }
}

function summaryFromRpc(value: unknown, fallback: DataSourceSchemaInventorySummary) {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  if (row.discoveredObjectCount === undefined) return fallback
  return {
    discoveredObjectCount: Number(row.discoveredObjectCount),
    discoveredTableCount: Number(row.discoveredTableCount ?? 0),
    discoveredViewCount: Number(row.discoveredViewCount ?? 0),
    discoveredColumnCount: Number(row.discoveredColumnCount ?? 0),
    includedObjectCount: Number(row.includedObjectCount ?? 0),
    includedColumnCount: Number(row.includedColumnCount ?? 0),
    excludedObjectCount: Number(row.excludedObjectCount ?? 0),
    reviewObjectCount: Number(row.reviewObjectCount ?? 0),
    scopeStatus: String(row.scopeStatus ?? 'review_required') as DataSourceSchemaScopeStatus,
  }
}

function isMissingGuidedProfileTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /relation .*guided_schema_profiles.* does not exist|could not find the table .*guided_schema_profiles.*schema cache/i.test(message)
}

async function persistSchemaSnapshotWithoutRpc({
  supabase,
  dataSourceId,
  tenantId,
  projectId,
  columns,
  schemaHash,
  tableCount,
  columnCount,
  introspectedAt,
  refreshAfter,
}: {
  supabase: SupabaseClient
  dataSourceId: string
  tenantId: string
  projectId: string
  columns: Array<Record<string, unknown>>
  schemaHash: string
  tableCount: number
  columnCount: number
  introspectedAt: string
  refreshAfter: string
}) {
  const { error: deleteError } = await supabase
    .from('data_source_columns')
    .delete()
    .eq('data_source_id', dataSourceId)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)

  if (deleteError) throw new Error(deleteError.message)

  if (columns.length > 0) {
    const rows = columns.map(column => ({
      tenant_id: tenantId,
      project_id: projectId,
      data_source_id: dataSourceId,
      schema_name: column.schema_name,
      table_name: column.table_name,
      column_name: column.column_name,
      ordinal_position: column.ordinal_position,
      data_type: column.data_type,
      udt_name: column.udt_name,
      is_nullable: column.is_nullable,
      column_default: column.column_default,
    }))
    const { data: inserted, error: insertError } = await supabase
      .from('data_source_columns')
      .insert(rows)
      .select('id')

    if (insertError) throw new Error(insertError.message)
    if ((inserted ?? []).length !== columnCount) {
      throw new Error(`Schema snapshot column count mismatch: expected ${columnCount}, inserted ${(inserted ?? []).length}`)
    }
  }

  const { error: updateError } = await supabase
    .from('data_sources')
    .update({
      status: 'active',
      last_tested_at: introspectedAt,
      last_test_status: 'ok',
      last_error: null,
      schema_last_introspected_at: introspectedAt,
      schema_last_status: 'ok',
      schema_last_error: null,
      schema_hash: schemaHash,
      schema_table_count: tableCount,
      schema_column_count: columnCount,
      schema_refresh_after: refreshAfter,
      schema_refresh_requested_at: null,
      schema_refresh_reason: null,
      updated_at: introspectedAt,
    })
    .eq('id', dataSourceId)
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)

  if (updateError) throw new Error(updateError.message)
}

interface SchemaIntrospectionDependencies {
  testConnection: typeof testPostgresConnection
  introspectSchema: typeof introspectPostgresSchema
  profileSchema: typeof profilePostgresSchema
  invalidateDependents: typeof invalidateSemanticDependentsForDataSource
  persistGuidedProfile: typeof persistGuidedProfileForColumns
}

const DEFAULT_DEPENDENCIES: SchemaIntrospectionDependencies = {
  testConnection: testPostgresConnection,
  introspectSchema: introspectPostgresSchema,
  profileSchema: profilePostgresSchema,
  invalidateDependents: invalidateSemanticDependentsForDataSource,
  persistGuidedProfile: persistGuidedProfileForColumns,
}

export function schemaHashForTables(
  tables: PostgresTableMetadata[],
  foreignKeys: PostgresSchemaIntrospectionResult['foreignKeys'] = [],
) {
  const canonical = {
    tables: tables.map(table => ({
      schemaName: table.schemaName,
      tableName: table.tableName,
      tableType: table.tableType,
      comment: table.comment ?? null,
      columns: table.columns.map(column => ({
        columnName: column.columnName,
        ordinalPosition: column.ordinalPosition,
        dataType: column.dataType,
        udtName: column.udtName,
        isNullable: column.isNullable,
        columnDefault: column.columnDefault ?? null,
        comment: column.comment ?? null,
        isPrimaryKey: Boolean(column.isPrimaryKey),
        isUnique: Boolean(column.isUnique),
        isIndexed: Boolean(column.isIndexed),
      })),
    }))
    .sort((left, right) => `${left.schemaName}.${left.tableName}`.localeCompare(`${right.schemaName}.${right.tableName}`)),
    foreignKeys: [...(foreignKeys ?? [])].sort((left, right) => (
      `${left.sourceSchema}.${left.sourceTable}.${left.sourceColumn}.${left.constraintName}`
        .localeCompare(`${right.sourceSchema}.${right.sourceTable}.${right.sourceColumn}.${right.constraintName}`)
    )),
  }

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

async function persistSchemaIntelligenceProfile({
  supabase,
  tenantId,
  projectId,
  dataSourceId,
  schemaHash,
  profile,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  dataSourceId: string
  schemaHash: string
  profile: SchemaIntelligenceProfile
}) {
  const { error } = await supabase
    .from('data_source_schema_profiles')
    .upsert({
      tenant_id: tenantId,
      project_id: projectId,
      data_source_id: dataSourceId,
      schema_hash: schemaHash,
      profile_version: SCHEMA_PROFILE_VERSION,
      selected_schemas: profile.selectedSchemas,
      table_profiles: profile.tableProfiles,
      column_profiles: profile.columnProfiles,
      join_candidates: profile.joinCandidates,
      warnings: profile.warnings,
      summary: profile.summary,
      generated_at: profile.generatedAt,
      updated_at: profile.generatedAt,
    }, { onConflict: 'data_source_id,schema_hash,profile_version' })

  if (error) throw new Error(error.message)
}

async function hasCachedSchemaIntelligenceProfile({
  supabase,
  dataSourceId,
  schemaHash,
}: {
  supabase: SupabaseClient
  dataSourceId: string
  schemaHash: string
}) {
  try {
    const { data, error } = await supabase
      .from('data_source_schema_profiles')
      .select('id')
      .eq('data_source_id', dataSourceId)
      .eq('schema_hash', schemaHash)
      .eq('profile_version', SCHEMA_PROFILE_VERSION)
      .maybeSingle()
    return !error && Boolean(data)
  } catch {
    return false
  }
}

async function recordIncompleteIntrospection({
  supabase,
  tenantId,
  projectId,
  dataSourceId,
  nowIso,
  startedAt,
  triggeredBy,
  triggerSource,
  latencyMs,
  result,
}: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  dataSourceId: string
  nowIso: string
  startedAt: number
  triggeredBy: string | null
  triggerSource: 'manual' | 'scheduled' | 'api'
  latencyMs: number
  result: PostgresSchemaIntrospectionResult
}): Promise<never> {
  const error = new SchemaIntrospectionIncompleteError(result.completeness)
  const finishedAt = new Date().toISOString()
  const [sourceResult, runResult] = await Promise.all([
    supabase
      .from('data_sources')
      .update({
        last_tested_at: nowIso,
        last_test_status: 'ok',
        last_error: null,
        schema_last_introspected_at: nowIso,
        schema_last_status: 'error',
        schema_last_error: error.message,
        schema_refresh_requested_at: nowIso,
        schema_refresh_reason: 'introspection_incomplete',
        updated_at: finishedAt,
      })
      .eq('id', dataSourceId)
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId),
    supabase
      .from('data_source_schema_runs')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        data_source_id: dataSourceId,
        status: 'error',
        table_count: result.tables.length,
        column_count: result.completeness.acceptedColumnCount,
        started_at: nowIso,
        finished_at: finishedAt,
        elapsed_ms: Math.max(0, Date.now() - startedAt),
        error_message: error.message,
        triggered_by: triggeredBy,
        trigger_source: triggerSource,
        metadata: {
          latencyMs,
          incomplete: true,
          completeness: result.completeness,
        },
      }),
  ])

  if (sourceResult.error) throw new Error(sourceResult.error.message)
  if (runResult.error) throw new Error(runResult.error.message)
  throw error
}

export async function runDataSourceSchemaIntrospection({
  supabase,
  dataSourceId,
  triggeredBy = null,
  triggerSource = 'scheduled',
  dependencies = {},
}: {
  supabase: SupabaseClient
  dataSourceId: string
  triggeredBy?: string | null
  triggerSource?: 'manual' | 'scheduled' | 'api'
  dependencies?: Partial<SchemaIntrospectionDependencies>
}): Promise<SchemaIntrospectionRunResult> {
  const nowIso = new Date().toISOString()
  const startedAt = Date.now()
  const runtime = { ...DEFAULT_DEPENDENCIES, ...dependencies }

  const { data: source, error: sourceError } = await supabase
    .from('data_sources')
    .select('id, tenant_id, project_id, status, credential_ciphertext, schema_hash, schema_object_count, schema_base_table_count, schema_view_count, schema_column_count, schema_included_object_count, schema_included_column_count, schema_excluded_object_count, schema_review_object_count, schema_scope_status')
    .eq('id', dataSourceId)
    .single()

  if (sourceError || !source) {
    throw new Error(sourceError?.message ?? 'Data source not found')
  }

  const row = source as Record<string, unknown>
  const tenantId = String(row.tenant_id)
  const projectId = String(row.project_id)
  const previousSchemaHash = typeof row.schema_hash === 'string' ? row.schema_hash : null
  const ciphertext = typeof row.credential_ciphertext === 'string' ? row.credential_ciphertext : ''
  if (!ciphertext) throw new Error('Missing encrypted credentials')

  try {
    const [test, introspection] = await Promise.all([
      runtime.testConnection(ciphertext),
      runtime.introspectSchema(ciphertext),
    ])

    if (!introspection.completeness.complete) {
      await recordIncompleteIntrospection({
        supabase,
        tenantId,
        projectId,
        dataSourceId,
        nowIso,
        startedAt,
        triggeredBy,
        triggerSource,
        latencyMs: test.latencyMs,
        result: introspection,
      })
    }

    const tables = introspection.tables
    const inventoryRelations = buildSchemaInventoryRelations(tables)
    const proposedInventorySummary = buildSchemaInventorySummary(inventoryRelations.map(relation => ({
      relationType: relation.relation_type,
      columnCount: relation.column_count,
      selectionStatus: relation.suggested_status,
    })), 'review_required')
    const columns = tables.flatMap(table => table.columns.map(column => ({
      schema_name: column.schemaName,
      table_name: column.tableName,
      column_name: column.columnName,
      ordinal_position: column.ordinalPosition,
      data_type: column.dataType,
      udt_name: column.udtName,
      is_nullable: column.isNullable,
      column_default: column.columnDefault ?? null,
    })))
    const schemaHash = schemaHashForTables(tables, introspection.foreignKeys)
    const plan = buildSchemaRefreshPlan({
      previousSchemaHash,
      nextSchemaHash: schemaHash,
      complete: introspection.completeness.complete,
    })
    const refreshAfter = new Date(Date.now() + SCHEMA_REFRESH_TTL_MS).toISOString()
    let intelligenceProfile: SchemaIntelligenceProfile | null = null
    const profilingWarnings: string[] = []
    const profileCached = plan.noOp
      ? await hasCachedSchemaIntelligenceProfile({ supabase, dataSourceId, schemaHash })
      : false
    let persistedInventorySummary: DataSourceSchemaInventorySummary | null = null

    if (plan.replaceSnapshot || !profileCached) {
      try {
        intelligenceProfile = await runtime.profileSchema(ciphertext, introspection)
        profilingWarnings.push(...intelligenceProfile.warnings)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        profilingWarnings.push(`Schema profiling was skipped: ${message.slice(0, 240)}`)
      }
    }

    if (plan.replaceSnapshot) {
      const inventoryResult = await supabase.rpc('apply_data_source_schema_inventory_atomic', {
        p_data_source_id: dataSourceId,
        p_tenant_id: tenantId,
        p_project_id: projectId,
        p_columns: columns,
        p_relations: inventoryRelations,
        p_schema_hash: schemaHash,
        p_introspected_at: nowIso,
        p_refresh_after: refreshAfter,
      })
      if (inventoryResult.error && !isMissingSchemaInventoryRpc(inventoryResult.error)) {
        throw new Error(inventoryResult.error.message)
      }
      if (inventoryResult.error) {
        const snapshotResult = await supabase.rpc('apply_data_source_schema_snapshot_atomic', {
          p_data_source_id: dataSourceId,
          p_tenant_id: tenantId,
          p_project_id: projectId,
          p_columns: columns,
          p_schema_hash: schemaHash,
          p_table_count: tables.length,
          p_column_count: columns.length,
          p_introspected_at: nowIso,
          p_refresh_after: refreshAfter,
        })
        if (snapshotResult.error && !isMissingSchemaSnapshotRpc(snapshotResult.error)) throw new Error(snapshotResult.error.message)
        if (snapshotResult.error) {
          await persistSchemaSnapshotWithoutRpc({
            supabase,
            dataSourceId,
            tenantId,
            projectId,
            columns,
            schemaHash,
            tableCount: tables.length,
            columnCount: columns.length,
            introspectedAt: nowIso,
            refreshAfter,
          })
        }
        profilingWarnings.push('Schema inventory migration is not applied; raw columns were saved without governed table selection.')
      } else {
        persistedInventorySummary = summaryFromRpc(inventoryResult.data, proposedInventorySummary)
      }
    } else {
      const { error: heartbeatError } = await supabase
        .from('data_sources')
        .update({
          status: row.status === 'disabled' ? 'disabled' : 'active',
          last_tested_at: nowIso,
          last_test_status: 'ok',
          last_error: null,
          schema_last_introspected_at: nowIso,
          schema_last_status: 'ok',
          schema_last_error: null,
          schema_refresh_after: refreshAfter,
          schema_refresh_requested_at: null,
          schema_refresh_reason: null,
          updated_at: nowIso,
        })
        .eq('id', dataSourceId)
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
      if (heartbeatError) throw new Error(heartbeatError.message)
    }

    if (plan.invalidateDependents) {
      await runtime.invalidateDependents({
        supabase,
        tenantId,
        projectId,
        dataSourceId,
        actorUserId: triggeredBy,
      })
    }

    if (intelligenceProfile) {
      try {
        await persistSchemaIntelligenceProfile({
          supabase,
          tenantId,
          projectId,
          dataSourceId,
          schemaHash,
          profile: intelligenceProfile,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        profilingWarnings.push(`Schema profile could not be persisted: ${message.slice(0, 240)}`)
      }
    }

    if (plan.persistGuidedProfile) {
      try {
        await runtime.persistGuidedProfile({
          supabase,
          tenantId,
          projectId,
          dataSourceId,
          schemaHash,
          columns: columnsFromIntrospectionRows({
            dataSourceId,
            columns: tables.flatMap(table => table.columns),
          }),
        })
      } catch (error) {
        if (!isMissingGuidedProfileTableError(error)) throw error
      }
    }

    const finishedAt = new Date().toISOString()
    const { error: runError } = await supabase
      .from('data_source_schema_runs')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        data_source_id: dataSourceId,
        status: 'ok',
        schema_hash: schemaHash,
        table_count: tables.length,
        column_count: columns.length,
        started_at: nowIso,
        finished_at: finishedAt,
        elapsed_ms: Math.max(0, Date.now() - startedAt),
        triggered_by: triggeredBy,
        trigger_source: triggerSource,
        metadata: {
          latencyMs: test.latencyMs,
          complete: true,
          schemaChanged: plan.schemaChanged,
          noOp: plan.noOp,
          previousSchemaHash,
          profileVersion: intelligenceProfile?.version ?? SCHEMA_PROFILE_VERSION,
          profileCached,
          profileSummary: intelligenceProfile?.summary ?? null,
          profilingWarnings,
        },
      })
    if (runError) throw new SchemaIntrospectionRecordingError(runError.message)

    return {
      dataSourceId,
      tenantId,
      projectId,
      tableCount: tables.length,
      columnCount: columns.length,
      schemaHash,
      previousSchemaHash,
      schemaChanged: plan.schemaChanged,
      noOp: plan.noOp,
      complete: true,
      refreshAfter,
      latencyMs: test.latencyMs,
      tables,
      profileSummary: intelligenceProfile?.summary ?? null,
      profileCached,
      profilingWarnings,
      inventorySummary: plan.noOp
        ? summaryFromSourceRow(row, proposedInventorySummary)
        : persistedInventorySummary ?? proposedInventorySummary,
    }
  } catch (error) {
    if (error instanceof SchemaIntrospectionIncompleteError || error instanceof SchemaIntrospectionRecordingError) throw error

    const message = error instanceof Error ? error.message : String(error)
    const finishedAt = new Date().toISOString()
    await Promise.all([
      supabase
        .from('data_sources')
        .update({
          last_tested_at: nowIso,
          last_test_status: 'error',
          last_error: message,
          schema_last_status: 'error',
          schema_last_error: message,
          schema_refresh_requested_at: nowIso,
          schema_refresh_reason: 'last_introspection_failed',
          updated_at: finishedAt,
        })
        .eq('id', dataSourceId)
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId),
      supabase
        .from('data_source_schema_runs')
        .insert({
          tenant_id: tenantId,
          project_id: projectId,
          data_source_id: dataSourceId,
          status: 'error',
          started_at: nowIso,
          finished_at: finishedAt,
          elapsed_ms: Math.max(0, Date.now() - startedAt),
          error_message: message,
          triggered_by: triggeredBy,
          trigger_source: triggerSource,
        }),
    ])

    throw error
  }
}
