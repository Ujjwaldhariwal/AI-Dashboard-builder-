import type { SupabaseClient } from '@supabase/supabase-js'

import { mapPlatformAlert, type PlatformAlert, type PlatformAlertSeverity } from '@/lib/alerts/platform-alerts'

export type PlatformAlertChannelType = 'webhook' | 'email'
export type PlatformAlertDeliveryStatus = 'succeeded' | 'failed' | 'skipped'

export interface PlatformAlertChannel {
  id: string
  tenantId: string
  projectId: string | null
  name: string
  channelType: PlatformAlertChannelType
  enabled: boolean
  severityMin: PlatformAlertSeverity
  config: Record<string, unknown>
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PlatformAlertDeliveryAttempt {
  id: string
  tenantId: string
  projectId: string | null
  alertId: string
  channelId: string | null
  jobId: string | null
  channelType: PlatformAlertChannelType
  destination: string
  status: PlatformAlertDeliveryStatus
  requestPayload: Record<string, unknown>
  responseStatus: number | null
  responseBody: string | null
  errorMessage: string | null
  attemptedAt: string
}

interface ListPlatformAlertChannelsInput {
  supabase: SupabaseClient
  tenantId?: string | null
  projectId?: string | null
  enabled?: boolean | null
  limit?: number
}

interface UpsertPlatformAlertChannelInput {
  supabase: SupabaseClient
  tenantId: string
  projectId?: string | null
  name: string
  channelType: PlatformAlertChannelType
  enabled?: boolean
  severityMin?: PlatformAlertSeverity
  config?: Record<string, unknown>
  createdBy?: string | null
}

const SEVERITY_RANK: Record<PlatformAlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string') as string[]
  return typeof value === 'string' && value.trim() ? [value] : []
}

function textPreview(value: string, maxLength = 1500) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

export function mapPlatformAlertChannel(row: Record<string, unknown>): PlatformAlertChannel {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    name: String(row.name ?? ''),
    channelType: String(row.channel_type ?? 'webhook') as PlatformAlertChannelType,
    enabled: row.enabled !== false,
    severityMin: String(row.severity_min ?? 'warning') as PlatformAlertSeverity,
    config: asRecord(row.config),
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export function mapPlatformAlertDeliveryAttempt(row: Record<string, unknown>): PlatformAlertDeliveryAttempt {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    alertId: String(row.alert_id),
    channelId: typeof row.channel_id === 'string' ? row.channel_id : null,
    jobId: typeof row.job_id === 'string' ? row.job_id : null,
    channelType: String(row.channel_type ?? 'webhook') as PlatformAlertChannelType,
    destination: String(row.destination ?? ''),
    status: String(row.status ?? 'skipped') as PlatformAlertDeliveryStatus,
    requestPayload: asRecord(row.request_payload),
    responseStatus: typeof row.response_status === 'number' ? row.response_status : null,
    responseBody: typeof row.response_body === 'string' ? row.response_body : null,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    attemptedAt: String(row.attempted_at ?? new Date().toISOString()),
  }
}

export async function listPlatformAlertChannels({
  supabase,
  tenantId,
  projectId,
  enabled,
  limit = 50,
}: ListPlatformAlertChannelsInput): Promise<PlatformAlertChannel[]> {
  const clampedLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  let query = supabase
    .from('platform_alert_channels')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(clampedLimit)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (projectId) query = query.eq('project_id', projectId)
  if (typeof enabled === 'boolean') query = query.eq('enabled', enabled)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(mapPlatformAlertChannel)
}

export async function upsertPlatformAlertChannel({
  supabase,
  tenantId,
  projectId = null,
  name,
  channelType,
  enabled = true,
  severityMin = 'warning',
  config = {},
  createdBy = null,
}: UpsertPlatformAlertChannelInput): Promise<PlatformAlertChannel> {
  const nowIso = new Date().toISOString()

  let existingQuery = supabase
    .from('platform_alert_channels')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', name)

  existingQuery = projectId ? existingQuery.eq('project_id', projectId) : existingQuery.is('project_id', null)
  const { data: existing, error: existingError } = await existingQuery.maybeSingle()
  if (existingError) throw new Error(existingError.message)

  if (existing?.id) {
    const { data, error } = await supabase
      .from('platform_alert_channels')
      .update({
        channel_type: channelType,
        enabled,
        severity_min: severityMin,
        config,
        updated_at: nowIso,
      })
      .eq('id', String(existing.id))
      .select('*')
      .single()

    if (error || !data) throw new Error(error?.message ?? 'Unable to save alert channel')
    return mapPlatformAlertChannel(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from('platform_alert_channels')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      name,
      channel_type: channelType,
      enabled,
      severity_min: severityMin,
      config,
      created_by: createdBy,
      updated_at: nowIso,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Unable to save alert channel')
  return mapPlatformAlertChannel(data as Record<string, unknown>)
}

export async function listPlatformAlertDeliveryAttempts({
  supabase,
  tenantId,
  projectId,
  alertId,
  limit = 50,
}: {
  supabase: SupabaseClient
  tenantId?: string | null
  projectId?: string | null
  alertId?: string | null
  limit?: number
}): Promise<PlatformAlertDeliveryAttempt[]> {
  const clampedLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  let query = supabase
    .from('platform_alert_delivery_attempts')
    .select('*')
    .order('attempted_at', { ascending: false })
    .limit(clampedLimit)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (projectId) query = query.eq('project_id', projectId)
  if (alertId) query = query.eq('alert_id', alertId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(mapPlatformAlertDeliveryAttempt)
}

async function recordDeliveryAttempt({
  supabase,
  alert,
  channel,
  jobId,
  destination,
  status,
  requestPayload,
  responseStatus = null,
  responseBody = null,
  errorMessage = null,
}: {
  supabase: SupabaseClient
  alert: PlatformAlert
  channel: PlatformAlertChannel
  jobId?: string | null
  destination: string
  status: PlatformAlertDeliveryStatus
  requestPayload: Record<string, unknown>
  responseStatus?: number | null
  responseBody?: string | null
  errorMessage?: string | null
}) {
  const { data, error } = await supabase
    .from('platform_alert_delivery_attempts')
    .insert({
      tenant_id: alert.tenantId,
      project_id: alert.projectId,
      alert_id: alert.id,
      channel_id: channel.id,
      job_id: jobId,
      channel_type: channel.channelType,
      destination,
      status,
      request_payload: requestPayload,
      response_status: responseStatus,
      response_body: responseBody,
      error_message: errorMessage,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Unable to record alert delivery attempt')
  return mapPlatformAlertDeliveryAttempt(data as Record<string, unknown>)
}

function alertPayload(alert: PlatformAlert, channel: PlatformAlertChannel) {
  return {
    event: 'platform.alert.opened',
    channel: {
      id: channel.id,
      name: channel.name,
      type: channel.channelType,
    },
    alert: {
      id: alert.id,
      tenantId: alert.tenantId,
      projectId: alert.projectId,
      alertKey: alert.alertKey,
      alertType: alert.alertType,
      severity: alert.severity,
      state: alert.state,
      title: alert.title,
      message: alert.message,
      sourceType: alert.sourceType,
      sourceId: alert.sourceId,
      firstSeenAt: alert.firstSeenAt,
      lastSeenAt: alert.lastSeenAt,
      metadata: alert.metadata,
    },
  }
}

async function deliverWebhook({
  supabase,
  alert,
  channel,
  jobId,
}: {
  supabase: SupabaseClient
  alert: PlatformAlert
  channel: PlatformAlertChannel
  jobId?: string | null
}) {
  const url = typeof channel.config.url === 'string' ? channel.config.url : ''
  const payload = alertPayload(alert, channel)
  if (!url) {
    return recordDeliveryAttempt({
      supabase,
      alert,
      channel,
      jobId,
      destination: channel.name,
      status: 'skipped',
      requestPayload: payload,
      errorMessage: 'Webhook channel requires config.url',
    })
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dashboardos-alert-id': alert.id,
        'x-dashboardos-alert-type': alert.alertType,
      },
      body: JSON.stringify(payload),
    })
    const body = textPreview(await response.text().catch(() => ''))

    return recordDeliveryAttempt({
      supabase,
      alert,
      channel,
      jobId,
      destination: url,
      status: response.ok ? 'succeeded' : 'failed',
      requestPayload: payload,
      responseStatus: response.status,
      responseBody: body,
      errorMessage: response.ok ? null : `Webhook returned HTTP ${response.status}`,
    })
  } catch (error) {
    return recordDeliveryAttempt({
      supabase,
      alert,
      channel,
      jobId,
      destination: url,
      status: 'failed',
      requestPayload: payload,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
  }
}

async function deliverEmail({
  supabase,
  alert,
  channel,
  jobId,
}: {
  supabase: SupabaseClient
  alert: PlatformAlert
  channel: PlatformAlertChannel
  jobId?: string | null
}) {
  const to = asStringArray(channel.config.to)
  const gatewayUrl = typeof channel.config.webhookUrl === 'string' ? channel.config.webhookUrl : ''
  const payload = {
    ...alertPayload(alert, channel),
    email: {
      to,
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      text: `${alert.title}\n\n${alert.message}`,
    },
  }
  const destination = to.join(', ') || channel.name

  if (!gatewayUrl) {
    return recordDeliveryAttempt({
      supabase,
      alert,
      channel,
      jobId,
      destination,
      status: 'skipped',
      requestPayload: payload,
      errorMessage: 'Email channel requires config.webhookUrl until a native mail provider is configured',
    })
  }

  try {
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dashboardos-alert-id': alert.id,
        'x-dashboardos-channel-type': 'email',
      },
      body: JSON.stringify(payload),
    })
    const body = textPreview(await response.text().catch(() => ''))

    return recordDeliveryAttempt({
      supabase,
      alert,
      channel,
      jobId,
      destination,
      status: response.ok ? 'succeeded' : 'failed',
      requestPayload: payload,
      responseStatus: response.status,
      responseBody: body,
      errorMessage: response.ok ? null : `Email gateway returned HTTP ${response.status}`,
    })
  } catch (error) {
    return recordDeliveryAttempt({
      supabase,
      alert,
      channel,
      jobId,
      destination,
      status: 'failed',
      requestPayload: payload,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function deliverPlatformAlert({
  supabase,
  alertId,
  jobId = null,
}: {
  supabase: SupabaseClient
  alertId: string
  jobId?: string | null
}) {
  const { data: alertRow, error: alertError } = await supabase
    .from('platform_alerts')
    .select('*')
    .eq('id', alertId)
    .single()

  if (alertError || !alertRow) throw new Error(alertError?.message ?? 'Alert not found')
  const alert = mapPlatformAlert(alertRow as Record<string, unknown>)

  if (alert.state === 'resolved') {
    return { delivered: 0, failed: 0, skipped: 1, attempts: [] as PlatformAlertDeliveryAttempt[] }
  }

  const { data: channelRows, error: channelError } = await supabase
    .from('platform_alert_channels')
    .select('*')
    .eq('tenant_id', alert.tenantId)
    .eq('enabled', true)
    .or(`project_id.is.null,project_id.eq.${alert.projectId ?? '00000000-0000-0000-0000-000000000000'}`)

  if (channelError) throw new Error(channelError.message)
  const channels = ((channelRows ?? []) as Record<string, unknown>[])
    .map(mapPlatformAlertChannel)
    .filter(channel => SEVERITY_RANK[alert.severity] >= SEVERITY_RANK[channel.severityMin])

  const attempts: PlatformAlertDeliveryAttempt[] = []
  for (const channel of channels) {
    const attempt = channel.channelType === 'email'
      ? await deliverEmail({ supabase, alert, channel, jobId })
      : await deliverWebhook({ supabase, alert, channel, jobId })
    attempts.push(attempt)
  }

  return {
    delivered: attempts.filter(attempt => attempt.status === 'succeeded').length,
    failed: attempts.filter(attempt => attempt.status === 'failed').length,
    skipped: attempts.filter(attempt => attempt.status === 'skipped').length,
    attempts,
  }
}
