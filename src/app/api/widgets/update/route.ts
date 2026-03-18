import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface WidgetPositionPayload {
  x: number
  y: number
  w: number
  h: number
}

interface WidgetUpdateRequest {
  id: string
  payload?: Record<string, unknown>
  position?: WidgetPositionPayload
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parsePosition(value: unknown): WidgetPositionPayload | null {
  const record = asRecord(value)
  if (!record) return null

  const x = Number(record.x)
  const y = Number(record.y)
  const w = Number(record.w)
  const h = Number(record.h)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null
  }

  return { x, y, w, h }
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
  if (userId) {
    return { supabase, userId }
  }

  return null
}

async function getBearerAuthedSupabase(req: NextRequest): Promise<{
  supabase: SupabaseClient
  userId: string
} | null> {
  const authHeader = req.headers.get('authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  if (!token) return null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
      },
    },
  )

  const { data: userData } = await supabase.auth.getUser(token)
  const userId = userData.user?.id
  if (!userId) return null

  return { supabase, userId }
}

export async function POST(req: NextRequest) {
  try {
    const auth = (await getAuthedSupabase()) ?? (await getBearerAuthedSupabase(req))
    if (!auth) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const raw = (await req.json()) as WidgetUpdateRequest
    const widgetId = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!widgetId) {
      return NextResponse.json({ ok: false, error: 'Widget id is required' }, { status: 400 })
    }

    const payload = asRecord(raw.payload) ?? {}
    const position = parsePosition(raw.position)

    const attempts: Array<Record<string, unknown>> = position
      ? [
        { ...payload, position, size: position },
        { ...payload, position },
        { ...payload, position: position.y, size: position },
        { ...payload, position: position.y },
      ]
      : [payload]

    let latestError: { message?: string } | null = null
    for (const attempt of attempts) {
      const { error } = await auth.supabase
        .from('widgets')
        .update(attempt)
        .eq('id', widgetId)
        .eq('user_id', auth.userId)

      if (!error) {
        return NextResponse.json({ ok: true })
      }
      latestError = error
    }

    return NextResponse.json({
      ok: false,
      error: latestError?.message ?? 'Failed to update widget',
    }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
