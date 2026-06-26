import type { SupabaseClient } from '@supabase/supabase-js'

import { runDataSourceSchemaIntrospection } from '@/lib/data-sources/schema-introspection-runner'
import { auditPublishedDashboards, recordDashboardHealthRuns } from '@/lib/publishing/dashboard-health-auditor'
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

  return {
    ok: true,
    result: {
      checkedAt: audit.checkedAt,
      summary: audit.summary,
      runCount: runs.length,
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

export async function runPlatformJob(supabase: SupabaseClient, job: PlatformJob): Promise<PlatformJobRunResult> {
  if (job.jobType === 'dashboard_health') return runDashboardHealthJob(supabase, job)
  if (job.jobType === 'schema_refresh') return runSchemaRefreshJob(supabase, job)
  if (job.jobType === 'export' || job.jobType === 'cache_warm') {
    throw new Error(`${job.jobType} executor is not implemented yet`)
  }

  throw new Error(`Unsupported platform job type: ${job.jobType}`)
}
