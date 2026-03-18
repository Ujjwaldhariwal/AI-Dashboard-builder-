import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { profileEndpointBatch, type PreviousEndpointProfileSnapshot, type TrainingTargetEndpoint } from '@/lib/training/profile-service'
import type { EndpointProfile, MappingCandidate, TrainingProfileRequest } from '@/types/training'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseMappingCandidate(value: unknown): MappingCandidate | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  if (
    typeof record.type !== 'string'
    || typeof record.xAxis !== 'string'
    || typeof record.reason !== 'string'
    || typeof record.confidence !== 'number'
    || typeof record.source !== 'string'
  ) {
    return undefined
  }

  return record as unknown as MappingCandidate
}

function parseHeaders(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const headers = Object.fromEntries(
    Object.entries(record).filter(([, headerValue]) => typeof headerValue === 'string'),
  ) as Record<string, string>

  return Object.keys(headers).length > 0 ? headers : undefined
}

async function getAuthedSupabase(): Promise<{
  supabase: SupabaseClient
  userId: string
} | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(cookie => ({
            name: cookie.name,
            value: cookie.value,
          }))
        },
        setAll() {
          // no-op in route handlers
        },
      },
    },
  )

  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return null

  return { supabase, userId }
}

function mapDbProfile(row: Record<string, unknown>): EndpointProfile {
  const parsedMapping = parseMappingCandidate(row.best_mapping)

  const driftRecord = asRecord(row.drift_flags)
  const parsedDriftFlags = {
    shapeChanged: Boolean(driftRecord?.shapeChanged),
    repeatedUnauthorized: Boolean(driftRecord?.repeatedUnauthorized),
    repeatedEmpty: Boolean(driftRecord?.repeatedEmpty),
    seedMismatch: Boolean(driftRecord?.seedMismatch),
  }

  return {
    endpointId: String(row.endpoint_id ?? ''),
    userId: String(row.user_id ?? ''),
    dashboardId: String(row.dashboard_id ?? ''),
    endpointName: String(row.endpoint_name ?? ''),
    endpointUrl: String(row.endpoint_url ?? ''),
    lastRunStatus: String(row.last_run_status ?? 'empty') as EndpointProfile['lastRunStatus'],
    lastStatusCode: typeof row.last_status_code === 'number' ? row.last_status_code : undefined,
    lastLatencyMs: typeof row.last_latency_ms === 'number' ? row.last_latency_ms : undefined,
    lastRowCount: typeof row.last_row_count === 'number' ? row.last_row_count : undefined,
    lastErrorClass: typeof row.last_error_class === 'string' ? row.last_error_class : undefined,
    lastLikelyReason: typeof row.last_likely_reason === 'string' ? row.last_likely_reason : undefined,
    shapeSignature: typeof row.shape_signature === 'string' ? row.shape_signature : undefined,
    fieldStats: Array.isArray(row.field_stats) ? row.field_stats as EndpointProfile['fieldStats'] : [],
    bestMapping: parsedMapping,
    confidence: typeof row.confidence === 'number' ? row.confidence : 0,
    confidenceBand: String(row.confidence_band ?? 'low') as EndpointProfile['confidenceBand'],
    patternClass: String(row.pattern_class ?? 'table-fallback') as EndpointProfile['patternClass'],
    driftFlags: parsedDriftFlags,
    consecutiveUnauthorizedCount: typeof row.consecutive_unauthorized_count === 'number'
      ? row.consecutive_unauthorized_count
      : 0,
    consecutiveEmptyCount: typeof row.consecutive_empty_count === 'number'
      ? row.consecutive_empty_count
      : 0,
    totalRuns: typeof row.total_runs === 'number' ? row.total_runs : 0,
    successfulRuns: typeof row.successful_runs === 'number' ? row.successful_runs : 0,
    lastProfiledAt: typeof row.last_profiled_at === 'string' ? row.last_profiled_at : new Date().toISOString(),
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ profiles: [], error: 'Unauthorized' }, { status: 401 })
    }

    const dashboardId = req.nextUrl.searchParams.get('dashboardId')
    if (!dashboardId) {
      return NextResponse.json({ profiles: [], error: 'dashboardId is required' }, { status: 400 })
    }

    const { data, error } = await auth.supabase
      .from('endpoint_profiles')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('dashboard_id', dashboardId)
      .order('updated_at', { ascending: false })

    if (error) {
      return NextResponse.json({ profiles: [], error: error.message }, { status: 500 })
    }

    const profiles = (data ?? []).map(row => mapDbProfile(row as Record<string, unknown>))
    return NextResponse.json({ profiles })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ profiles: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ summary: null, error: 'Unauthorized' }, { status: 401 })
    }

    const payload = (await req.json()) as TrainingProfileRequest
    const dashboardId = payload.dashboardId?.trim()
    if (!dashboardId) {
      return NextResponse.json({ summary: null, error: 'dashboardId is required' }, { status: 400 })
    }

    let endpointQuery = auth.supabase
      .from('endpoints')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('dashboard_id', dashboardId)
      .eq('status', 'active')

    if (payload.endpointIds?.length) {
      endpointQuery = endpointQuery.in('id', payload.endpointIds)
    }

    const { data: endpointRows, error: endpointError } = await endpointQuery
    if (endpointError) {
      return NextResponse.json({ summary: null, error: endpointError.message }, { status: 500 })
    }

    const endpoints = (endpointRows ?? [])
      .map(row => ({
        id: String(row.id),
        dashboardId,
        name: String(row.name ?? 'Untitled Endpoint'),
        url: String(row.url ?? '').trim(),
        method: row.method === 'POST' ? 'POST' : 'GET',
        headers: parseHeaders(row.headers),
        body: row.body,
        status: row.status === 'inactive' ? 'inactive' : 'active',
      } as TrainingTargetEndpoint))
      .filter(endpoint => endpoint.url.length > 0)

    if (endpoints.length === 0) {
      return NextResponse.json({
        summary: {
          scanned: 0,
          mappedHighConfidence: 0,
          reviewRequired: 0,
          unauthorized: 0,
          empty: 0,
          failed: 0,
          results: [],
        },
      })
    }

    const { data: previousProfileRows, error: previousProfileError } = await auth.supabase
      .from('endpoint_profiles')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('dashboard_id', dashboardId)
      .in('endpoint_id', endpoints.map(endpoint => endpoint.id))

    if (previousProfileError) {
      return NextResponse.json({ summary: null, error: previousProfileError.message }, { status: 500 })
    }

    const previousProfiles = Object.fromEntries((previousProfileRows ?? []).map(row => [
      String(row.endpoint_id),
      {
        shapeSignature: typeof row.shape_signature === 'string' ? row.shape_signature : undefined,
        consecutiveUnauthorizedCount: typeof row.consecutive_unauthorized_count === 'number'
          ? row.consecutive_unauthorized_count
          : 0,
        consecutiveEmptyCount: typeof row.consecutive_empty_count === 'number'
          ? row.consecutive_empty_count
          : 0,
      } as PreviousEndpointProfileSnapshot,
    ]))

    const summaryWithDetails = await profileEndpointBatch({
      endpoints,
      options: {
        origin: req.nextUrl.origin,
        cookieHeader: req.headers.get('cookie'),
        demoSession: payload.demoSession,
        previousProfiles,
      },
    })

    const nowIso = new Date().toISOString()
    const previousByEndpointId = Object.fromEntries((previousProfileRows ?? []).map(row => [String(row.endpoint_id), row]))

    for (const result of summaryWithDetails.detailedResults) {
      const previousRow = previousByEndpointId[result.endpointId] as Record<string, unknown> | undefined

      const previousUnauthorized = typeof previousRow?.consecutive_unauthorized_count === 'number'
        ? previousRow.consecutive_unauthorized_count
        : 0
      const previousEmpty = typeof previousRow?.consecutive_empty_count === 'number'
        ? previousRow.consecutive_empty_count
        : 0

      const nextUnauthorized = result.status === 'unauthorized' ? previousUnauthorized + 1 : 0
      const nextEmpty = result.status === 'empty' ? previousEmpty + 1 : 0

      const previousTotalRuns = typeof previousRow?.total_runs === 'number' ? previousRow.total_runs : 0
      const previousSuccessfulRuns = typeof previousRow?.successful_runs === 'number'
        ? previousRow.successful_runs
        : 0

      const totalRuns = previousTotalRuns + 1
      const successfulRuns = previousSuccessfulRuns + (result.status === 'healthy' ? 1 : 0)

      const previousBestMapping = parseMappingCandidate(previousRow?.best_mapping)
      const bestMapping = result.status === 'healthy' && result.candidateMapping
        ? result.candidateMapping
        : previousBestMapping

      const previousConfidence = typeof previousRow?.confidence === 'number' ? previousRow.confidence : 0
      const confidence = result.status === 'healthy' ? result.confidence : previousConfidence
      const confidenceBand = result.status === 'healthy'
        ? result.confidenceBand
        : String(previousRow?.confidence_band ?? 'low')

      const patternClass = result.status === 'healthy'
        ? result.patternClass
        : String(previousRow?.pattern_class ?? 'table-fallback')

      const fieldStats = result.status === 'healthy' && result.fieldStatsJson.length > 0
        ? result.fieldStatsJson
        : (Array.isArray(previousRow?.field_stats) ? previousRow?.field_stats : [])

      const shapeSignature = result.shapeSignature ?? (typeof previousRow?.shape_signature === 'string'
        ? previousRow.shape_signature
        : null)

      const driftFlags = {
        ...(asRecord(previousRow?.drift_flags) ?? {}),
        ...result.driftFlags,
        repeatedUnauthorized: nextUnauthorized >= 2,
        repeatedEmpty: nextEmpty >= 2,
      }

      const { error: runError } = await auth.supabase
        .from('endpoint_profile_runs')
        .insert({
          user_id: auth.userId,
          dashboard_id: dashboardId,
          endpoint_id: result.endpointId,
          endpoint_name: result.endpointName,
          endpoint_url: result.endpointUrl,
          run_status: result.status,
          status_code: result.statusCode ?? null,
          latency_ms: result.latencyMs ?? null,
          row_count: result.rowCount ?? 0,
          error_class: result.status === 'healthy' ? null : result.status,
          likely_reason: result.likelyReason ?? null,
          shape_signature: result.shapeSignature ?? null,
          field_stats: result.fieldStatsJson,
          candidate_mapping: result.candidateMapping ?? null,
          confidence: result.confidence,
          confidence_band: result.confidenceBand,
          pattern_class: result.patternClass,
          drift_flags: result.driftFlags,
          created_at: nowIso,
        })

      if (runError) {
        return NextResponse.json(
          { summary: null, error: `Failed to persist endpoint profile run: ${runError.message}` },
          { status: 500 },
        )
      }

      const { error: profileError } = await auth.supabase
        .from('endpoint_profiles')
        .upsert({
          endpoint_id: result.endpointId,
          user_id: auth.userId,
          dashboard_id: dashboardId,
          endpoint_name: result.endpointName,
          endpoint_url: result.endpointUrl,
          last_run_status: result.status,
          last_status_code: result.statusCode ?? null,
          last_latency_ms: result.latencyMs ?? null,
          last_row_count: result.rowCount ?? 0,
          last_error_class: result.status === 'healthy' ? null : result.status,
          last_likely_reason: result.likelyReason ?? null,
          shape_signature: shapeSignature,
          field_stats: fieldStats,
          best_mapping: bestMapping ?? null,
          confidence,
          confidence_band: confidenceBand,
          pattern_class: patternClass,
          drift_flags: driftFlags,
          consecutive_unauthorized_count: nextUnauthorized,
          consecutive_empty_count: nextEmpty,
          total_runs: totalRuns,
          successful_runs: successfulRuns,
          last_profiled_at: nowIso,
          updated_at: nowIso,
        }, {
          onConflict: 'endpoint_id',
        })

      if (profileError) {
        return NextResponse.json(
          { summary: null, error: `Failed to persist endpoint profile: ${profileError.message}` },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({
      summary: {
        scanned: summaryWithDetails.scanned,
        mappedHighConfidence: summaryWithDetails.mappedHighConfidence,
        reviewRequired: summaryWithDetails.reviewRequired,
        unauthorized: summaryWithDetails.unauthorized,
        empty: summaryWithDetails.empty,
        failed: summaryWithDetails.failed,
        results: summaryWithDetails.results,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ summary: null, error: message }, { status: 500 })
  }
}
