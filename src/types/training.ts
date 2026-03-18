import type { ChartType, YAxisConfig } from '@/types/widget'

export type MappingConfidenceBand = 'high' | 'review' | 'low'

export type EndpointRunStatus =
  | 'healthy'
  | 'empty'
  | 'unauthorized'
  | 'http-error'
  | 'network-error'

export type ProfilePatternClass =
  | 'kpi-single-value'
  | 'time-series'
  | 'categorical-distribution'
  | 'multi-metric-category'
  | 'drilldown-hierarchical'
  | 'table-fallback'

export interface ProfileDriftFlags {
  shapeChanged: boolean
  repeatedUnauthorized: boolean
  repeatedEmpty: boolean
  seedMismatch: boolean
}

export interface EndpointFieldStat {
  name: string
  type: 'number' | 'string' | 'date' | 'boolean' | 'unknown'
  distinctCount: number
  nullRatio: number
  sampleValues: string[]
}

export interface MappingCandidate {
  type: ChartType
  xAxis: string
  yAxis?: string
  yAxes?: YAxisConfig[]
  reason: string
  confidence: number
  source: 'deterministic' | 'ai' | 'seed' | 'manual'
}

export interface EndpointProfileRun {
  id: string
  userId: string
  dashboardId: string
  endpointId: string
  endpointName: string
  endpointUrl: string
  runStatus: EndpointRunStatus
  statusCode?: number
  latencyMs?: number
  rowCount?: number
  errorClass?: string
  likelyReason?: string
  shapeSignature?: string
  fieldStats: EndpointFieldStat[]
  candidateMapping?: MappingCandidate
  confidence: number
  confidenceBand: MappingConfidenceBand
  patternClass: ProfilePatternClass
  driftFlags: ProfileDriftFlags
  createdAt: string
}

export interface EndpointProfile {
  endpointId: string
  userId: string
  dashboardId: string
  endpointName: string
  endpointUrl: string
  lastRunStatus: EndpointRunStatus
  lastStatusCode?: number
  lastLatencyMs?: number
  lastRowCount?: number
  lastErrorClass?: string
  lastLikelyReason?: string
  shapeSignature?: string
  fieldStats: EndpointFieldStat[]
  bestMapping?: MappingCandidate
  confidence: number
  confidenceBand: MappingConfidenceBand
  patternClass: ProfilePatternClass
  driftFlags: ProfileDriftFlags
  consecutiveUnauthorizedCount: number
  consecutiveEmptyCount: number
  totalRuns: number
  successfulRuns: number
  lastProfiledAt: string
}

export interface EndpointMappingFeedback {
  id: string
  userId: string
  dashboardId: string
  endpointId: string
  widgetId?: string
  sourceAction: 'create_widget' | 'edit_widget' | 'review_override' | 'review_accept'
  acceptedMapping: MappingCandidate
  previousMapping?: MappingCandidate
  notes?: string
  createdAt: string
}

export interface TrainingEndpointResult {
  endpointId: string
  endpointName: string
  endpointUrl: string
  status: EndpointRunStatus
  statusCode?: number
  latencyMs?: number
  likelyReason?: string
  shapeSignature?: string
  rowCount?: number
  patternClass: ProfilePatternClass
  confidence: number
  confidenceBand: MappingConfidenceBand
  driftFlags: ProfileDriftFlags
  candidateMapping?: MappingCandidate
  fieldStats?: EndpointFieldStat[]
}

export interface TrainingProfileSummary {
  scanned: number
  mappedHighConfidence: number
  reviewRequired: number
  unauthorized: number
  empty: number
  failed: number
  results: TrainingEndpointResult[]
}

export interface TrainingProfileRequest {
  dashboardId: string
  endpointIds?: string[]
  force?: boolean
  demoSession?: {
    token: string
    headerName?: string
    prefix?: string
  }
}

export const DEFAULT_PROFILE_DRIFT_FLAGS: ProfileDriftFlags = {
  shapeChanged: false,
  repeatedUnauthorized: false,
  repeatedEmpty: false,
  seedMismatch: false,
}

export function getConfidenceBand(confidence: number): MappingConfidenceBand {
  if (confidence >= 80) return 'high'
  if (confidence >= 60) return 'review'
  return 'low'
}
