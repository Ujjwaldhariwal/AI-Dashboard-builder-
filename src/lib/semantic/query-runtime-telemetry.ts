import crypto from 'crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

export type SemanticQuerySurface = 'admin_preview' | 'client_dataset' | 'client_chart'
export type SemanticQueryStatus = 'success' | 'error'

export interface SemanticQueryTelemetryInput {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  datasetId?: string | null
  chartId?: string | null
  dataSourceId?: string | null
  actorUserId: string
  surface: SemanticQuerySurface
  status: SemanticQueryStatus
  sql?: string | null
  rowCount?: number | null
  elapsedMs?: number | null
  timeoutMs?: number | null
  errorMessage?: string | null
  warnings?: string[]
}

function hashSql(sql?: string | null) {
  if (!sql) return null
  return crypto.createHash('sha256').update(sql).digest('hex')
}

export async function recordSemanticQueryRun({
  supabase,
  tenantId,
  projectId,
  datasetId = null,
  chartId = null,
  dataSourceId = null,
  actorUserId,
  surface,
  status,
  sql,
  rowCount = null,
  elapsedMs = null,
  timeoutMs = null,
  errorMessage = null,
  warnings = [],
}: SemanticQueryTelemetryInput) {
  const { error } = await supabase
    .from('semantic_query_runs')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      dataset_id: datasetId,
      chart_id: chartId,
      data_source_id: dataSourceId,
      actor_user_id: actorUserId,
      surface,
      status,
      query_hash: hashSql(sql),
      row_count: rowCount,
      elapsed_ms: elapsedMs,
      timeout_ms: timeoutMs,
      error_message: errorMessage,
      warnings,
    })

  if (error) return
}
