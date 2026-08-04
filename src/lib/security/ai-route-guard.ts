import { NextRequest, NextResponse } from 'next/server'

import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { getAuthedSupabase } from '@/lib/supabase/server'

export async function guardAiRoute(
  req: NextRequest,
  workflow: string,
  maxBodyBytes = 128_000,
) {
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
  }

  const auth = await getAuthedSupabase()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimit = await checkRuntimeRateLimit({
    key: `ai:${workflow}:${auth.userId}`,
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'Too many AI requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      },
    )
  }

  return auth
}
