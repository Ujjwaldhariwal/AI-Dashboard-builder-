import type { SupabaseClient } from '@supabase/supabase-js'

export const PLATFORM_JOB_TYPES = ['dashboard_health', 'schema_refresh', 'export', 'cache_warm'] as const
export const PLATFORM_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export const PLATFORM_JOB_TARGET_TYPES = ['dashboard', 'dashboard_version', 'data_source', 'dataset', 'chart', 'project', 'tenant'] as const

export type PlatformJobType = (typeof PLATFORM_JOB_TYPES)[number]
export type PlatformJobStatus = (typeof PLATFORM_JOB_STATUSES)[number]
export type PlatformJobTargetType = (typeof PLATFORM_JOB_TARGET_TYPES)[number]

export interface PlatformJob {
  id: string
  tenantId: string
  projectId: string | null
  jobType: PlatformJobType
  status: PlatformJobStatus
  targetType: PlatformJobTargetType | null
  targetId: string | null
  priority: number
  runAfter: string
  attempts: number
  maxAttempts: number
  dedupeKey: string | null
  lockedBy: string | null
  lockedAt: string | null
  startedAt: string | null
  completedAt: string | null
  payload: Record<string, unknown>
  result: Record<string, unknown>
  errorMessage: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface EnqueuePlatformJobInput {
  supabase: SupabaseClient
  tenantId: string
  projectId?: string | null
  jobType: PlatformJobType
  targetType?: PlatformJobTargetType | null
  targetId?: string | null
  priority?: number
  runAfter?: string | null
  maxAttempts?: number
  dedupeKey?: string | null
  payload?: Record<string, unknown>
  createdBy: string
}

interface ListPlatformJobsInput {
  supabase: SupabaseClient
  tenantId?: string | null
  projectId?: string | null
  status?: PlatformJobStatus | null
  jobType?: PlatformJobType | null
  limit?: number
}

interface ClaimPlatformJobsInput {
  supabase: SupabaseClient
  workerId: string
  batchSize?: number
}

interface CompletePlatformJobInput {
  supabase: SupabaseClient
  jobId: string
  result?: Record<string, unknown>
}

interface FailPlatformJobInput {
  supabase: SupabaseClient
  job: PlatformJob
  errorMessage: string
  retryAfterSeconds?: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function mapPlatformJob(row: Record<string, unknown>): PlatformJob {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    jobType: String(row.job_type) as PlatformJobType,
    status: String(row.status) as PlatformJobStatus,
    targetType: typeof row.target_type === 'string' ? row.target_type as PlatformJobTargetType : null,
    targetId: typeof row.target_id === 'string' ? row.target_id : null,
    priority: Number(row.priority ?? 0),
    runAfter: String(row.run_after ?? new Date().toISOString()),
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    dedupeKey: typeof row.dedupe_key === 'string' ? row.dedupe_key : null,
    lockedBy: typeof row.locked_by === 'string' ? row.locked_by : null,
    lockedAt: typeof row.locked_at === 'string' ? row.locked_at : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
    payload: asRecord(row.payload),
    result: asRecord(row.result),
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function enqueuePlatformJob({
  supabase,
  tenantId,
  projectId = null,
  jobType,
  targetType = null,
  targetId = null,
  priority = 0,
  runAfter = null,
  maxAttempts = 3,
  dedupeKey = null,
  payload = {},
  createdBy,
}: EnqueuePlatformJobInput): Promise<PlatformJob> {
  const nowIso = new Date().toISOString()
  const insertPayload = {
    tenant_id: tenantId,
    project_id: projectId,
    job_type: jobType,
    status: 'queued',
    target_type: targetType,
    target_id: targetId,
    priority,
    run_after: runAfter ?? nowIso,
    max_attempts: maxAttempts,
    dedupe_key: dedupeKey,
    payload,
    created_by: createdBy,
    created_at: nowIso,
    updated_at: nowIso,
  }

  const { data, error } = await supabase
    .from('platform_jobs')
    .insert(insertPayload)
    .select('*')
    .single()

  if (!error && data) return mapPlatformJob(data as Record<string, unknown>)

  if (dedupeKey && error && 'code' in error && error.code === '23505') {
    const { data: existing, error: existingError } = await supabase
      .from('platform_jobs')
      .select('*')
      .eq('dedupe_key', dedupeKey)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!existingError && existing) return mapPlatformJob(existing as Record<string, unknown>)
  }

  throw new Error(error?.message ?? 'Unable to enqueue platform job')
}

export async function listPlatformJobs({
  supabase,
  tenantId,
  projectId,
  status,
  jobType,
  limit = 50,
}: ListPlatformJobsInput): Promise<PlatformJob[]> {
  const clampedLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  let query = supabase
    .from('platform_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(clampedLimit)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (projectId) query = query.eq('project_id', projectId)
  if (status) query = query.eq('status', status)
  if (jobType) query = query.eq('job_type', jobType)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map(row => mapPlatformJob(row as Record<string, unknown>))
}

export async function claimPlatformJobs({
  supabase,
  workerId,
  batchSize = 5,
}: ClaimPlatformJobsInput): Promise<PlatformJob[]> {
  const clampedBatchSize = Math.min(25, Math.max(1, Math.trunc(batchSize)))
  const { data, error } = await supabase.rpc('claim_platform_jobs', {
    batch_size: clampedBatchSize,
    worker_id: workerId,
  })

  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(row => mapPlatformJob(row))
}

export async function completePlatformJob({
  supabase,
  jobId,
  result = {},
}: CompletePlatformJobInput): Promise<PlatformJob> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('platform_jobs')
    .update({
      status: 'succeeded',
      result,
      error_message: null,
      locked_by: null,
      locked_at: null,
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', jobId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapPlatformJob(data as Record<string, unknown>)
}

export async function failPlatformJob({
  supabase,
  job,
  errorMessage,
  retryAfterSeconds,
}: FailPlatformJobInput): Promise<PlatformJob> {
  const now = new Date()
  const shouldRetry = job.attempts < job.maxAttempts
  const retryDelaySeconds = retryAfterSeconds ?? Math.min(900, 30 * Math.max(1, job.attempts))
  const nextRunAfter = new Date(now.getTime() + retryDelaySeconds * 1000).toISOString()
  const status: PlatformJobStatus = shouldRetry ? 'queued' : 'failed'
  const { data, error } = await supabase
    .from('platform_jobs')
    .update({
      status,
      error_message: errorMessage,
      locked_by: null,
      locked_at: null,
      run_after: shouldRetry ? nextRunAfter : job.runAfter,
      completed_at: shouldRetry ? null : now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', job.id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapPlatformJob(data as Record<string, unknown>)
}
