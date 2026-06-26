import type { SupabaseClient } from '@supabase/supabase-js'

import {
  enqueuePlatformJob,
  PLATFORM_JOB_TARGET_TYPES,
  PLATFORM_JOB_TYPES,
  type PlatformJob,
  type PlatformJobTargetType,
  type PlatformJobType,
} from '@/lib/jobs/platform-jobs'

export const PLATFORM_JOB_SCHEDULE_TARGET_TYPES = PLATFORM_JOB_TARGET_TYPES
export const PLATFORM_JOB_SCHEDULE_TYPES = PLATFORM_JOB_TYPES

export interface PlatformJobSchedule {
  id: string
  tenantId: string
  projectId: string | null
  jobType: PlatformJobType
  targetType: PlatformJobTargetType | null
  targetId: string | null
  enabled: boolean
  intervalMinutes: number
  priority: number
  maxAttempts: number
  nextRunAt: string
  lastEnqueuedAt: string | null
  lastJobId: string | null
  lastError: string | null
  lockedBy: string | null
  lockedAt: string | null
  payload: Record<string, unknown>
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface ListPlatformJobSchedulesInput {
  supabase: SupabaseClient
  tenantId?: string | null
  projectId?: string | null
  jobType?: PlatformJobType | null
  enabled?: boolean | null
  limit?: number
}

interface UpsertPlatformJobScheduleInput {
  supabase: SupabaseClient
  tenantId: string
  projectId?: string | null
  jobType: PlatformJobType
  targetType?: PlatformJobTargetType | null
  targetId?: string | null
  enabled?: boolean
  intervalMinutes: number
  priority?: number
  maxAttempts?: number
  nextRunAt?: string | null
  payload?: Record<string, unknown>
  createdBy?: string | null
}

interface ClaimPlatformJobSchedulesInput {
  supabase: SupabaseClient
  schedulerId: string
  batchSize?: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function mapPlatformJobSchedule(row: Record<string, unknown>): PlatformJobSchedule {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    jobType: String(row.job_type) as PlatformJobType,
    targetType: typeof row.target_type === 'string' ? row.target_type as PlatformJobTargetType : null,
    targetId: typeof row.target_id === 'string' ? row.target_id : null,
    enabled: row.enabled !== false,
    intervalMinutes: Number(row.interval_minutes ?? 60),
    priority: Number(row.priority ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    nextRunAt: String(row.next_run_at ?? new Date().toISOString()),
    lastEnqueuedAt: typeof row.last_enqueued_at === 'string' ? row.last_enqueued_at : null,
    lastJobId: typeof row.last_job_id === 'string' ? row.last_job_id : null,
    lastError: typeof row.last_error === 'string' ? row.last_error : null,
    lockedBy: typeof row.locked_by === 'string' ? row.locked_by : null,
    lockedAt: typeof row.locked_at === 'string' ? row.locked_at : null,
    payload: asRecord(row.payload),
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function listPlatformJobSchedules({
  supabase,
  tenantId,
  projectId,
  jobType,
  enabled,
  limit = 50,
}: ListPlatformJobSchedulesInput): Promise<PlatformJobSchedule[]> {
  const clampedLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  let query = supabase
    .from('platform_job_schedules')
    .select('*')
    .order('next_run_at', { ascending: true })
    .limit(clampedLimit)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (projectId) query = query.eq('project_id', projectId)
  if (jobType) query = query.eq('job_type', jobType)
  if (typeof enabled === 'boolean') query = query.eq('enabled', enabled)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(row => mapPlatformJobSchedule(row))
}

export async function upsertPlatformJobSchedule({
  supabase,
  tenantId,
  projectId = null,
  jobType,
  targetType = null,
  targetId = null,
  enabled = true,
  intervalMinutes,
  priority = 0,
  maxAttempts = 3,
  nextRunAt = null,
  payload = {},
  createdBy = null,
}: UpsertPlatformJobScheduleInput): Promise<PlatformJobSchedule> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('platform_job_schedules')
    .upsert({
      tenant_id: tenantId,
      project_id: projectId,
      job_type: jobType,
      target_type: targetType,
      target_id: targetId,
      enabled,
      interval_minutes: intervalMinutes,
      priority,
      max_attempts: maxAttempts,
      next_run_at: nextRunAt ?? nowIso,
      payload,
      created_by: createdBy,
      updated_at: nowIso,
    }, {
      onConflict: 'tenant_id,project_id,job_type,target_type,target_id',
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapPlatformJobSchedule(data as Record<string, unknown>)
}

export async function claimPlatformJobSchedules({
  supabase,
  schedulerId,
  batchSize = 25,
}: ClaimPlatformJobSchedulesInput): Promise<PlatformJobSchedule[]> {
  const clampedBatchSize = Math.min(50, Math.max(1, Math.trunc(batchSize)))
  const { data, error } = await supabase.rpc('claim_platform_job_schedules', {
    batch_size: clampedBatchSize,
    scheduler_id: schedulerId,
  })

  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(row => mapPlatformJobSchedule(row))
}

export async function markScheduleEnqueued({
  supabase,
  scheduleId,
  jobId,
}: {
  supabase: SupabaseClient
  scheduleId: string
  jobId: string
}) {
  const { error } = await supabase
    .from('platform_job_schedules')
    .update({
      last_job_id: jobId,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', scheduleId)

  if (error) throw new Error(error.message)
}

export async function markScheduleError({
  supabase,
  scheduleId,
  errorMessage,
}: {
  supabase: SupabaseClient
  scheduleId: string
  errorMessage: string
}) {
  const { error } = await supabase
    .from('platform_job_schedules')
    .update({
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', scheduleId)

  if (error) throw new Error(error.message)
}

export async function enqueueJobFromSchedule({
  supabase,
  schedule,
}: {
  supabase: SupabaseClient
  schedule: PlatformJobSchedule
}): Promise<PlatformJob> {
  return enqueuePlatformJob({
    supabase,
    tenantId: schedule.tenantId,
    projectId: schedule.projectId,
    jobType: schedule.jobType,
    targetType: schedule.targetType,
    targetId: schedule.targetId,
    priority: schedule.priority,
    maxAttempts: schedule.maxAttempts,
    dedupeKey: `schedule:${schedule.id}:${schedule.lastEnqueuedAt ?? schedule.nextRunAt}`,
    payload: {
      ...schedule.payload,
      scheduleId: schedule.id,
      scheduledAt: schedule.lastEnqueuedAt ?? new Date().toISOString(),
    },
    createdBy: schedule.createdBy,
  })
}
