export const SESSION_EXPIRED_COOKIE_NAME = 'session_expired'
const SESSION_EXPIRED_COOKIE_VALUE = '1'

function parseCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const encoded = `${name}=`
  const chunks = document.cookie.split(';')
  for (const chunk of chunks) {
    const trimmed = chunk.trim()
    if (trimmed.startsWith(encoded)) {
      return decodeURIComponent(trimmed.slice(encoded.length))
    }
  }
  return null
}

export function hasSessionExpiredSignalCookie(): boolean {
  return parseCookie(SESSION_EXPIRED_COOKIE_NAME) === SESSION_EXPIRED_COOKIE_VALUE
}

export function consumeSessionExpiredSignalCookie(): boolean {
  const hasSignal = hasSessionExpiredSignalCookie()
  if (!hasSignal || typeof document === 'undefined') return false

  document.cookie = `${SESSION_EXPIRED_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`
  return true
}

export function hasSupabaseAuthCookieFootprint(cookieNames: string[]): boolean {
  return cookieNames.some(name => /^sb-.*-auth-token/i.test(name))
}
