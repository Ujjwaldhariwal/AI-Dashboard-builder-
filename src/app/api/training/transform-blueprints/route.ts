import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { TransformOpSchema } from '@/lib/ai/agent-schemas'
import { getSupabaseAnonKey, SUPABASE_URL } from '@/lib/supabase/config'

const MAX_TRANSFORM_COUNT = 32
const MAX_SAMPLE_ROWS = 100
const MAX_SAMPLE_DATA_BYTES = 150_000

const SaveTransformBlueprintSchema = z.object({
  dashboardId: z.string().uuid().optional(),
  endpointId: z.string().uuid('endpointId must be a valid UUID'),
  endpointName: z.string().trim().min(1, 'endpointName is required'),
  prompt: z.string().trim().optional(),
  transforms: z.array(TransformOpSchema).min(1).max(MAX_TRANSFORM_COUNT),
  sampleData: z.array(z.unknown()).max(MAX_SAMPLE_ROWS).optional(),
}).strict()

function getJsonSizeBytes(value: unknown): number {
  const json = JSON.stringify(value)
  return new TextEncoder().encode(json).length
}

async function getAuthedSupabase(): Promise<{
  supabase: SupabaseClient
  userId: string
} | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    SUPABASE_URL,
    getSupabaseAnonKey(),
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

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = SaveTransformBlueprintSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 })
    }

    const payload = parsed.data
    if (payload.sampleData && getJsonSizeBytes(payload.sampleData) > MAX_SAMPLE_DATA_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: `sampleData payload exceeds ${MAX_SAMPLE_DATA_BYTES} bytes`,
        },
        { status: 400 },
      )
    }

    const nowIso = new Date().toISOString()
    const { error } = await auth.supabase
      .from('transform_blueprints')
      .insert({
        user_id: auth.userId,
        dashboard_id: payload.dashboardId ?? null,
        endpoint_id: payload.endpointId,
        endpoint_name: payload.endpointName,
        prompt: payload.prompt?.trim() ? payload.prompt.trim() : null,
        transforms: payload.transforms,
        sample_data: payload.sampleData ?? null,
        schema_version: 1,
        created_at: nowIso,
        updated_at: nowIso,
      })

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Failed to persist transform blueprint: ${error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
