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

type JsonRecord = Record<string, unknown>

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

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonRecord
}

function isLoginEndpoint(endpoint: string) {
  return endpoint.toLowerCase().endsWith('/userlogin')
}

function getBasicAuthorization(credentials: BoschCredentials) {
  const basicAuthToken = Buffer
    .from(`${credentials.userid}:${credentials.password}`, 'utf8')
    .toString('base64')
  return `Basic ${basicAuthToken}`
}

function extractTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  const tokenPair = cookieHeader
    .split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.toLowerCase().startsWith('token='))

  if (!tokenPair) return null
  const rawValue = tokenPair.slice('token='.length)
  if (!rawValue) return null

  try {
    return decodeURIComponent(rawValue)
  } catch {
    return rawValue
  }
}

function resolveUpstreamAuthorization(
  req: NextRequest,
  endpoint: string,
  credentials: BoschCredentials,
): string {
  const basicAuthorization = getBasicAuthorization(credentials)
  if (isLoginEndpoint(endpoint)) return basicAuthorization

  const forwardedAuthorization = req.headers.get('authorization')?.trim()
  if (!forwardedAuthorization) return basicAuthorization

  const demoTokenHeader = req.headers.get('x-builder-demo-token')?.trim()
  if (!demoTokenHeader) return forwardedAuthorization

  const normalizedDemoBearer = `Bearer ${demoTokenHeader}`
  if (forwardedAuthorization === normalizedDemoBearer) {
    // For Bosch upstream, session cookie token is the primary auth channel.
    return basicAuthorization
  }

  return forwardedAuthorization
}

function buildForwardedCookie(req: NextRequest): string | null {
  const incomingCookie = req.headers.get('cookie')?.trim() ?? ''
  const tokenInCookie = extractTokenFromCookieHeader(incomingCookie || null)
  if (tokenInCookie) return incomingCookie || null

  const demoTokenHeader = req.headers.get('x-builder-demo-token')?.trim()
  if (!demoTokenHeader) return incomingCookie || null

  const tokenCookie = `token=${encodeURIComponent(demoTokenHeader)}`
  if (!incomingCookie) return tokenCookie
  return `${incomingCookie}; ${tokenCookie}`
}

function buildUpstreamHeaders(
  req: NextRequest,
  endpoint: string,
  credentials: BoschCredentials,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: resolveUpstreamAuthorization(req, endpoint, credentials),
    // Backward compatibility for older Bosch gateways still reading legacy headers.
    userid: credentials.userid,
    password: credentials.password,
  }

  const cookieHeader = buildForwardedCookie(req)
  if (cookieHeader) {
    headers.Cookie = cookieHeader
  }

  return headers
}

function getSetCookieHeaders(headers: Headers): string[] {
  const maybeHeaders = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof maybeHeaders.getSetCookie === 'function') {
    return maybeHeaders.getSetCookie().filter(Boolean)
  }

  const fallback = headers.get('set-cookie')
  return fallback ? [fallback] : []
}

function extractTokenFromSetCookie(setCookies: string[]): string | null {
  for (const setCookie of setCookies) {
    const pair = setCookie.split(';')[0]?.trim() ?? ''
    if (!pair.toLowerCase().startsWith('token=')) continue

    const rawToken = pair.slice('token='.length)
    if (!rawToken) continue
    try {
      return decodeURIComponent(rawToken)
    } catch {
      return rawToken
    }
  }
  return null
}

function mergeTokenIntoPayload(payload: unknown, token: string | null): unknown {
  if (!token) return payload
  const record = asRecord(payload)
  if (!record) return payload

  const existingToken = typeof record.token === 'string' && record.token.trim()
    ? record.token.trim()
    : null
  const resolvedToken = existingToken ?? token

  const enriched: JsonRecord = {
    ...record,
    token: resolvedToken,
  }

  const dataRecord = asRecord(record.data)
  if (dataRecord) {
    const dataToken = typeof dataRecord.token === 'string' && dataRecord.token.trim()
      ? dataRecord.token.trim()
      : null
    enriched.data = {
      ...dataRecord,
      token: dataToken ?? resolvedToken,
    }
  }

  return enriched
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
    const upstreamUrl = new URL(`${baseUrl}${endpoint}`)
    req.nextUrl.searchParams.forEach((value, key) => {
      if (key.toLowerCase() === 'env') return
      upstreamUrl.searchParams.append(key, value)
    })

    const method = req.method.toUpperCase()
    const rawBody = method === 'POST' ? await req.text() : ''

    const response = await fetch(upstreamUrl.toString(), {
      method,
      headers: buildUpstreamHeaders(req, endpoint, credentials),
      body: method === 'POST' ? (rawBody?.trim() ? rawBody : '{}') : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const text = await response.text()
    const parsed = text ? safeJsonParse(text) : null
    const setCookies = getSetCookieHeaders(response.headers)
    const tokenFromCookie = extractTokenFromSetCookie(setCookies)
    const payload = mergeTokenIntoPayload(parsed, tokenFromCookie)

    const proxiedResponse = NextResponse.json(payload, {
      status: response.status,
    })
    setCookies.forEach((cookie) => {
      proxiedResponse.headers.append('set-cookie', cookie)
    })

    return proxiedResponse
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
