'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Play,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { DataAnalyzer, type DataAnalysis } from '@/lib/ai/data-analyzer'
import { buildEndpointRequestInit } from '@/lib/api/request-utils'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import type { ChartType } from '@/types/widget'
import { toast } from 'sonner'
import { getBoschSeedMapping } from '@/lib/training/bosch-seed-mappings'
import { resolveMappingWithFallback } from '@/lib/training/mapping-engine'
import { fetchAIFallbackMapping } from '@/lib/training/ai-fallback'
import { getBuilderDemoAuthSession } from '@/lib/auth/demo-auth-session'
import { useDashboardStore } from '@/store/builder-store'

interface LiveAPIPreviewProps {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  endpointId?: string
  onAnalysisComplete?: (analysis: DataAnalysis) => void
  autoRun?: boolean
  hideActionButton?: boolean
  runToken?: number
}

interface TestMeta {
  statusCode?: number
  latencyMs?: number
  recordCount?: number
  passed: boolean
}

type SuggestedChart = DataAnalysis['suggestedCharts'][0]
type LoadingStage = 'connecting' | 'fetching' | 'analyzing'

const CHART_TYPE_LABELS: Record<string, string> = {
  line: 'LINE',
  bar: 'BAR',
  area: 'AREA',
  pie: 'PIE',
  'grouped-bar': 'GROUPED',
  'horizontal-bar': 'H-BAR',
  'horizontal-stacked-bar': 'STACKED',
  'drilldown-bar': 'DRILLDOWN',
  gauge: 'GAUGE',
  'ring-gauge': 'RING',
  table: 'TABLE',
}

const STAGE_LABELS: Array<{ id: LoadingStage; label: string }> = [
  { id: 'connecting', label: 'Connecting to endpoint' },
  { id: 'fetching', label: 'Fetching payload' },
  { id: 'analyzing', label: 'Analyzing schema' },
]

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function getLikelyFailureReasons(input: {
  statusCode?: number
  message?: string
  sessionActive: boolean
  payload?: unknown
}): string[] {
  const reasons: string[] = []
  const message = (input.message ?? '').toLowerCase()

  if (input.statusCode === 401 || input.statusCode === 403) {
    reasons.push('Authentication mismatch or expired token/session.')
  }
  if (input.statusCode === 400 || input.statusCode === 422) {
    reasons.push('Payload mismatch or missing required body/query fields.')
  }
  if (message.includes('cors')) {
    reasons.push('CORS policy rejected the request in browser context.')
  }
  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    reasons.push('Network/VPN dependency issue or blocked upstream endpoint.')
  }
  if (!input.sessionActive) {
    reasons.push('No active demo token session applied to this request.')
  }
  if (input.statusCode !== undefined && input.statusCode >= 500) {
    reasons.push('Upstream API environment issue (server unavailable or unstable).')
  }

  const payload = input.payload as Record<string, unknown> | null
  if (payload && typeof payload === 'object') {
    const messageField = payload.message
    if (typeof messageField === 'string' && /expired|invalid|token|auth/i.test(messageField)) {
      reasons.push('Token/session may be expired or invalid for this endpoint.')
    }
  }

  return Array.from(new Set(reasons))
}

function getEnvironmentNotes() {
  return [
    'Verify VPN access when calling network-restricted enterprise APIs.',
    'Confirm token header/prefix matches API gateway expectation.',
    'Validate request headers and payload shape against upstream portal examples.',
  ]
}

export function LiveAPIPreview({
  url,
  method,
  headers,
  endpointId,
  onAnalysisComplete,
  autoRun = false,
  hideActionButton = false,
  runToken = 0,
}: LiveAPIPreviewProps) {
  const endpoint = useDashboardStore((state) => state.endpoints.find(item => item.id === endpointId))
  const [loading, setLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [rawData, setRawData] = useState<Record<string, unknown>[] | null>(null)
  const [rawPayload, setRawPayload] = useState<unknown>(null)
  const [analysis, setAnalysis] = useState<DataAnalysis | null>(null)
  const [meta, setMeta] = useState<TestMeta>({ passed: false })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogProps, setDialogProps] = useState<{
    endpointId: string
    suggestedType: ChartType
    suggestedXAxis: string
    suggestedYAxis: string
    availableFields: { name: string; type: string }[]
  } | null>(null)
  const [sessionActive, setSessionActive] = useState(Boolean(getBuilderDemoAuthSession()?.token))
  const activeRequestRef = useRef<AbortController | null>(null)
  const hasAutoRunTriggeredRef = useRef(false)
  const lastRunTokenRef = useRef(0)
  const onAnalysisCompleteRef = useRef(onAnalysisComplete)

  useEffect(() => {
    onAnalysisCompleteRef.current = onAnalysisComplete
  }, [onAnalysisComplete])

  useEffect(() => () => {
    activeRequestRef.current?.abort()
    activeRequestRef.current = null
  }, [])

  useEffect(() => {
    const listener = () => setSessionActive(Boolean(getBuilderDemoAuthSession()?.token))
    window.addEventListener('builderDemoAuthSessionChanged', listener)
    return () => window.removeEventListener('builderDemoAuthSessionChanged', listener)
  }, [])

  const handleTest = useCallback(async () => {
    if (!url) {
      toast.error('Enter a URL first')
      return
    }

    activeRequestRef.current?.abort()
    const controller = new AbortController()
    activeRequestRef.current = controller

    setLoading(true)
    setLoadingStage('connecting')
    setError(null)
    setRawData(null)
    setRawPayload(null)
    setAnalysis(null)
    setMeta({ passed: false })

    const startedAt = performance.now()

    try {
      const requestInit = buildEndpointRequestInit({
        method,
        headers,
        body: {},
      })
      const response = await fetch(
        url,
        {
          ...requestInit,
          signal: controller.signal,
        },
      )
      setLoadingStage('fetching')
      const payload = await response.json().catch(() => null)
      setRawPayload(payload)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const payloadRecord = payload as Record<string, unknown> | null
      if (payloadRecord && payloadRecord.status === false) {
        const apiMessage = typeof payloadRecord.message === 'string'
          ? payloadRecord.message
          : 'API returned status=false'
        throw new Error(apiMessage)
      }

      setLoadingStage('analyzing')
      const dataArray =
        DataAnalyzer.extractDataArray(payload) ??
        (Array.isArray(payload) ? payload : [payload])

      const normalizedData = dataArray as Record<string, unknown>[]
      setRawData(normalizedData.slice(0, 8))

      const result = DataAnalyzer.analyzeArray(normalizedData)

      const mapping = await resolveMappingWithFallback({
        rows: normalizedData,
        endpointName: endpoint?.name ?? 'Endpoint',
        endpointUrl: endpoint?.url,
        seedMapping: getBoschSeedMapping({
          endpointUrl: endpoint?.url,
          endpointName: endpoint?.name,
        }),
      }, {
        aiFallback: ({ fields, sampleRows }) => fetchAIFallbackMapping({
          fields,
          sampleRows,
          endpointName: endpoint?.name ?? 'Endpoint',
        }),
      })

      const mergedAnalysis: DataAnalysis = {
        ...result,
        suggestedCharts: mapping.candidate
          ? [
              {
                type: mapping.candidate.type,
                xAxis: mapping.candidate.xAxis,
                yAxis: mapping.candidate.yAxis,
                groupBy: mapping.candidate.xAxis,
                confidence: mapping.candidate.confidence,
              },
              ...result.suggestedCharts
                .filter(suggestion => suggestion.type !== mapping.candidate?.type)
                .slice(0, 3),
            ]
          : result.suggestedCharts,
      }

      setAnalysis(mergedAnalysis)
      onAnalysisCompleteRef.current?.(mergedAnalysis)

      const latencyMs = Math.round(performance.now() - startedAt)
      setMeta({
        statusCode: response.status,
        latencyMs,
        recordCount: result.totalRecords,
        passed: true,
      })
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') {
        return
      }
      const latencyMs = Math.round(performance.now() - startedAt)
      const message = normalizeErrorMessage(requestError)
      setError(message)
      setMeta({
        passed: false,
        latencyMs,
      })
    } finally {
      const isLatestRequest = activeRequestRef.current === controller
      if (isLatestRequest) {
        activeRequestRef.current = null
        setLoading(false)
      }
    }
  }, [endpoint?.name, endpoint?.url, headers, method, url])

  useEffect(() => {
    if (!autoRun) {
      hasAutoRunTriggeredRef.current = false
      return
    }
    if (hasAutoRunTriggeredRef.current) return
    hasAutoRunTriggeredRef.current = true
    handleTest()
  }, [autoRun, handleTest])

  useEffect(() => {
    if (!runToken) return
    if (lastRunTokenRef.current === runToken) return
    lastRunTokenRef.current = runToken
    handleTest()
  }, [runToken, handleTest])

  const openWidgetDialogFromSuggestion = (suggestion: SuggestedChart) => {
    if (!endpointId) {
      toast.error('Save the endpoint first before adding widgets')
      return
    }
    if (!analysis) return

    const xAxis = suggestion.xAxis ?? suggestion.groupBy ?? analysis.fields[0]?.name
    const yAxis = suggestion.yAxis ?? analysis.fields[1]?.name

    if (!xAxis || !yAxis) {
      toast.error('Could not determine axes from this suggestion')
      return
    }

    setDialogProps({
      endpointId,
      suggestedType: suggestion.type as ChartType,
      suggestedXAxis: xAxis,
      suggestedYAxis: yAxis,
      availableFields: analysis.fields,
    })
    setDialogOpen(true)
  }

  const openWidgetDialogManual = () => {
    if (!endpointId) {
      toast.error('Save the endpoint first before adding widgets')
      return
    }
    if (!analysis || analysis.fields.length < 2) {
      toast.error('Not enough fields detected to create a widget')
      return
    }
    const [xAxisField, yAxisField] = analysis.fields
    setDialogProps({
      endpointId,
      suggestedType: 'bar',
      suggestedXAxis: xAxisField.name,
      suggestedYAxis: yAxisField.name,
      availableFields: analysis.fields,
    })
    setDialogOpen(true)
  }

  const actionableSuggestions = useMemo(
    () =>
      analysis?.suggestedCharts
        .filter(suggestion => suggestion.type !== 'table' && (suggestion.xAxis || suggestion.groupBy))
        .slice(0, 3) ?? [],
    [analysis],
  )

  const likelyFailureReasons = useMemo(
    () =>
      getLikelyFailureReasons({
        statusCode: meta.statusCode,
        message: error ?? undefined,
        sessionActive,
        payload: rawPayload,
      }),
    [error, meta.statusCode, rawPayload, sessionActive],
  )

  const environmentNotes = useMemo(getEnvironmentNotes, [])

  return (
    <div className="space-y-3">
      {!hideActionButton && (
        <Button size="sm" onClick={handleTest} disabled={loading || !url} className="w-full">
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1.5" />
          )}
          {loading ? 'Running analysis...' : 'Test & Analyze'}
        </Button>
      )}

      {loading && (
        <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Scoped test running for this API only
          </div>
          <div className="space-y-1.5">
            {STAGE_LABELS.map((stage) => {
              const isCurrent = stage.id === loadingStage
              return (
                <div key={stage.id} className="flex items-center justify-between text-[11px]">
                  <span className={isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                    {stage.label}
                  </span>
                  {isCurrent && <Badge variant="outline" className="text-[9px]">In progress</Badge>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-lg border p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">API</p>
          <p className="text-xs font-medium mt-1">{endpoint?.name ?? 'Endpoint'}</p>
          <p className="text-[11px] text-muted-foreground truncate">{url}</p>
        </div>
        <div className="rounded-lg border p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Connection status</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={endpoint?.status === 'inactive' ? 'secondary' : 'default'} className="text-[10px]">
              {endpoint?.status === 'inactive' ? 'Inactive' : 'Configured'}
            </Badge>
            {meta.passed ? (
              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
                Success
              </Badge>
            ) : error ? (
              <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">
                Failure
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">Not tested</Badge>
            )}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Session / Token</p>
          <div className="mt-1 flex items-center gap-2">
            {sessionActive ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs">Active demo session</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs">No active demo session</span>
              </>
            )}
          </div>
        </div>
        <div className="rounded-lg border p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Test metrics</p>
          <p className="text-xs mt-1">
            {typeof meta.statusCode === 'number' ? `HTTP ${meta.statusCode}` : 'HTTP -'}
            {' • '}
            {typeof meta.latencyMs === 'number' ? `${meta.latencyMs}ms` : 'Latency -'}
            {' • '}
            {typeof meta.recordCount === 'number' ? `${meta.recordCount} rows` : 'Rows -'}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-red-700">{error}</p>
          </div>

          {likelyFailureReasons.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-red-700 font-semibold mb-1.5">
                Likely failure reasons
              </p>
              <ul className="space-y-1">
                {likelyFailureReasons.map(reason => (
                  <li key={reason} className="text-[11px] text-red-700">
                    • {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wide text-red-700 font-semibold mb-1.5">
              Environment notes
            </p>
            <ul className="space-y-1">
              {environmentNotes.map(note => (
                <li key={note} className="text-[11px] text-red-700">
                  • {note}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {analysis && rawData && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-2 rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
              Analysis complete: {analysis.totalRecords} rows, {analysis.fields.length} fields
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Field map
            </p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.fields.map(field => (
                <Badge key={field.name} variant="outline" className="text-[10px] px-2 py-0.5">
                  {field.name}
                  <span className="ml-1 text-muted-foreground">{field.type}</span>
                </Badge>
              ))}
            </div>
          </div>

          {actionableSuggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3 h-3 text-blue-500" />
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Suggested visuals
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                {actionableSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.type}-${index}`}
                    onClick={() => openWidgetDialogFromSuggestion(suggestion)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg border border-muted-foreground/20 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-blue-600 w-9 flex-shrink-0">
                        {CHART_TYPE_LABELS[suggestion.type] ?? suggestion.type.toUpperCase()}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">
                        {suggestion.xAxis ?? suggestion.groupBy} vs {suggestion.yAxis}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <Badge variant="secondary" className="text-[9px] px-1.5">
                        {suggestion.confidence}%
                      </Badge>
                      <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="w-full text-xs text-muted-foreground"
            onClick={openWidgetDialogManual}
          >
            Manual setup (pick fields)
          </Button>
        </div>
      )}

      {(rawData || rawPayload !== null) && (
        <details>
          <summary className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
            Advanced raw response
          </summary>
          <div className="mt-2 overflow-auto max-h-[200px] rounded-lg border bg-muted/30">
            <pre className="text-[10px] p-3 leading-relaxed whitespace-pre-wrap">
              {JSON.stringify(rawPayload ?? rawData, null, 2)}
            </pre>
          </div>
        </details>
      )}

      {dialogProps && (
        <WidgetConfigDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          {...dialogProps}
        />
      )}
    </div>
  )
}
