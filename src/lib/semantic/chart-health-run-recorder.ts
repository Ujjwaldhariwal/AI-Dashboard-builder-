import type { SupabaseClient } from '@supabase/supabase-js'

import type { DashboardChartAudit } from '@/lib/semantic/chart-health-auditor'

interface RecordChartHealthRunInput {
  supabase: SupabaseClient
  audit: DashboardChartAudit
  checkedBy: string
  tenantId?: string | null
  projectId?: string | null
  statusFilter?: string | null
}

export async function recordChartHealthRun({
  supabase,
  audit,
  checkedBy,
  tenantId = null,
  projectId = null,
  statusFilter = 'published',
}: RecordChartHealthRunInput) {
  const degradedChartIds = audit.items
    .filter(item => item.healthState !== 'healthy')
    .map(item => item.chart.id)

  const { data, error } = await supabase
    .from('chart_health_runs')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      checked_by: checkedBy,
      status_filter: statusFilter ?? 'published',
      total_count: audit.summary.total,
      healthy_count: audit.summary.healthy,
      stale_count: audit.summary.stale,
      blocked_count: audit.summary.blocked,
      degraded_chart_ids: degradedChartIds,
      summary: audit.summary,
      items: audit.items,
      checked_at: audit.checkedAt,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as Record<string, unknown>
}
