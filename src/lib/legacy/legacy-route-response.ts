import { NextResponse } from 'next/server'

interface LegacyRouteResponseInput {
  replacement: string
  reason: string
}

export function legacyRouteGone({ replacement, reason }: LegacyRouteResponseInput) {
  return NextResponse.json(
    {
      ok: false,
      error: 'This legacy API-dashboard route has been retired.',
      reason,
      replacement,
    },
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
        'X-DashboardOS-Replacement': replacement,
      },
    },
  )
}
