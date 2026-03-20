'use client'

export interface BuilderDemoAuthSession {
  dashboardId?: string
  token: string
  headerName: string
  prefix: string
  targetEnv?: string
  enabled: boolean
  createdAt: string
}

const STORAGE_KEY = 'builder_demo_auth_session_v1'

function isBrowser() {
  return typeof window !== 'undefined'
}

function normalizeEnvTarget(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return normalized || undefined
}

function decodeBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4
    const padded = padding ? normalized + '='.repeat(4 - padding) : normalized
    return atob(padded)
  } catch {
    return null
  }
}

export function getBuilderDemoAuthTokenExpiryMs(token: string): number | null {
  const parts = token.split('.')
  if (parts.length < 2) return null

  const payloadJson = decodeBase64Url(parts[1])
  if (!payloadJson) return null

  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>
    const exp = payload.exp
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
    return Math.round(exp * 1000)
  } catch {
    return null
  }
}

export interface BuilderDemoAuthTokenMeta {
  expiresAtMs: number | null
  remainingMs: number | null
  isExpired: boolean
}

export function getBuilderDemoAuthTokenMeta(
  token: string,
  nowMs = Date.now(),
): BuilderDemoAuthTokenMeta {
  const expiresAtMs = getBuilderDemoAuthTokenExpiryMs(token)
  if (!expiresAtMs) {
    return {
      expiresAtMs: null,
      remainingMs: null,
      isExpired: false,
    }
  }

  const remainingMs = expiresAtMs - nowMs
  return {
    expiresAtMs,
    remainingMs,
    isExpired: remainingMs <= 0,
  }
}

export function getBuilderDemoAuthSession(): BuilderDemoAuthSession | null {
  if (!isBrowser()) return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<BuilderDemoAuthSession>
    if (!parsed || typeof parsed !== 'object') return null
    const token = typeof parsed.token === 'string' ? parsed.token : ''
    if (!token) return null

    return {
      dashboardId: typeof parsed.dashboardId === 'string' ? parsed.dashboardId : undefined,
      token,
      headerName: typeof parsed.headerName === 'string' && parsed.headerName.trim()
        ? parsed.headerName.trim()
        : 'Authorization',
      prefix: typeof parsed.prefix === 'string' ? parsed.prefix : 'Bearer',
      targetEnv: normalizeEnvTarget(
        typeof parsed.targetEnv === 'string' ? parsed.targetEnv : undefined,
      ),
      enabled: parsed.enabled !== false,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function setBuilderDemoAuthSession(session: BuilderDemoAuthSession) {
  if (!isBrowser()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  window.dispatchEvent(new Event('builderDemoAuthSessionChanged'))
}

export function clearBuilderDemoAuthSession() {
  if (!isBrowser()) return
  window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event('builderDemoAuthSessionChanged'))
}

export function getBuilderDemoAuthHeaders(): Record<string, string> {
  const session = getBuilderDemoAuthSession()
  if (!session || !session.enabled || !session.token) return {}
  const tokenMeta = getBuilderDemoAuthTokenMeta(session.token)
  if (tokenMeta.isExpired) return {}

  const headerName = session.headerName || 'Authorization'
  const prefix = session.prefix?.trim() ?? ''
  const headerValue = prefix ? `${prefix} ${session.token}` : session.token

  const headers: Record<string, string> = {
    [headerName]: headerValue,
    'x-builder-demo-token': session.token,
  }
  if (session.targetEnv) {
    headers['x-bosch-env'] = session.targetEnv
  }
  return headers
}
