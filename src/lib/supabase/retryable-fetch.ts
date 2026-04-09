import {
  dispatchSupabaseAuthExpired,
  dispatchSupabaseAuthNetworkError,
} from '@/lib/supabase/auth-events'

const REQUEST_TIMEOUT_MS = 8000
const MAX_RETRIES = 2
const BACKOFF_BASE_MS = 2000
const BACKOFF_JITTER_MS = 250
const WARNING_DEDUPE_WINDOW_MS = 60_000

const lastWarningAt = new Map<string, number>()

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|aborted/i.test(message)
}

function sleep(ms: number) {
  return new Promise<void>(resolve => {
    globalThis.setTimeout(resolve, ms)
  })
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function warnOnce(key: string, message: string) {
  const now = Date.now()
  const previous = lastWarningAt.get(key) ?? 0
  if (now - previous < WARNING_DEDUPE_WINDOW_MS) return
  lastWarningAt.set(key, now)
  console.warn(message)
}

function combineAbortSignals(
  externalSignal: AbortSignal | null | undefined,
  controller: AbortController,
) {
  if (!externalSignal) {
    return () => undefined
  }

  if (externalSignal.aborted) {
    controller.abort()
    return () => undefined
  }

  const onAbort = () => controller.abort()
  externalSignal.addEventListener('abort', onAbort, { once: true })
  return () => externalSignal.removeEventListener('abort', onAbort)
}

function isAuthTokenEndpoint(url: string): boolean {
  return /\/auth\/v1\/token/i.test(url)
}

export function createSupabaseRetryableFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getRequestUrl(input)

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const timeoutController = new AbortController()
      const cleanupExternalSignal = combineAbortSignals(init?.signal, timeoutController)
      const timeoutHandle = globalThis.setTimeout(() => {
        timeoutController.abort()
      }, REQUEST_TIMEOUT_MS)

      try {
        const response = await fetch(input, {
          ...init,
          signal: timeoutController.signal,
        })

        if (isAuthTokenEndpoint(url) && [400, 401, 403].includes(response.status)) {
          dispatchSupabaseAuthExpired()
        }

        return response
      } catch (error) {
        const retryable = isRetryableNetworkError(error)
        const canRetry = retryable && attempt < MAX_RETRIES

        if (!canRetry) {
          if (retryable) {
            warnOnce(
              'supabase-auth-network',
              '[Supabase Auth] Network issue detected while refreshing session. We will recover automatically when connectivity returns.',
            )
            dispatchSupabaseAuthNetworkError()
          }
          throw error
        }

        const backoffMs = BACKOFF_BASE_MS * (2 ** attempt) + Math.floor(Math.random() * BACKOFF_JITTER_MS)
        await sleep(backoffMs)
      } finally {
        globalThis.clearTimeout(timeoutHandle)
        cleanupExternalSignal()
      }
    }

    throw new Error(`Supabase request failed after retries: ${url}`)
  }
}
