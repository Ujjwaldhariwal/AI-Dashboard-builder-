import { hasRedisRuntime, redisPipeline } from '@/lib/security/redis-runtime'

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

function checkInMemoryRuntimeRateLimit({
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

export async function checkRuntimeRateLimit(options: RuntimeRateLimitOptions): Promise<RuntimeRateLimitDecision> {
  if (!hasRedisRuntime()) return checkInMemoryRuntimeRateLimit(options)

  const redisKey = `dashboardos:rate:${options.key}`
  const results = await redisPipeline<number>([
    ['INCR', redisKey],
    ['PEXPIRE', redisKey, String(options.windowMs), 'NX'],
    ['PTTL', redisKey],
  ])

  const count = Number(results?.[0]?.result ?? 0)
  const ttlMs = Number(results?.[2]?.result ?? options.windowMs)
  if (!results || results.some(result => result.error) || count <= 0 || ttlMs < 0) {
    return checkInMemoryRuntimeRateLimit(options)
  }

  const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000))
  return {
    ok: count <= options.maxRequests,
    remaining: Math.max(0, options.maxRequests - count),
    retryAfterSeconds,
    resetAt: Date.now() + ttlMs,
  }
}
