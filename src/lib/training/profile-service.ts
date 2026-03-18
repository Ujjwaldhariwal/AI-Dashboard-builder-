import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { getBoschSeedMapping } from '@/lib/training/bosch-seed-mappings'
import { resolveMappingWithFallback, type MappingEngineResult } from '@/lib/training/mapping-engine'
import type {
  MappingCandidate,
  TrainingEndpointResult,
  TrainingProfileSummary,
} from '@/types/training'
import { DEFAULT_PROFILE_DRIFT_FLAGS } from '@/types/training'

export interface TrainingTargetEndpoint {
  id: string
  dashboardId: string
  name: string
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: unknown
  status?: 'active' | 'inactive'
}

export interface PreviousEndpointProfileSnapshot {
  shapeSignature?: string | null
  consecutiveUnauthorizedCount?: number
  consecutiveEmptyCount?: number
}

export interface DemoSessionPayload {
  token: string
  headerName?: string
  prefix?: string
}

export interface EndpointProfileComputation extends TrainingEndpointResult {
  fieldStatsJson: Record<string, unknown>[]
}

interface ProfileEndpointsOptions {
  origin: string
  cookieHeader?: string | null
  demoSession?: DemoSessionPayload
  previousProfiles?: Record<string, PreviousEndpointProfileSnapshot>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeLikelyReason(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('unauthor') || lower.includes('forbidden') || lower.includes('token')) {
    return 'Authentication mismatch or expired token/session.'
  }
  if (lower.includes('timeout') || lower.includes('network') || lower.includes('fetch failed')) {
    return 'Network/VPN dependency issue or blocked upstream endpoint.'
  }
  if (lower.includes('400') || lower.includes('422')) {
    return 'Payload mismatch or missing required body/query fields.'
  }
  return message
}

function isUnauthorizedPayload(payload: unknown): boolean {
  const record = asRecord(payload)
  if (!record) return false

  const values = [
    record.message,
    record.error,
    record.reason,
    record.error_description,
    record.code,
  ]
    .map(value => String(value ?? '').toLowerCase())
    .join(' ')

  if (/unauthor|forbidden|token|auth/.test(values)) return true

  const statusCode = Number(record.statusCode ?? record.code ?? record.status)
  return [401, 403].includes(statusCode)
}

function buildRequestInit(endpoint: TrainingTargetEndpoint, demoSession?: DemoSessionPayload): RequestInit {
  const headerName = demoSession?.headerName?.trim() || 'Authorization'
  const prefix = demoSession?.prefix?.trim() || 'Bearer'
  const token = demoSession?.token?.trim()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(endpoint.headers ?? {}),
  }

  if (token) {
    headers['x-builder-demo-token'] = token
    headers[headerName] = prefix ? `${prefix} ${token}` : token
  }

  const init: RequestInit = {
    method: endpoint.method,
    headers,
    cache: 'no-store',
  }

  if (endpoint.method === 'POST') {
    if (endpoint.body === undefined || endpoint.body === null) {
      init.body = '{}'
    } else {
      init.body = typeof endpoint.body === 'string' ? endpoint.body : JSON.stringify(endpoint.body)
    }
  }

  return init
}

async function callAISuggestForEndpoint(input: {
  origin: string
  cookieHeader?: string | null
  endpointName: string
  fields: Array<{ name: string; type: string }>
  sampleRows: Record<string, unknown>[]
}): Promise<MappingCandidate | null> {
  try {
    const response = await fetch(new URL('/api/ai/suggest', input.origin), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(input.cookieHeader ? { Cookie: input.cookieHeader } : {}),
      },
      body: JSON.stringify({
        endpointName: input.endpointName,
        fields: input.fields,
        sampleData: input.sampleRows,
      }),
      cache: 'no-store',
    })

    if (!response.ok) return null

    const payload = await response.json() as {
      suggestions?: Array<{
        type: string
        xAxis?: string
        yAxis?: string
        reason?: string
      }>
    }

    const top = payload.suggestions?.[0]
    if (!top) return null

    return {
      type: top.type as MappingCandidate['type'],
      xAxis: top.xAxis ?? '',
      yAxis: top.yAxis,
      reason: top.reason ?? 'AI fallback mapping suggestion',
      confidence: 70,
      source: 'ai',
    }
  } catch {
    return null
  }
}

function mapEngineToResult(input: {
  endpoint: TrainingTargetEndpoint
  mapping: MappingEngineResult
  rowCount: number
  statusCode: number
  latencyMs: number
}): EndpointProfileComputation {
  return {
    endpointId: input.endpoint.id,
    endpointName: input.endpoint.name,
    endpointUrl: input.endpoint.url,
    status: input.rowCount === 0 ? 'empty' : 'healthy',
    statusCode: input.statusCode,
    latencyMs: input.latencyMs,
    likelyReason: input.rowCount === 0 ? 'Endpoint returned empty payload.' : 'Endpoint returned usable data.',
    shapeSignature: input.mapping.shapeSignature,
    rowCount: input.rowCount,
    patternClass: input.mapping.patternClass,
    confidence: input.mapping.confidence,
    confidenceBand: input.mapping.confidenceBand,
    driftFlags: input.mapping.driftFlags,
    candidateMapping: input.mapping.candidate ?? undefined,
    fieldStats: input.mapping.fieldStats,
    fieldStatsJson: input.mapping.fieldStats as unknown as Record<string, unknown>[],
  }
}

async function profileSingleEndpoint(input: {
  endpoint: TrainingTargetEndpoint
  options: ProfileEndpointsOptions
}): Promise<EndpointProfileComputation> {
  const { endpoint, options } = input

  const previous = options.previousProfiles?.[endpoint.id]
  const endpointUrl = new URL(endpoint.url, options.origin).toString()

  const startedAt = Date.now()
  try {
    const response = await fetch(
      endpointUrl,
      buildRequestInit(endpoint, options.demoSession),
    )

    const latencyMs = Math.max(0, Date.now() - startedAt)
    const payload = await response.json().catch(async () => {
      const text = await response.text().catch(() => '')
      return { raw: text }
    })

    const logicalFailure = asRecord(payload)
    if (!response.ok || logicalFailure?.status === false || logicalFailure?.success === false) {
      const payloadMessage = String(logicalFailure?.message ?? logicalFailure?.error ?? '')
      const message = payloadMessage || `HTTP ${response.status}`
      const unauthorized = response.status === 401
        || response.status === 403
        || isUnauthorizedPayload(payload)

      return {
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        endpointUrl: endpoint.url,
        status: unauthorized ? 'unauthorized' : 'http-error',
        statusCode: response.status,
        latencyMs,
        likelyReason: normalizeLikelyReason(message),
        shapeSignature: undefined,
        rowCount: 0,
        patternClass: 'table-fallback',
        confidence: 0,
        confidenceBand: 'low',
        driftFlags: {
          ...DEFAULT_PROFILE_DRIFT_FLAGS,
          repeatedUnauthorized: unauthorized && (previous?.consecutiveUnauthorizedCount ?? 0) >= 1,
          repeatedEmpty: false,
          shapeChanged: false,
          seedMismatch: false,
        },
        candidateMapping: undefined,
        fieldStats: [],
        fieldStatsJson: [],
      }
    }

    const rows = (
      DataAnalyzer.extractDataArray(payload) ??
      (Array.isArray(payload) ? payload : [payload])
    )
      .filter(row => row && typeof row === 'object' && !Array.isArray(row)) as Record<string, unknown>[]

    const mapping = await resolveMappingWithFallback(
      {
        rows,
        endpointName: endpoint.name,
        endpointUrl: endpoint.url,
        endpointPath: endpoint.url,
        seedMapping: getBoschSeedMapping({ endpointUrl: endpoint.url, endpointName: endpoint.name }),
        previousShapeSignature: previous?.shapeSignature ?? undefined,
        previousUnauthorizedCount: previous?.consecutiveUnauthorizedCount ?? 0,
        previousEmptyCount: previous?.consecutiveEmptyCount ?? 0,
      },
      {
        aiFallback: async ({ fields, sampleRows }) => callAISuggestForEndpoint({
          origin: options.origin,
          cookieHeader: options.cookieHeader,
          endpointName: endpoint.name,
          fields: fields.map(field => ({ name: field.name, type: field.type })),
          sampleRows,
        }),
      },
    )

    const result = mapEngineToResult({
      endpoint,
      mapping,
      rowCount: rows.length,
      statusCode: response.status,
      latencyMs,
    })

    result.driftFlags = {
      ...result.driftFlags,
      repeatedEmpty: rows.length === 0 && (previous?.consecutiveEmptyCount ?? 0) >= 1,
    }

    return {
      ...result,
      status: rows.length ? 'healthy' : 'empty',
      likelyReason: rows.length ? 'Endpoint returned usable data.' : 'Endpoint returned empty payload.',
      confidence: rows.length ? result.confidence : Math.max(50, result.confidence - 20),
      confidenceBand: rows.length ? result.confidenceBand : 'review',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      endpointUrl: endpoint.url,
      status: 'network-error',
      latencyMs: Math.max(0, Date.now() - startedAt),
      likelyReason: normalizeLikelyReason(message),
      shapeSignature: undefined,
      rowCount: 0,
      patternClass: 'table-fallback',
      confidence: 0,
      confidenceBand: 'low',
      driftFlags: { ...DEFAULT_PROFILE_DRIFT_FLAGS },
      candidateMapping: undefined,
      fieldStats: [],
      fieldStatsJson: [],
    }
  }
}

export async function profileEndpointBatch(input: {
  endpoints: TrainingTargetEndpoint[]
  options: ProfileEndpointsOptions
}): Promise<TrainingProfileSummary & { detailedResults: EndpointProfileComputation[] }> {
  const detailedResults = await Promise.all(
    input.endpoints.map(endpoint => profileSingleEndpoint({ endpoint, options: input.options })),
  )

  const mappedHighConfidence = detailedResults.filter(result =>
    result.status === 'healthy' && result.confidenceBand === 'high',
  ).length

  const reviewRequired = detailedResults.filter(result =>
    result.status === 'healthy' && result.confidenceBand !== 'high',
  ).length

  const unauthorized = detailedResults.filter(result => result.status === 'unauthorized').length
  const empty = detailedResults.filter(result => result.status === 'empty').length
  const failed = detailedResults.filter(result =>
    result.status === 'http-error' || result.status === 'network-error',
  ).length

  return {
    scanned: input.endpoints.length,
    mappedHighConfidence,
    reviewRequired,
    unauthorized,
    empty,
    failed,
    results: detailedResults,
    detailedResults,
  }
}
