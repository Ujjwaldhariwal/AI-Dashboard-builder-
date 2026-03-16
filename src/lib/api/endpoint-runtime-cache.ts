import { buildEndpointRequestInit } from '@/lib/api/request-utils'
import { fetchWithEndpointCache } from '@/lib/api/endpoint-response-cache'
import { getBuilderDemoAuthSession } from '@/lib/auth/demo-auth-session'

export interface EndpointRuntimeTarget {
  id?: string
  name?: string
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: unknown
  status?: 'active' | 'inactive'
}

export interface EndpointFetchPayload {
  payload: unknown
  statusCode: number
}

export interface EndpointFetchErrorDetails {
  statusCode?: number
  statusText?: string
  payload?: unknown
  fromCache?: boolean
  cacheAgeMs?: number
}

export type EndpointProbeStatus =
  | 'healthy'
  | 'empty'
  | 'unauthorized'
  | 'http-error'
  | 'network-error'

export interface EndpointProbeResult {
  endpointId?: string
  endpointName?: string
  url: string
  status: EndpointProbeStatus
  statusCode?: number
  message: string
  likelyReason: string
  rowCount?: number
  fromCache: boolean
  cacheAgeMs: number
  latencyMs: number
}

const AUTH_STATUS_CODES = new Set([401, 403])
const NETWORK_MESSAGE_PATTERN = /failed to fetch|networkerror|network request failed|cors|timeout|econn|dns|fetch failed/i
const AUTH_MESSAGE_PATTERN = /unauthori[sz]ed|forbidden|access denied|invalid token|token expired|token invalid|auth(?:entication|orization)?(?:\s|-)*(?:failed|required|error)|session(?:\s|-)*(?:expired|invalid|missing)|login required|credential/i
const AUTH_CODE_PATTERN = /unauthorized|forbidden|auth|token/i

export const DEFAULT_ENDPOINT_CACHE_TTL_MS = 30 * 60 * 1000

interface CachedFailureEntry {
  message: string
  details: EndpointFetchErrorDetails
  fetchedAt: number
}

interface ProbeCacheEntry {
  value?: EndpointProbeResult
  fetchedAt?: number
  inflight?: Promise<EndpointProbeResult>
}

const FAILURE_CACHE = new Map<string, CachedFailureEntry>()
const PROBE_CACHE = new Map<string, ProbeCacheEntry>()

class EndpointFetchError extends Error {
  details: EndpointFetchErrorDetails

  constructor(message: string, details: EndpointFetchErrorDetails = {}) {
    super(message)
    this.name = 'EndpointFetchError'
    this.details = details
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function decodeBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4
    const padded = padding ? normalized + '='.repeat(4 - padding) : normalized
    if (typeof atob === 'function') return atob(padded)
    return null
  } catch {
    return null
  }
}

function getJwtExpiryMs(token: string): number | null {
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

export function getEndpointSessionScope(nowMs = Date.now()): string {
  const session = getBuilderDemoAuthSession()
  if (!session || !session.enabled || !session.token) return 'session:none'

  const token = session.token.trim()
  if (!token) return 'session:none'

  const tokenHash = hashString(token)
  const expMs = getJwtExpiryMs(token)
  if (expMs === null) return `session:${tokenHash}`

  if (nowMs >= expMs) return `session:expired:${tokenHash}:${expMs}`
  return `session:active:${tokenHash}:${expMs}`
}

function isLogicalFailure(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const record = payload as Record<string, unknown>
  if (typeof record.status === 'boolean') return record.status === false
  if (typeof record.success === 'boolean') return record.success === false
  return false
}

function parseStatusCodeFromMessage(message: string): number | undefined {
  const match = message.match(/\bHTTP\s+(\d{3})\b/i)
  if (!match) return undefined
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : undefined
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function detectUnauthorizedPayloadReason(payload: unknown): string | null {
  const queue: unknown[] = [payload]
  const visited = new Set<unknown>()
  let inspected = 0

  while (queue.length > 0 && inspected < 30) {
    const node = queue.shift()
    if (!node || typeof node !== 'object') continue
    if (visited.has(node)) continue
    visited.add(node)
    inspected += 1

    if (Array.isArray(node)) {
      node.forEach(item => queue.push(item))
      continue
    }

    const record = asRecord(node)
    if (!record) continue

    const numericStatus = typeof record.statusCode === 'number'
      ? record.statusCode
      : typeof record.code === 'number'
        ? record.code
        : typeof record.status === 'number'
          ? record.status
          : undefined
    if (numericStatus && AUTH_STATUS_CODES.has(numericStatus)) {
      return `HTTP ${numericStatus} reported inside payload`
    }

    const codedValues = [
      record.code,
      record.errorCode,
      record.error,
      record.reason,
    ]
      .map(value => stringifyUnknown(value).trim())
      .filter(Boolean)
      .join(' ')
    if (codedValues && AUTH_CODE_PATTERN.test(codedValues)) {
      return `Auth-specific payload code: ${codedValues}`
    }

    const messageValues = [
      record.message,
      record.error_description,
      record.details,
      record.errorMessage,
      record.detail,
    ]
      .map(value => stringifyUnknown(value).trim())
      .filter(Boolean)
      .join(' ')
    if (messageValues && AUTH_MESSAGE_PATTERN.test(messageValues)) {
      return messageValues
    }

    Object.values(record).forEach(value => {
      if (value && typeof value === 'object') queue.push(value)
    })
  }

  return null
}

function countPayloadRows(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length
  const record = asRecord(payload)
  if (!record) return 0

  const directArray = Object.values(record).find(value => Array.isArray(value))
  if (Array.isArray(directArray)) return directArray.length
  return Object.keys(record).length ? 1 : 0
}

function deriveFailureReason(
  statusCode: number | undefined,
  message: string,
  payloadReason: string | null,
): string {
  if (payloadReason) return payloadReason
  if (statusCode && AUTH_STATUS_CODES.has(statusCode)) {
    return 'Authentication mismatch or expired token/session.'
  }
  if (statusCode === 400 || statusCode === 422) {
    return 'Payload mismatch or missing required body/query fields.'
  }
  if (statusCode && statusCode >= 500) {
    return 'Upstream API environment issue (server unavailable or unstable).'
  }
  if (NETWORK_MESSAGE_PATTERN.test(message)) {
    return 'Network/VPN dependency issue or blocked upstream endpoint.'
  }
  if (AUTH_MESSAGE_PATTERN.test(message)) {
    return 'Authorization/token issue detected in API response.'
  }
  return message || 'Endpoint request failed.'
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function buildProbeErrorResult(
  endpoint: EndpointRuntimeTarget,
  error: unknown,
  latencyMs: number,
): EndpointProbeResult {
  const details = getEndpointFetchErrorDetails(error)
  const message = normalizeErrorMessage(error)
  const statusCode = details?.statusCode ?? parseStatusCodeFromMessage(message)
  const payloadReason = detectUnauthorizedPayloadReason(details?.payload)
  const fromCache = details?.fromCache === true
  const cacheAgeMs = details?.cacheAgeMs ?? 0

  const unauthorized = Boolean(
    payloadReason ||
    (statusCode !== undefined && AUTH_STATUS_CODES.has(statusCode)) ||
    AUTH_MESSAGE_PATTERN.test(message),
  )

  return {
    endpointId: endpoint.id,
    endpointName: endpoint.name,
    url: endpoint.url,
    status: unauthorized
      ? 'unauthorized'
      : statusCode !== undefined
        ? 'http-error'
        : 'network-error',
    statusCode,
    message,
    likelyReason: deriveFailureReason(statusCode, message, payloadReason),
    fromCache,
    cacheAgeMs,
    latencyMs,
  }
}

export function getEndpointFetchErrorDetails(error: unknown): EndpointFetchErrorDetails | null {
  if (!error || typeof error !== 'object') return null
  if (error instanceof EndpointFetchError) return error.details
  const details = (error as { details?: unknown }).details
  if (!details || typeof details !== 'object') return null
  const record = details as Record<string, unknown>
  return {
    statusCode: typeof record.statusCode === 'number' ? record.statusCode : undefined,
    statusText: typeof record.statusText === 'string' ? record.statusText : undefined,
    payload: record.payload,
    fromCache: typeof record.fromCache === 'boolean' ? record.fromCache : undefined,
    cacheAgeMs: typeof record.cacheAgeMs === 'number' ? record.cacheAgeMs : undefined,
  }
}

export function buildEndpointCacheKey(
  endpoint: EndpointRuntimeTarget,
  sessionScope = getEndpointSessionScope(),
): string {
  return [
    endpoint.method,
    endpoint.url.trim(),
    JSON.stringify(endpoint.headers ?? {}),
    JSON.stringify(endpoint.body ?? {}),
    sessionScope,
  ].join('|')
}

export function clearEndpointFailureCache(cacheKey?: string) {
  if (!cacheKey) {
    FAILURE_CACHE.clear()
    return
  }
  FAILURE_CACHE.delete(cacheKey)
}

export function clearEndpointProbeCache(cacheKey?: string) {
  if (!cacheKey) {
    PROBE_CACHE.clear()
    return
  }
  PROBE_CACHE.delete(cacheKey)
}

function normalizeEndpointFetchError(error: unknown): EndpointFetchError {
  if (error instanceof EndpointFetchError) return error
  return new EndpointFetchError(normalizeErrorMessage(error))
}

export async function fetchEndpointPayloadWithCache(
  endpoint: EndpointRuntimeTarget,
  options: {
    ttlMs?: number
    force?: boolean
    sessionScope?: string
  } = {},
) {
  const sessionScope = options.sessionScope ?? getEndpointSessionScope()
  const cacheKey = buildEndpointCacheKey(endpoint, sessionScope)
  const ttlMs = options.ttlMs ?? DEFAULT_ENDPOINT_CACHE_TTL_MS
  const force = options.force ?? false

  if (!force) {
    const cachedFailure = FAILURE_CACHE.get(cacheKey)
    if (cachedFailure) {
      const cacheAgeMs = Math.max(0, Date.now() - cachedFailure.fetchedAt)
      if (cacheAgeMs < ttlMs) {
        throw new EndpointFetchError(cachedFailure.message, {
          ...cachedFailure.details,
          fromCache: true,
          cacheAgeMs,
        })
      }
      FAILURE_CACHE.delete(cacheKey)
    }
  }

  try {
    const result = await fetchWithEndpointCache<EndpointFetchPayload>({
      cacheKey,
      ttlMs,
      force,
      fetcher: async () => {
        const response = await fetch(
          endpoint.url,
          buildEndpointRequestInit({
            method: endpoint.method,
            headers: endpoint.headers,
            body: endpoint.body,
          }),
        )
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new EndpointFetchError(`HTTP ${response.status}: ${response.statusText}`, {
            statusCode: response.status,
            statusText: response.statusText,
            payload,
          })
        }
        if (isLogicalFailure(payload)) {
          const message = (payload as Record<string, unknown>)?.message
          throw new EndpointFetchError(
            typeof message === 'string' ? message : 'API returned status=false',
            {
              statusCode: response.status,
              statusText: response.statusText,
              payload,
            },
          )
        }
        return { payload, statusCode: response.status }
      },
    })
    FAILURE_CACHE.delete(cacheKey)
    return result
  } catch (error) {
    const normalized = normalizeEndpointFetchError(error)
    FAILURE_CACHE.set(cacheKey, {
      message: normalized.message,
      details: normalized.details,
      fetchedAt: Date.now(),
    })
    throw normalized
  }
}

export async function probeEndpointHealthWithCache(
  endpoint: EndpointRuntimeTarget,
  options: {
    ttlMs?: number
    force?: boolean
    sessionScope?: string
  } = {},
): Promise<EndpointProbeResult> {
  const ttlMs = options.ttlMs ?? DEFAULT_ENDPOINT_CACHE_TTL_MS
  const force = options.force ?? false
  const sessionScope = options.sessionScope ?? getEndpointSessionScope()
  const cacheKey = buildEndpointCacheKey(endpoint, sessionScope)
  const existing = PROBE_CACHE.get(cacheKey)
  const now = Date.now()

  if (!force && existing?.value && existing.fetchedAt !== undefined) {
    const cacheAgeMs = Math.max(0, now - existing.fetchedAt)
    if (cacheAgeMs < ttlMs) {
      return {
        ...existing.value,
        fromCache: true,
        cacheAgeMs,
        latencyMs: 0,
      }
    }
  }

  if (!force && existing?.inflight) {
    return existing.inflight
  }

  const inflight = (async () => {
    const startedAt = Date.now()
    try {
      const { value, fromCache, cacheAgeMs } = await fetchEndpointPayloadWithCache(endpoint, {
        ttlMs,
        force,
        sessionScope,
      })
      const unauthorizedReason = detectUnauthorizedPayloadReason(value.payload)
      const rows = countPayloadRows(value.payload)
      const status: EndpointProbeStatus = unauthorizedReason
        ? 'unauthorized'
        : rows === 0
          ? 'empty'
          : 'healthy'

      return {
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        url: endpoint.url,
        status,
        statusCode: value.statusCode,
        message: unauthorizedReason ? 'Payload indicates authorization failure' : 'Endpoint responded successfully',
        likelyReason: unauthorizedReason
          ? unauthorizedReason
          : status === 'empty'
            ? 'Endpoint returned empty payload.'
            : 'Endpoint returned usable data.',
        rowCount: rows,
        fromCache,
        cacheAgeMs,
        latencyMs: Math.max(0, Date.now() - startedAt),
      } as EndpointProbeResult
    } catch (error) {
      return buildProbeErrorResult(
        endpoint,
        error,
        Math.max(0, Date.now() - startedAt),
      )
    }
  })()

  PROBE_CACHE.set(cacheKey, { ...existing, inflight })
  try {
    const value = await inflight
    PROBE_CACHE.set(cacheKey, {
      value,
      fetchedAt: Date.now(),
    })
    return value
  } catch (error) {
    PROBE_CACHE.delete(cacheKey)
    throw error
  }
}

export interface DashboardEndpointProbeSummary {
  requested: number
  scanned: number
  healthy: number
  empty: number
  unauthorized: number
  failed: number
  results: EndpointProbeResult[]
}

export async function probeDashboardEndpoints(
  endpoints: EndpointRuntimeTarget[],
  options: { ttlMs?: number; force?: boolean; sessionScope?: string } = {},
): Promise<DashboardEndpointProbeSummary> {
  const sessionScope = options.sessionScope ?? getEndpointSessionScope()
  const unique = new Map<string, EndpointRuntimeTarget>()

  endpoints.forEach(endpoint => {
    if (endpoint.status === 'inactive') return
    if (!endpoint.url.trim()) return
    const key = buildEndpointCacheKey(endpoint, sessionScope)
    if (!unique.has(key)) {
      unique.set(key, endpoint)
    }
  })
  const uniqueEndpoints = Array.from(unique.values())

  const settled = await Promise.allSettled(
    uniqueEndpoints.map(endpoint => probeEndpointHealthWithCache(endpoint, {
      ttlMs: options.ttlMs,
      force: options.force,
      sessionScope,
    })),
  )

  const results = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value

    const fallbackEndpoint = uniqueEndpoints[index] ?? {
      url: '',
      method: 'GET' as const,
    }
    return buildProbeErrorResult(
      fallbackEndpoint,
      result.reason,
      0,
    )
  })

  const healthy = results.filter(result => result.status === 'healthy').length
  const empty = results.filter(result => result.status === 'empty').length
  const unauthorized = results.filter(result => result.status === 'unauthorized').length
  const failed = results.filter(result =>
    result.status === 'http-error' || result.status === 'network-error',
  ).length

  return {
    requested: endpoints.length,
    scanned: unique.size,
    healthy,
    empty,
    unauthorized,
    failed,
    results,
  }
}

export async function prefetchDashboardEndpoints(
  endpoints: EndpointRuntimeTarget[],
  options: { ttlMs?: number; sessionScope?: string } = {},
) {
  const sessionScope = options.sessionScope ?? getEndpointSessionScope()
  const unique = new Map<string, EndpointRuntimeTarget>()

  endpoints.forEach(endpoint => {
    if (endpoint.status === 'inactive') return
    if (!endpoint.url.trim()) return
    const key = buildEndpointCacheKey(endpoint, sessionScope)
    if (!unique.has(key)) {
      unique.set(key, endpoint)
    }
  })

  const settled = await Promise.allSettled(
    Array.from(unique.values()).map(endpoint =>
      fetchEndpointPayloadWithCache(endpoint, {
        ttlMs: options.ttlMs,
        sessionScope,
      }),
    ),
  )

  const succeeded = settled.filter(result => result.status === 'fulfilled').length
  return {
    requested: endpoints.length,
    prefetched: unique.size,
    succeeded,
    failed: unique.size - succeeded,
  }
}
