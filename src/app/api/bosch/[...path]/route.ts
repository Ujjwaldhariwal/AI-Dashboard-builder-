import { NextRequest, NextResponse } from 'next/server'

const BOSCH_BASE = 'https://kadashboard.kaamismartmeters.com/BOSCH/API'

type RouteContext = {
  params: Promise<{
    path: string[]
  }>
}

function buildEndpoint(path: string[] | undefined): string | null {
  if (!path || path.length === 0) return null
  return `/${path.join('/')}`
}

async function forwardToBosch(req: NextRequest, ctx: RouteContext) {
  const params = await ctx.params
  const endpoint = buildEndpoint(params.path)
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing Bosch API path' }, { status: 400 })
  }

  const userid = process.env.BOSCH_USERID
  const password = process.env.BOSCH_PASSWORD

  if (!userid || !password) {
    return NextResponse.json(
      { error: 'Missing BOSCH_USERID/BOSCH_PASSWORD environment variables' },
      { status: 500 },
    )
  }

  try {
    const rawBody = await req.text()
    const response = await fetch(`${BOSCH_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        userid,
        password,
      },
      body: rawBody?.trim() ? rawBody : '{}',
      cache: 'no-store',
    })

    const text = await response.text()
    const parsed = text ? safeJsonParse(text) : null

    return NextResponse.json(parsed, {
      status: response.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bosch proxy error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return forwardToBosch(req, ctx)
}
