import { NextRequest, NextResponse } from 'next/server'

const BOSCH_BASE_FALLBACK = 'https://kadashboard.kaamismartmeters.com/BOSCH/API'
const REQUEST_TIMEOUT_MS = 20000

interface BoschCredentials {
  userid: string
  password: string
}

interface CredentialResolution {
  credentials: BoschCredentials | null
  checkedEnvVars: string[]
}

type RouteContext = {
  params: Promise<{
    path: string[]
  }>
}

function buildEndpoint(path: string[] | undefined): string | null {
  if (!path || path.length === 0) return null
  return `/${path.join('/')}`
}

function normalizeEnvTarget(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return normalized || null
}

function pickFirstDefined(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.trim()) return value.trim()
  }
  return null
}

function resolveBaseUrl(target: string | null) {
  const targetSpecific = target
    ? pickFirstDefined(`BOSCH_BASE_URL_${target}`, `BOSCH_${target}_BASE_URL`)
    : null

  return (
    targetSpecific
    ?? pickFirstDefined('BOSCH_BASE_URL')
    ?? BOSCH_BASE_FALLBACK
  )
}

function resolveCredentials(target: string | null): CredentialResolution {
  const checkedEnvVars = new Set<string>()

  if (target) {
    const targetUserVars = [`BOSCH_USERID_${target}`, `BOSCH_${target}_USERID`]
    const targetPassVars = [`BOSCH_PASSWORD_${target}`, `BOSCH_${target}_PASSWORD`]
    targetUserVars.forEach((key) => checkedEnvVars.add(key))
    targetPassVars.forEach((key) => checkedEnvVars.add(key))

    const targetUserid = pickFirstDefined(...targetUserVars)
    const targetPassword = pickFirstDefined(...targetPassVars)
    if (targetUserid && targetPassword) {
      return {
        credentials: {
          userid: targetUserid,
          password: targetPassword,
        },
        checkedEnvVars: Array.from(checkedEnvVars),
      }
    }
  }

  checkedEnvVars.add('BOSCH_USERID')
  checkedEnvVars.add('BOSCH_PASSWORD')
  const fallbackUserid = pickFirstDefined('BOSCH_USERID')
  const fallbackPassword = pickFirstDefined('BOSCH_PASSWORD')
  if (fallbackUserid && fallbackPassword) {
    return {
      credentials: {
        userid: fallbackUserid,
        password: fallbackPassword,
      },
      checkedEnvVars: Array.from(checkedEnvVars),
    }
  }

  return {
    credentials: null,
    checkedEnvVars: Array.from(checkedEnvVars),
  }
}

function resolveTargetFromRequest(req: NextRequest): string | null {
  const headerTarget = req.headers.get('x-bosch-env')
  const queryTarget = req.nextUrl.searchParams.get('env')
  const defaultTarget = process.env.BOSCH_DEFAULT_ENV ?? null
  return normalizeEnvTarget(headerTarget ?? queryTarget ?? defaultTarget)
}

function buildUpstreamHeaders(credentials: BoschCredentials) {
  const basicAuthToken = Buffer
    .from(`${credentials.userid}:${credentials.password}`, 'utf8')
    .toString('base64')

  return {
    'Content-Type': 'application/json',
    Authorization: `Basic ${basicAuthToken}`,
    // Backward compatibility for older Bosch gateways still reading legacy headers.
    userid: credentials.userid,
    password: credentials.password,
  }
}

async function forwardToBosch(req: NextRequest, ctx: RouteContext) {
  const params = await ctx.params
  const endpoint = buildEndpoint(params.path)
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing Bosch API path' }, { status: 400 })
  }

  const target = resolveTargetFromRequest(req)
  const baseUrl = resolveBaseUrl(target)
  const { credentials, checkedEnvVars } = resolveCredentials(target)
  if (!credentials) {
    return NextResponse.json(
      {
        error: 'Missing Bosch proxy credentials.',
        targetEnv: target ?? 'DEFAULT',
        checkedEnvVars,
        hint: 'Set BOSCH_USERID/BOSCH_PASSWORD or target-specific credentials and restart dev server.',
      },
      { status: 500 },
    )
  }

  try {
    const rawBody = await req.text()
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: buildUpstreamHeaders(credentials),
      body: rawBody?.trim() ? rawBody : '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const text = await response.text()
    const parsed = text ? safeJsonParse(text) : null

    return NextResponse.json(parsed, {
      status: response.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bosch proxy error'
    return NextResponse.json(
      {
        error: 'Bosch API proxy request failed.',
        details: message,
        endpoint,
        targetEnv: target ?? 'DEFAULT',
        baseUrl,
        hint: 'Verify VPN connectivity for the selected environment and confirm endpoint access.',
      },
      { status: 502 },
    )
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

export async function GET(req: NextRequest, ctx: RouteContext) {
  return forwardToBosch(req, ctx)
}
