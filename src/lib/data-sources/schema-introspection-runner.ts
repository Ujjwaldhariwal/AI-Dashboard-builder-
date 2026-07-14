import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  introspectPostgresSchema,
  testPostgresConnection,
  type PostgresSchemaIntrospectionResult,
  type PostgresTableMetadata,
} from '@/lib/data-sources/postgres-runtime'
import { columnsFromIntrospectionRows, persistGuidedProfileForColumns } from '@/lib/dashboardos/guided-review-store'
import { invalidateSemanticDependentsForDataSource } from '@/lib/semantic/semantic-hardening'

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

interface SchemaIntrospectionDependencies {
  testConnection: typeof testPostgresConnection
  introspectSchema: typeof introspectPostgresSchema
  invalidateDependents: typeof invalidateSemanticDependentsForDataSource
  persistGuidedProfile: typeof persistGuidedProfileForColumns
}

const DEFAULT_DEPENDENCIES: SchemaIntrospectionDependencies = {
  testConnection: testPostgresConnection,
  introspectSchema: introspectPostgresSchema,
  invalidateDependents: invalidateSemanticDependentsForDataSource,
  persistGuidedProfile: persistGuidedProfileForColumns,
}

export function schemaHashForTables(tables: PostgresTableMetadata[]) {
  const canonical = tables
    .map(table => ({
      schemaName: table.schemaName,
      tableName: table.tableName,
      tableType: table.tableType,
      columns: table.columns.map(column => ({
        columnName: column.columnName,
        ordinalPosition: column.ordinalPosition,
        dataType: column.dataType,
        udtName: column.udtName,
        isNullable: column.isNullable,
        columnDefault: column.columnDefault ?? null,
      })),
    }))
    .sort((left, right) => `${left.schemaName}.${left.tableName}`.localeCompare(`${right.schemaName}.${right.tableName}`))

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
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
    .select('id, tenant_id, project_id, status, credential_ciphertext, schema_hash')
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
    const schemaHash = schemaHashForTables(tables)
    const plan = buildSchemaRefreshPlan({
      previousSchemaHash,
      nextSchemaHash: schemaHash,
      complete: introspection.completeness.complete,
    })
    const refreshAfter = new Date(Date.now() + SCHEMA_REFRESH_TTL_MS).toISOString()

    if (plan.replaceSnapshot) {
      const { error: snapshotError } = await supabase.rpc('apply_data_source_schema_snapshot_atomic', {
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
      if (snapshotError) throw new Error(snapshotError.message)
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

    if (plan.persistGuidedProfile) {
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
