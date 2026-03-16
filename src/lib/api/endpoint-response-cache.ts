interface EndpointCacheEntry<T> {
  value?: T
  fetchedAt?: number
  inflight?: Promise<T>
}

const CACHE = new Map<string, EndpointCacheEntry<unknown>>()

export interface CachedResponse<T> {
  value: T
  fromCache: boolean
  cacheAgeMs: number
}

export async function fetchWithEndpointCache<T>({
  cacheKey,
  fetcher,
  ttlMs,
  force = false,
}: {
  cacheKey: string
  fetcher: () => Promise<T>
  ttlMs: number
  force?: boolean
}): Promise<CachedResponse<T>> {
  const now = Date.now()
  const existing = CACHE.get(cacheKey) as EndpointCacheEntry<T> | undefined

  if (!force && existing?.value !== undefined && existing.fetchedAt !== undefined) {
    const ageMs = now - existing.fetchedAt
    if (ageMs < ttlMs) {
      return {
        value: existing.value,
        fromCache: true,
        cacheAgeMs: ageMs,
      }
    }
  }

  if (!force && existing?.inflight) {
    const value = await existing.inflight
    const latest = CACHE.get(cacheKey) as EndpointCacheEntry<T> | undefined
    const fetchedAt = latest?.fetchedAt ?? now
    return {
      value,
      fromCache: true,
      cacheAgeMs: Math.max(0, Date.now() - fetchedAt),
    }
  }

  const inflight = fetcher()
  CACHE.set(cacheKey, { ...existing, inflight })

  try {
    const value = await inflight
    CACHE.set(cacheKey, {
      value,
      fetchedAt: Date.now(),
    })
    return {
      value,
      fromCache: false,
      cacheAgeMs: 0,
    }
  } catch (error) {
    if (existing?.value !== undefined && existing.fetchedAt !== undefined) {
      CACHE.set(cacheKey, {
        value: existing.value,
        fetchedAt: existing.fetchedAt,
      })
    } else {
      CACHE.delete(cacheKey)
    }
    throw error
  }
}

export function clearEndpointResponseCache(cacheKey?: string) {
  if (!cacheKey) {
    CACHE.clear()
    return
  }
  CACHE.delete(cacheKey)
}
