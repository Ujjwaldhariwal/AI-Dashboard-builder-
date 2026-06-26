import type { SupabaseClient } from '@supabase/supabase-js'

import { reconcileDashboardHealthAlerts } from '@/lib/alerts/platform-alerts'
import { runDataSourceSchemaIntrospection } from '@/lib/data-sources/schema-introspection-runner'
import { auditPublishedDashboards, recordDashboardHealthRuns } from '@/lib/publishing/dashboard-health-auditor'
import { warmQueryResultCache } from '@/lib/semantic/query-cache-warmer'
import type { PlatformJob } from '@/lib/jobs/platform-jobs'

export interface PlatformJobRunResult {
  ok: true
  result: Record<string, unknown>
}

function requireTargetId(job: PlatformJob, expectedType: string) {
  if (job.targetType !== expectedType || !job.targetId) {
    throw new Error(`${job.jobType} jobs require targetType=${expectedType} and targetId`)
  }
  return job.targetId
}

async function runDashboardHealthJob(supabase: SupabaseClient, job: PlatformJob): Promise<PlatformJobRunResult> {
  const dashboardId = job.targetType === 'dashboard' ? job.targetId : null
  const audit = await auditPublishedDashboards({
    supabase,
    tenantId: job.tenantId,
    projectId: job.projectId,
    dashboardId,
  })
  const runs = await recordDashboardHealthRuns({
    supabase,
    audit,
    checkedBy: null,
  })
  const alerts = await reconcileDashboardHealthAlerts({ supabase, audit })

  return {
    ok: true,
    result: {
      checkedAt: audit.checkedAt,
      summary: audit.summary,
      runCount: runs.length,
      alerts,
    },
  }
}

async function runSchemaRefreshJob(supabase: SupabaseClient, job: PlatformJob): Promise<PlatformJobRunResult> {
  const dataSourceId = requireTargetId(job, 'data_source')
  const result = await runDataSourceSchemaIntrospection({
    supabase,
    dataSourceId,
    triggeredBy: job.createdBy,
    triggerSource: 'scheduled',
  })

  return {
    ok: true,
    result: {
      dataSourceId: result.dataSourceId,
      tableCount: result.tableCount,
      columnCount: result.columnCount,
      schemaHash: result.schemaHash,
      refreshAfter: result.refreshAfter,
      latencyMs: result.latencyMs,
    },
  }
}

async function runCacheWarmJob(supabase: SupabaseClient, job: PlatformJob): Promise<PlatformJobRunResult> {
  const limit = typeof job.payload.limit === 'number' ? job.payload.limit : undefined
  const result = await warmQueryResultCache({
    supabase,
    tenantId: job.tenantId,
    projectId: job.projectId,
    targetType: job.targetType,
    targetId: job.targetId,
    limit,
  })

  return {
    ok: true,
    result: { ...result },
  }
}

export async function runPlatformJob(supabase: SupabaseClient, job: PlatformJob): Promise<PlatformJobRunResult> {
  if (job.jobType === 'dashboard_health') return runDashboardHealthJob(supabase, job)
  if (job.jobType === 'schema_refresh') return runSchemaRefreshJob(supabase, job)
  if (job.jobType === 'cache_warm') return runCacheWarmJob(supabase, job)
  if (job.jobType === 'export') {
    throw new Error('export executor is not implemented yet')
  }

  throw new Error(`Unsupported platform job type: ${job.jobType}`)
}
