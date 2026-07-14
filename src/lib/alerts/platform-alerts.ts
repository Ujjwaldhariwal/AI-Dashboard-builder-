import type { SupabaseClient } from '@supabase/supabase-js'

import { enqueuePlatformJob } from '@/lib/jobs/platform-jobs'
import type { DashboardHealthAudit } from '@/types/dashboard-publishing'

export type PlatformAlertState = 'open' | 'acknowledged' | 'resolved'
export type PlatformAlertSeverity = 'info' | 'warning' | 'critical'
export type PlatformAlertType = 'dashboard_blocked' | 'chart_stale' | 'schema_refresh_failed' | 'job_failed'

export interface PlatformAlert {
  id: string
  tenantId: string
  projectId: string | null
  alertKey: string
  alertType: PlatformAlertType
  severity: PlatformAlertSeverity
  state: PlatformAlertState
  title: string
  message: string
  sourceType: string
  sourceId: string
  firstSeenAt: string
  lastSeenAt: string
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function mapPlatformAlert(row: Record<string, unknown>): PlatformAlert {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    alertKey: String(row.alert_key),
    alertType: String(row.alert_type) as PlatformAlertType,
    severity: String(row.severity) as PlatformAlertSeverity,
    state: String(row.state) as PlatformAlertState,
    title: String(row.title ?? ''),
    message: String(row.message ?? ''),
    sourceType: String(row.source_type ?? ''),
    sourceId: String(row.source_id),
    firstSeenAt: String(row.first_seen_at ?? new Date().toISOString()),
    lastSeenAt: String(row.last_seen_at ?? new Date().toISOString()),
    acknowledgedAt: typeof row.acknowledged_at === 'string' ? row.acknowledged_at : null,
    acknowledgedBy: typeof row.acknowledged_by === 'string' ? row.acknowledged_by : null,
    resolvedAt: typeof row.resolved_at === 'string' ? row.resolved_at : null,
    resolvedBy: typeof row.resolved_by === 'string' ? row.resolved_by : null,
    metadata: asRecord(row.metadata),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function listPlatformAlerts({
  supabase,
  tenantId,
  projectId,
  state,
  limit = 50,
}: {
  supabase: SupabaseClient
  tenantId?: string | null
  projectId?: string | null
  state?: PlatformAlertState | null
  limit?: number
}) {
  const clampedLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  let query = supabase
    .from('platform_alerts')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(clampedLimit)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (projectId) query = query.eq('project_id', projectId)
  if (state) query = query.eq('state', state)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(row => mapPlatformAlert(row))
}

export async function updatePlatformAlertState({
  supabase,
  alertId,
  state,
  actorUserId,
}: {
  supabase: SupabaseClient
  alertId: string
  state: 'acknowledged' | 'resolved'
  actorUserId: string
}) {
  const nowIso = new Date().toISOString()
  const update = state === 'acknowledged'
    ? {
      state,
      acknowledged_at: nowIso,
      acknowledged_by: actorUserId,
      updated_at: nowIso,
    }
    : {
      state,
      resolved_at: nowIso,
      resolved_by: actorUserId,
      updated_at: nowIso,
    }

  const { data, error } = await supabase
    .from('platform_alerts')
    .update(update)
    .eq('id', alertId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapPlatformAlert(data as Record<string, unknown>)
}

export async function reconcileDashboardHealthAlerts({
  supabase,
  audit,
}: {
  supabase: SupabaseClient
  audit: DashboardHealthAudit
}) {
  if (audit.dashboards.length === 0) return { opened: 0, refreshed: 0, resolved: 0, deliveryJobs: 0 }

  const dashboardIds = audit.dashboards.map(item => item.dashboard.id)
  const { data: dashboardRows, error: dashboardError } = await supabase
    .from('published_dashboards')
    .select('id, tenant_id, project_id, name, slug')
    .in('id', dashboardIds)

  if (dashboardError) throw new Error(dashboardError.message)
  const ownership = new Map((dashboardRows ?? []).map(row => [
    String(row.id),
    {
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      name: String(row.name ?? ''),
      slug: String(row.slug ?? ''),
    },
  ]))

  let opened = 0
  let refreshed = 0
  let resolved = 0
  let deliveryJobs = 0
  const nowIso = new Date().toISOString()

  for (const item of audit.dashboards) {
    const owner = ownership.get(item.dashboard.id)
    if (!owner) continue

    const alertKey = `dashboard_blocked:${item.dashboard.id}`
    const metadata = {
      dashboard: item.dashboard,
      version: item.version,
      summary: item.summary,
      blockedSlots: item.items.filter(slot => slot.healthState === 'blocked').map(slot => ({
        slot: slot.slot,
        chart: slot.chart,
        issues: slot.issues,
      })),
      checkedAt: audit.checkedAt,
    }

    if (item.healthState === 'blocked') {
      const { data: existing, error: existingError } = await supabase
        .from('platform_alerts')
        .select('id')
        .eq('alert_key', alertKey)
        .in('state', ['open', 'acknowledged'])
        .maybeSingle()

      if (existingError) throw new Error(existingError.message)

      if (existing?.id) {
        const { error } = await supabase
          .from('platform_alerts')
          .update({
            state: 'open',
            severity: 'critical',
            title: `Dashboard blocked: ${owner.name}`,
            message: `${item.summary.blockedSlots} blocked slot(s) prevent this dashboard from being healthy.`,
            last_seen_at: audit.checkedAt,
            metadata,
            updated_at: nowIso,
          })
          .eq('id', existing.id)

        if (error) throw new Error(error.message)
        refreshed += 1
      } else {
        const { data: inserted, error } = await supabase
          .from('platform_alerts')
          .insert({
            tenant_id: owner.tenantId,
            project_id: owner.projectId,
            alert_key: alertKey,
            alert_type: 'dashboard_blocked',
            severity: 'critical',
            state: 'open',
            title: `Dashboard blocked: ${owner.name}`,
            message: `${item.summary.blockedSlots} blocked slot(s) prevent this dashboard from being healthy.`,
            source_type: 'dashboard',
            source_id: item.dashboard.id,
            first_seen_at: audit.checkedAt,
            last_seen_at: audit.checkedAt,
            metadata,
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select('id')
          .single()

        if (error) throw new Error(error.message)
        if (inserted?.id) {
          await enqueuePlatformJob({
            supabase,
            tenantId: owner.tenantId,
            projectId: owner.projectId,
            jobType: 'alert_delivery',
            targetType: 'alert',
            targetId: String(inserted.id),
            priority: 50,
            maxAttempts: 5,
            dedupeKey: `alert_delivery:${String(inserted.id)}:opened`,
            payload: {
              alertType: 'dashboard_blocked',
              sourceType: 'dashboard',
              sourceId: item.dashboard.id,
            },
          })
          deliveryJobs += 1
        }
        opened += 1
      }
      continue
    }

    const { data, error } = await supabase
      .from('platform_alerts')
      .update({
        state: 'resolved',
        resolved_at: audit.checkedAt,
        resolved_by: null,
        metadata: {
          resolvedByHealth: true,
          previousAlertKey: alertKey,
          healthState: item.healthState,
          summary: item.summary,
          checkedAt: audit.checkedAt,
        },
        updated_at: nowIso,
      })
      .eq('alert_key', alertKey)
      .in('state', ['open', 'acknowledged'])
      .select('id')

    if (error) throw new Error(error.message)
    resolved += data?.length ?? 0
  }

  return { opened, refreshed, resolved, deliveryJobs }
}
