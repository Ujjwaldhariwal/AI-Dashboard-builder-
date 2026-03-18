import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MappingCandidate } from '@/types/training'

interface FeedbackRequest {
  dashboardId: string
  endpointId: string
  widgetId?: string
  sourceAction: 'create_widget' | 'edit_widget' | 'review_override' | 'review_accept'
  acceptedMapping: MappingCandidate
  previousMapping?: MappingCandidate
  notes?: string
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

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const payload = (await req.json()) as FeedbackRequest
    if (!payload.dashboardId || !payload.endpointId || !payload.acceptedMapping) {
      return NextResponse.json({ ok: false, error: 'dashboardId, endpointId and acceptedMapping are required' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()

    const { error: insertError } = await auth.supabase
      .from('endpoint_mapping_feedback')
      .insert({
        user_id: auth.userId,
        dashboard_id: payload.dashboardId,
        endpoint_id: payload.endpointId,
        widget_id: payload.widgetId ?? null,
        source_action: payload.sourceAction,
        accepted_mapping: payload.acceptedMapping,
        previous_mapping: payload.previousMapping ?? null,
        notes: payload.notes ?? null,
        created_at: nowIso,
      })

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 })
    }

    const { data: existingProfile, error: existingError } = await auth.supabase
      .from('endpoint_profiles')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('dashboard_id', payload.dashboardId)
      .eq('endpoint_id', payload.endpointId)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 })
    }

    const nextConfidence = Math.max(
      typeof existingProfile?.confidence === 'number' ? existingProfile.confidence : 0,
      88,
      payload.acceptedMapping.confidence ?? 88,
    )

    const { error: upsertError } = await auth.supabase
      .from('endpoint_profiles')
      .upsert({
        endpoint_id: payload.endpointId,
        user_id: auth.userId,
        dashboard_id: payload.dashboardId,
        endpoint_name: existingProfile?.endpoint_name ?? 'Endpoint',
        endpoint_url: existingProfile?.endpoint_url ?? '',
        last_run_status: existingProfile?.last_run_status ?? 'healthy',
        last_status_code: existingProfile?.last_status_code ?? null,
        last_latency_ms: existingProfile?.last_latency_ms ?? null,
        last_row_count: existingProfile?.last_row_count ?? 0,
        last_error_class: existingProfile?.last_error_class ?? null,
        last_likely_reason: existingProfile?.last_likely_reason ?? null,
        shape_signature: existingProfile?.shape_signature ?? null,
        field_stats: existingProfile?.field_stats ?? [],
        best_mapping: payload.acceptedMapping,
        confidence: nextConfidence,
        confidence_band: 'high',
        pattern_class: existingProfile?.pattern_class ?? 'table-fallback',
        drift_flags: existingProfile?.drift_flags ?? {
          shapeChanged: false,
          repeatedUnauthorized: false,
          repeatedEmpty: false,
          seedMismatch: false,
        },
        consecutive_unauthorized_count: existingProfile?.consecutive_unauthorized_count ?? 0,
        consecutive_empty_count: existingProfile?.consecutive_empty_count ?? 0,
        total_runs: existingProfile?.total_runs ?? 0,
        successful_runs: existingProfile?.successful_runs ?? 0,
        last_profiled_at: existingProfile?.last_profiled_at ?? nowIso,
        updated_at: nowIso,
      }, {
        onConflict: 'endpoint_id',
      })

    if (upsertError) {
      return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}