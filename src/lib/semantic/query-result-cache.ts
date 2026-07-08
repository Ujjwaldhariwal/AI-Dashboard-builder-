import crypto from 'node:crypto'

import { hasRedisRuntime, redisCommand } from '@/lib/security/redis-runtime'

const DEFAULT_MAX_MEMORY_CACHE_ITEMS = 500
const DEFAULT_TTL_SECONDS = 300

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export interface QueryResultCacheKeyInput {
  tenantId: string
  projectId: string
  datasetId: string
  chartId?: string | null
  dataSourceId: string
  sql: string
  parameters?: unknown[]
  datasetUpdatedAt?: string | null
  chartUpdatedAt?: string | null
  schemaHash?: string | null
}

export interface QueryResultCacheHit<T> {
  hit: boolean
  value: T | null
  cacheKey: string
  backend: 'redis' | 'memory' | 'none'
}

const globalForQueryCache = globalThis as typeof globalThis & {
  __dashboardQueryResultCache?: Map<string, CacheEntry<unknown>>
}

const memoryCache = globalForQueryCache.__dashboardQueryResultCache ?? new Map<string, CacheEntry<unknown>>()
globalForQueryCache.__dashboardQueryResultCache = memoryCache

function normalizeTtlSeconds(ttlSeconds: unknown) {
  if (typeof ttlSeconds !== 'number' || !Number.isFinite(ttlSeconds)) return DEFAULT_TTL_SECONDS
  return Math.min(3_600, Math.max(5, Math.floor(ttlSeconds)))
}

function cleanupMemoryCache(now: number) {
  if (memoryCache.size < DEFAULT_MAX_MEMORY_CACHE_ITEMS) return
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) memoryCache.delete(key)
  }
  if (memoryCache.size < DEFAULT_MAX_MEMORY_CACHE_ITEMS) return
  const oldestKey = memoryCache.keys().next().value as string | undefined
  if (oldestKey) memoryCache.delete(oldestKey)
}

export function queryResultCacheKey(input: QueryResultCacheKeyInput) {
  const hash = crypto.createHash('sha256')
  hash.update(JSON.stringify({
    tenantId: input.tenantId,
    projectId: input.projectId,
    datasetId: input.datasetId,
    chartId: input.chartId ?? null,
    dataSourceId: input.dataSourceId,
    sql: input.sql,
    parameters: input.parameters ?? [],
    datasetUpdatedAt: input.datasetUpdatedAt ?? null,
    chartUpdatedAt: input.chartUpdatedAt ?? null,
    schemaHash: input.schemaHash ?? null,
  }))
  return `dashboardos:query:${hash.digest('hex')}`
}

export async function getQueryResultCache<T>(cacheKey: string): Promise<QueryResultCacheHit<T>> {
  if (hasRedisRuntime()) {
    const result = await redisCommand<string>(['GET', cacheKey])
    if (result && !result.error && typeof result.result === 'string') {
      try {
        return {
          hit: true,
          value: JSON.parse(result.result) as T,
          cacheKey,
          backend: 'redis',
        }
      } catch {
        return { hit: false, value: null, cacheKey, backend: 'redis' }
      }
    }
  }

  const now = Date.now()
  const entry = memoryCache.get(cacheKey)
  if (entry && entry.expiresAt > now) {
    return { hit: true, value: entry.value as T, cacheKey, backend: hasRedisRuntime() ? 'redis' : 'memory' }
  }
  if (entry) memoryCache.delete(cacheKey)
  return { hit: false, value: null, cacheKey, backend: hasRedisRuntime() ? 'redis' : 'memory' }
}

export async function setQueryResultCache<T>(cacheKey: string, value: T, ttlSeconds: unknown) {
  const ttl = normalizeTtlSeconds(ttlSeconds)
  const serialized = JSON.stringify(value)

  if (hasRedisRuntime()) {
    const result = await redisCommand(['SET', cacheKey, serialized, 'EX', String(ttl)])
    if (result && !result.error) return { backend: 'redis' as const, ttlSeconds: ttl }
  }

  const now = Date.now()
  cleanupMemoryCache(now)
  memoryCache.set(cacheKey, {
    value,
    expiresAt: now + ttl * 1000,
  })
  return { backend: 'memory' as const, ttlSeconds: ttl }
}
