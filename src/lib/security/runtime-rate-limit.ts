export interface RuntimeRateLimitOptions {
  key: string
  maxRequests: number
  windowMs: number
}

export interface RuntimeRateLimitDecision {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
  resetAt: number
}

interface RuntimeRateLimitBucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, RuntimeRateLimitBucket>()

function cleanup(now: number) {
  if (buckets.size < 1_000) return
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function checkRuntimeRateLimit({
  key,
  maxRequests,
  windowMs,
}: RuntimeRateLimitOptions): RuntimeRateLimitDecision {
  const now = Date.now()
  cleanup(now)

  const existing = buckets.get(key)
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + windowMs }

  bucket.count += 1
  buckets.set(key, bucket)

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  return {
    ok: bucket.count <= maxRequests,
    remaining: Math.max(0, maxRequests - bucket.count),
    retryAfterSeconds,
    resetAt: bucket.resetAt,
  }
}
