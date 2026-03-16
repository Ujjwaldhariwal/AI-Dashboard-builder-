'use client'

export interface BuilderDemoAuthSession {
  dashboardId?: string
  token: string
  headerName: string
  prefix: string
  enabled: boolean
  createdAt: string
}

const STORAGE_KEY = 'builder_demo_auth_session_v1'

function isBrowser() {
  return typeof window !== 'undefined'
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

  const headerName = session.headerName || 'Authorization'
  const prefix = session.prefix?.trim() ?? ''
  const headerValue = prefix ? `${prefix} ${session.token}` : session.token

  return {
    [headerName]: headerValue,
    'x-builder-demo-token': session.token,
  }
}
