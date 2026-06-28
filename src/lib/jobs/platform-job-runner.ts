import type { SupabaseClient } from '@supabase/supabase-js'

import { deliverPlatformAlert } from '@/lib/alerts/alert-delivery'
import { reconcileDashboardHealthAlerts } from '@/lib/alerts/platform-alerts'
import { runDataSourceSchemaIntrospection } from '@/lib/data-sources/schema-introspection-runner'
import { createDashboardExport, type DashboardExportType } from '@/lib/publishing/dashboard-export-artifact'
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

async function runExportJob(supabase: SupabaseClient, job: PlatformJob): Promise<PlatformJobRunResult> {
  const exportType = typeof job.payload.exportType === 'string' ? job.payload.exportType : 'manifest_json'
  if (!['manifest_json', 'report_pdf', 'bundle_zip'].includes(exportType)) throw new Error(`Unsupported export type: ${exportType}`)
  if (job.targetType !== 'dashboard' && job.targetType !== 'dashboard_version') {
    throw new Error('export jobs require targetType=dashboard or targetType=dashboard_version')
  }
  if (!job.targetId) throw new Error('export jobs require targetId')

  const artifact = await createDashboardExport({
    supabase,
    exportType: exportType as DashboardExportType,
    dashboardId: job.targetType === 'dashboard' ? job.targetId : null,
    versionId: job.targetType === 'dashboard_version' ? job.targetId : null,
    requestedBy: job.createdBy,
    jobId: job.id,
  })

  return {
    ok: true,
    result: {
      artifactId: artifact.id,
      artifactName: artifact.artifactName,
      contentType: artifact.contentType,
      exportType: artifact.exportType,
      dashboardId: artifact.dashboardId,
      versionId: artifact.versionId,
      storageBucket: artifact.storageBucket,
      storagePath: artifact.storagePath,
      storageStatus: artifact.storageStatus,
      byteSize: artifact.byteSize,
      checksumSha256: artifact.checksumSha256,
      metadata: artifact.metadata,
    },
  }
}

async function runAlertDeliveryJob(supabase: SupabaseClient, job: PlatformJob): Promise<PlatformJobRunResult> {
  const alertId = requireTargetId(job, 'alert')
  const result = await deliverPlatformAlert({
    supabase,
    alertId,
    jobId: job.id,
  })

  return {
    ok: true,
    result: {
      alertId,
      delivered: result.delivered,
      failed: result.failed,
      skipped: result.skipped,
      attemptIds: result.attempts.map(attempt => attempt.id),
    },
  }
}

export async function runPlatformJob(supabase: SupabaseClient, job: PlatformJob): Promise<PlatformJobRunResult> {
  if (job.jobType === 'dashboard_health') return runDashboardHealthJob(supabase, job)
  if (job.jobType === 'schema_refresh') return runSchemaRefreshJob(supabase, job)
  if (job.jobType === 'cache_warm') return runCacheWarmJob(supabase, job)
  if (job.jobType === 'export') return runExportJob(supabase, job)
  if (job.jobType === 'alert_delivery') return runAlertDeliveryJob(supabase, job)

  throw new Error(`Unsupported platform job type: ${job.jobType}`)
}
