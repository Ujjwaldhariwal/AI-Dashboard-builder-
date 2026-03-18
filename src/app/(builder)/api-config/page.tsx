'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import AILoader from '@/components/loaders/ai-loader'
import { useDashboardStore } from '@/store/builder-store'
import { LiveAPIPreview } from '@/components/builder/api-tester/live-api-preview'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Search,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
  Radar,
} from 'lucide-react'
import { BOSCH_UPPCL_ENDPOINTS } from '@/lib/blueprints/bosch-uppcl'
import {
  clearBuilderDemoAuthSession,
  getBuilderDemoAuthSession,
  getBuilderDemoAuthTokenMeta,
} from '@/lib/auth/demo-auth-session'
import Link from 'next/link'
import {
  getEndpointSessionScope,
  probeDashboardEndpoints,
  type DashboardEndpointProbeSummary,
} from '@/lib/api/endpoint-runtime-cache'
import { buildAutoWidgetsFromEndpoints } from '@/lib/builder/auto-widget-generator'
import { useDashboardEndpointPrefetch } from '@/hooks/use-dashboard-endpoint-prefetch'
import {
  fetchTrainingProfiles,
  profileDashboardEndpoints,
  profileMapFromList,
  saveEndpointMappingFeedback,
} from '@/lib/training/profile-client'
import type { ChartType } from '@/types/widget'
import type { TrainingProfileSummary, MappingCandidate, EndpointProfile } from '@/types/training'

type AuthType = 'none' | 'api-key' | 'bearer' | 'basic' | 'custom-headers'
type StatusType = 'active' | 'inactive'

const AUTH_HINTS: Record<AuthType, { keyLabel: string; valueLabel: string; keyPlaceholder: string } | null> = {
  none: null,
  'api-key': { keyLabel: 'Header name', valueLabel: 'API key value', keyPlaceholder: 'X-API-Key' },
  bearer: { keyLabel: '', valueLabel: 'Bearer token', keyPlaceholder: '' },
  basic: { keyLabel: 'Username', valueLabel: 'Password', keyPlaceholder: '' },
  'custom-headers': null,
}

const DEFAULT_FORM = {
  name: '',
  url: '',
  method: 'GET' as 'GET' | 'POST',
  authType: 'none' as AuthType,
  authKey: '',
  authValue: '',
  customHeaders: '',
  refreshInterval: 0,
  status: 'active' as StatusType,
}

const BOSCH_UPPCL_PRESET: Array<{ name: string; path: string }> = BOSCH_UPPCL_ENDPOINTS.map(
  endpoint => ({ name: endpoint.name, path: endpoint.path }),
)

const CHART_TYPE_OPTIONS: ChartType[] = [
  'bar',
  'line',
  'area',
  'pie',
  'donut',
  'horizontal-bar',
  'horizontal-stacked-bar',
  'grouped-bar',
  'drilldown-bar',
  'gauge',
  'ring-gauge',
  'status-card',
  'table',
]

function parseCustomHeaders(value: string): Record<string, string> {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .reduce((acc, line) => {
      const index = line.indexOf(':')
      if (index <= 0) return acc
      const key = line.slice(0, index).trim()
      const headerValue = line.slice(index + 1).trim()
      if (!key) return acc
      acc[key] = headerValue
      return acc
    }, {} as Record<string, string>)
}

export default function APIConfigPage() {
  const {
    currentDashboardId,
    endpoints,
    widgets,
    addEndpoint,
    addWidget,
    removeEndpoint,
    updateEndpoint,
  } = useDashboardStore()

  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState(DEFAULT_FORM)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | StatusType>('all')
  const [previewRunToken, setPreviewRunToken] = useState(0)
  const [sessionToken, setSessionToken] = useState(getBuilderDemoAuthSession()?.token ?? '')
  const [sessionClockMs, setSessionClockMs] = useState(() => Date.now())
  const [sessionScope, setSessionScope] = useState(() => getEndpointSessionScope())
  const [scanSummary, setScanSummary] = useState<DashboardEndpointProbeSummary | null>(null)
  const [isScanningApis, setIsScanningApis] = useState(false)
  const [isAutoAddingWidgets, setIsAutoAddingWidgets] = useState(false)
  const [trainingSummary, setTrainingSummary] = useState<TrainingProfileSummary | null>(null)
  const [isTrainingApis, setIsTrainingApis] = useState(false)
  const [reviewMappings, setReviewMappings] = useState<Record<string, MappingCandidate>>({})
  const [savingReviewEndpointId, setSavingReviewEndpointId] = useState<string | null>(null)

  useEffect(() => {
    const listener = () => {
      setSessionToken(getBuilderDemoAuthSession()?.token ?? '')
      setSessionClockMs(Date.now())
      setSessionScope(getEndpointSessionScope())
    }
    window.addEventListener('builderDemoAuthSessionChanged', listener)
    return () => window.removeEventListener('builderDemoAuthSessionChanged', listener)
  }, [])

  useEffect(() => {
    if (!sessionToken) return
    const timer = window.setInterval(() => setSessionClockMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sessionToken])

  const sessionTokenMeta = useMemo(
    () => (sessionToken ? getBuilderDemoAuthTokenMeta(sessionToken, sessionClockMs) : null),
    [sessionClockMs, sessionToken],
  )

  const dashboardEndpoints = useMemo(
    () =>
      endpoints.filter(endpoint => (endpoint.dashboardId ?? currentDashboardId) === currentDashboardId),
    [currentDashboardId, endpoints],
  )

  const dashboardWidgets = useMemo(
    () => widgets.filter(widget => widget.dashboardId === currentDashboardId),
    [widgets, currentDashboardId],
  )

  const activeDashboardEndpoints = useMemo(
    () =>
      dashboardEndpoints.filter(endpoint =>
        endpoint.status === 'active' &&
        typeof endpoint.url === 'string' &&
        endpoint.url.trim().length > 0,
      ),
    [dashboardEndpoints],
  )

  useDashboardEndpointPrefetch(activeDashboardEndpoints)

  const statusCounts = useMemo(() => {
    const active = dashboardEndpoints.filter(endpoint => endpoint.status === 'active').length
    const inactive = dashboardEndpoints.length - active
    return { active, inactive }
  }, [dashboardEndpoints])

  const filteredEndpoints = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return dashboardEndpoints.filter(endpoint => {
      if (statusFilter !== 'all' && endpoint.status !== statusFilter) return false
      if (!query) return true
      return (
        endpoint.name.toLowerCase().includes(query) ||
        endpoint.url.toLowerCase().includes(query)
      )
    })
  }, [dashboardEndpoints, searchQuery, statusFilter])

  const authHint = AUTH_HINTS[formData.authType]

  const runHealthScan = useCallback(async (
    options: { force?: boolean; silent?: boolean } = {},
  ) => {
    if (activeDashboardEndpoints.length === 0) {
      setScanSummary(null)
      if (!options.silent) {
        toast.info('No active APIs available for scan.')
      }
      return null
    }

    setIsScanningApis(true)
    if (!options.silent) {
      toast.loading('Scanning APIs...', { id: 'api-config-scan' })
    }

    try {
      const summary = await probeDashboardEndpoints(activeDashboardEndpoints, {
        force: options.force,
        sessionScope,
      })
      setScanSummary(summary)

      if (!options.silent) {
        toast.success(
          `Scan done: ${summary.healthy} healthy, ${summary.unauthorized} unauthorized, ${summary.failed} failed.`,
          { id: 'api-config-scan' },
        )
      }
      return summary
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!options.silent) {
        toast.error(`Scan failed: ${message}`, { id: 'api-config-scan' })
      }
      return null
    } finally {
      setIsScanningApis(false)
    }
  }, [activeDashboardEndpoints, sessionScope])

  useEffect(() => {
    void runHealthScan({ silent: true })
  }, [runHealthScan])

  const runTrainingScan = useCallback(async () => {
    if (!currentDashboardId) return
    if (activeDashboardEndpoints.length === 0) {
      toast.info('No active APIs available for training.')
      return
    }

    setIsTrainingApis(true)
    toast.loading('Profiling and training active APIs...', { id: 'api-training' })
    try {
      const session = getBuilderDemoAuthSession()
      const summary = await profileDashboardEndpoints({
        dashboardId: currentDashboardId,
        endpointIds: activeDashboardEndpoints
          .map(endpoint => endpoint.id)
          .filter((value): value is string => Boolean(value)),
        force: true,
        demoSession: session?.token
          ? {
              token: session.token,
              headerName: session.headerName,
              prefix: session.prefix,
            }
          : undefined,
      })
      setTrainingSummary(summary)

      const nextReviewMappings: Record<string, MappingCandidate> = {}
      summary.results.forEach(result => {
        if (result.status !== 'healthy') return
        if (result.confidenceBand === 'high') return
        if (!result.candidateMapping) return
        nextReviewMappings[result.endpointId] = result.candidateMapping
      })
      setReviewMappings(nextReviewMappings)

      toast.success(
        `Training done: ${summary.mappedHighConfidence} high-confidence, ${summary.reviewRequired} review.`,
        { id: 'api-training' },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(`Training failed: ${message}`, { id: 'api-training' })
    } finally {
      setIsTrainingApis(false)
    }
  }, [activeDashboardEndpoints, currentDashboardId])

  const handleSaveReviewMapping = useCallback(async (endpointId: string) => {
    if (!currentDashboardId) return
    const draft = reviewMappings[endpointId]
    if (!draft) return

    const original = trainingSummary?.results.find(result => result.endpointId === endpointId)?.candidateMapping
    if (!original) return

    setSavingReviewEndpointId(endpointId)
    try {
      const hasOverride = (
        draft.type !== original.type ||
        draft.xAxis !== original.xAxis ||
        draft.yAxis !== original.yAxis
      )

      await saveEndpointMappingFeedback({
        dashboardId: currentDashboardId,
        endpointId,
        sourceAction: hasOverride ? 'review_override' : 'review_accept',
        acceptedMapping: {
          ...draft,
          confidence: Math.max(draft.confidence ?? 88, 88),
          source: 'manual',
          reason: hasOverride ? 'Manual review override' : 'Review accepted suggested mapping',
        },
        previousMapping: original,
        notes: hasOverride ? 'Adjusted during API Config review queue.' : 'Accepted from training queue.',
      })

      setTrainingSummary(prev => {
        if (!prev) return prev
        return {
          ...prev,
          mappedHighConfidence: prev.mappedHighConfidence + 1,
          reviewRequired: Math.max(0, prev.reviewRequired - 1),
          results: prev.results.map(result => {
            if (result.endpointId !== endpointId) return result
            return {
              ...result,
              confidenceBand: 'high',
              confidence: Math.max(result.confidence, 88),
              candidateMapping: draft,
            }
          }),
        }
      })
      toast.success('Review mapping saved and promoted to high-confidence profile.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to save review mapping: ${message}`)
    } finally {
      setSavingReviewEndpointId(null)
    }
  }, [currentDashboardId, reviewMappings, trainingSummary])

  const handleAutoAddHealthyWidgets = useCallback(async () => {
    if (!currentDashboardId) return
    if (activeDashboardEndpoints.length === 0) {
      toast.info('No active APIs to auto-add.')
      return
    }

    setIsAutoAddingWidgets(true)
    toast.loading('Auto-adding healthy APIs to Builder...', { id: 'api-config-auto-add' })

    try {
      const latestSummary = scanSummary ?? await runHealthScan({ silent: true })
      if (!latestSummary) {
        toast.error('Unable to scan APIs before auto-add.', { id: 'api-config-auto-add' })
        return
      }

      const healthyEndpointIds = new Set(
        latestSummary.results
          .filter(result => result.status === 'healthy' && typeof result.endpointId === 'string')
          .map(result => result.endpointId as string),
      )

      if (healthyEndpointIds.size === 0) {
        toast.info('No healthy APIs found in latest scan.', { id: 'api-config-auto-add' })
        return
      }

      let trainedProfilesByEndpointId: Record<string, EndpointProfile> | undefined
      try {
        const profiles = await fetchTrainingProfiles(currentDashboardId)
        trainedProfilesByEndpointId = profileMapFromList(profiles)
      } catch {
        trainedProfilesByEndpointId = undefined
      }

      const {
        drafts,
        skippedExisting,
        skippedNoData,
        skippedFetch,
        skippedReview,
      } = await buildAutoWidgetsFromEndpoints({
        endpoints: activeDashboardEndpoints,
        widgets: dashboardWidgets,
        sessionScope,
        healthyEndpointIds,
        trainedProfilesByEndpointId,
      })

      if (drafts.length === 0) {
        toast.info(
          `No widgets added. Existing: ${skippedExisting}, review: ${skippedReview}, no-data: ${skippedNoData}, fetch-failed: ${skippedFetch}.`,
          { id: 'api-config-auto-add' },
        )
        return
      }

      drafts.forEach(draft => {
        addWidget({
          title: draft.title,
          type: draft.type,
          endpointId: draft.endpointId,
          dataMapping: {
            xAxis: draft.xAxis,
            yAxis: draft.yAxis,
            yAxes: draft.yAxes,
          },
          position: draft.position,
        })
      })

      toast.success(
        `Added ${drafts.length} widget(s). Skipped ${skippedExisting + skippedNoData + skippedFetch + skippedReview}.`,
        { id: 'api-config-auto-add' },
      )
    } finally {
      setIsAutoAddingWidgets(false)
    }
  }, [
    currentDashboardId,
    activeDashboardEndpoints,
    dashboardWidgets,
    scanSummary,
    runHealthScan,
    sessionScope,
    addWidget,
  ])

  const resetForm = () => {
    setFormData(DEFAULT_FORM)
    setIsCreating(false)
  }

  const buildHeaders = () => {
    if (formData.authType === 'none') return {}
    if (formData.authType === 'custom-headers') {
      return parseCustomHeaders(formData.customHeaders)
    }
    if (!formData.authValue) return {}
    if (formData.authType === 'bearer') {
      return { Authorization: `Bearer ${formData.authValue}` }
    }
    if (formData.authType === 'api-key' && formData.authKey) {
      return { [formData.authKey]: formData.authValue }
    }
    if (formData.authType === 'basic') {
      return { Authorization: `Basic ${btoa(`${formData.authKey}:${formData.authValue}`)}` }
    }
    return {}
  }

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast.error('Name and URL are required')
      return
    }

    addEndpoint({
      name: formData.name.trim(),
      url: formData.url.trim(),
      method: formData.method,
      authType: formData.authType,
      refreshInterval: 0,
      status: formData.status,
      headers: buildHeaders(),
    })
    toast.success('API endpoint saved')
    resetForm()
  }

  const toggleStatus = (id: string, current: StatusType) => {
    const next = current === 'active' ? 'inactive' : 'active'
    updateEndpoint(id, { status: next })
    toast.success(`Endpoint set to ${next}`)
  }

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url).catch(() => {
      toast.error('Failed to copy URL')
    })
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const loadBoschPreset = () => {
    const existingUrls = new Set(dashboardEndpoints.map(endpoint => endpoint.url))
    let added = 0

    BOSCH_UPPCL_PRESET.forEach(item => {
      const url = `/api/bosch/${item.path}`
      if (existingUrls.has(url)) return

      addEndpoint({
        name: item.name,
        url,
        method: 'POST',
        authType: 'none',
        refreshInterval: 0,
        status: 'active',
        headers: {},
      })
      added += 1
    })

    if (!added) {
      toast.info('Bosch preset already loaded')
      return
    }
    toast.success(`Loaded Bosch UPPCL preset (${added} new endpoints)`)
  }

  const toggleAnalysisPanel = (endpointId: string) => {
    setExpandedId((current) => {
      if (current === endpointId) return null
      return endpointId
    })
    setPreviewRunToken(prev => prev + 1)
  }

  if (!currentDashboardId) {
    return (
      <div className="p-6">
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-10 text-center">
            <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No dashboard selected</h3>
            <p className="text-sm text-muted-foreground">Select a dashboard in Workspaces first.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="w-full max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">API Configuration</h1>
            <p className="text-sm text-muted-foreground">
              Configure endpoints, run scoped diagnostics, and add widgets from validated APIs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runHealthScan({ force: true })}
              disabled={isScanningApis || activeDashboardEndpoints.length === 0}
            >
              {isScanningApis ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Radar className="w-3.5 h-3.5 mr-1.5" />
              )}
              {isScanningApis ? 'Scanning...' : 'Scan APIs'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleAutoAddHealthyWidgets()}
              disabled={isAutoAddingWidgets || !scanSummary || scanSummary.healthy === 0}
            >
              {isAutoAddingWidgets ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              )}
              {isAutoAddingWidgets ? 'Adding...' : 'Add Healthy To Builder'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runTrainingScan()}
              disabled={isTrainingApis || activeDashboardEndpoints.length === 0}
            >
              {isTrainingApis ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              )}
              {isTrainingApis ? 'Training...' : 'Train / Analyze APIs'}
            </Button>
            <Button size="sm" variant="outline" onClick={loadBoschPreset}>
              <Database className="w-3.5 h-3.5 mr-1.5" />
              Load UPPCL Preset
            </Button>
            {!isCreating && (
              <Button size="sm" onClick={() => setIsCreating(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add API
              </Button>
            )}
          </div>
        </div>

        {scanSummary && (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
              {scanSummary.healthy} Healthy
            </Badge>
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
              {scanSummary.unauthorized} Auth Required
            </Badge>
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
              {scanSummary.empty} Empty Data
            </Badge>
            <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">
              {scanSummary.failed} Needs Attention
            </Badge>
          </div>
        )}

        {(isTrainingApis || trainingSummary) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Bosch Training Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isTrainingApis && (
                <div className="flex justify-center py-2">
                  <AILoader />
                </div>
              )}

              {trainingSummary && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
                      {trainingSummary.mappedHighConfidence} High Confidence
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                      {trainingSummary.reviewRequired} Review Required
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">
                      {trainingSummary.failed} Failed
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {trainingSummary.empty} Empty
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                      {trainingSummary.unauthorized} Unauthorized
                    </Badge>
                  </div>

                  {trainingSummary.reviewRequired > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Review Queue
                      </p>

                      {trainingSummary.results
                        .filter(result => result.status === 'healthy' && result.confidenceBand !== 'high')
                        .map(result => {
                          const draft = reviewMappings[result.endpointId] ?? result.candidateMapping
                          if (!draft) return null

                          return (
                            <div key={result.endpointId} className="rounded-lg border p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{result.endpointName}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">{result.endpointUrl}</p>
                                </div>
                                <Badge variant="outline" className="text-[10px]">
                                  {result.confidence}% {result.confidenceBand}
                                </Badge>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <Select
                                  value={draft.type}
                                  onValueChange={(value: ChartType) => {
                                    setReviewMappings(prev => ({
                                      ...prev,
                                      [result.endpointId]: { ...draft, type: value },
                                    }))
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CHART_TYPE_OPTIONS.map(type => (
                                      <SelectItem key={type} value={type}>
                                        {type}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <Input
                                  className="h-8 text-xs"
                                  value={draft.xAxis}
                                  onChange={(event) => {
                                    setReviewMappings(prev => ({
                                      ...prev,
                                      [result.endpointId]: { ...draft, xAxis: event.target.value },
                                    }))
                                  }}
                                  placeholder="xAxis"
                                />

                                <Input
                                  className="h-8 text-xs"
                                  value={draft.yAxis ?? ''}
                                  onChange={(event) => {
                                    setReviewMappings(prev => ({
                                      ...prev,
                                      [result.endpointId]: { ...draft, yAxis: event.target.value },
                                    }))
                                  }}
                                  placeholder="yAxis"
                                />
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  onClick={() => void handleSaveReviewMapping(result.endpointId)}
                                  disabled={savingReviewEndpointId === result.endpointId}
                                >
                                  {savingReviewEndpointId === result.endpointId
                                    ? 'Saving...'
                                    : 'Save Mapping'}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                    Runtime session
                  </p>
                  <p className="text-sm mt-1">
                    {sessionToken ? 'Demo token session is active' : 'No demo token session found'}
                  </p>
                  {sessionTokenMeta?.isExpired ? (
                    <p className="text-[11px] text-red-600 mt-1">
                      Token expired. Re-run login in Auth Setup to continue API calls.
                    </p>
                  ) : sessionTokenMeta?.remainingMs !== null && sessionTokenMeta?.remainingMs !== undefined ? (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Expires in {Math.max(0, Math.floor(sessionTokenMeta.remainingMs / 1000))}s
                    </p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Manage token capture in{' '}
                    <Link href="/auth-flow" className="underline">
                      Auth Setup
                    </Link>
                    .
                  </p>
                </div>
                <Badge variant={sessionToken ? 'default' : 'outline'} className="text-[10px]">
                  {sessionToken ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {sessionToken && (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      clearBuilderDemoAuthSession()
                      toast.success('Demo token session cleared')
                    }}
                  >
                    Clear Session
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-emerald-600" />
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Workflow notes
                </p>
              </div>
              <ul className="space-y-1 text-[11px] text-emerald-800 dark:text-emerald-200">
                <li>• Some enterprise APIs require VPN and valid session token.</li>
                <li>• Run diagnostics per API card to isolate header/auth issues.</li>
                <li>• Keep endpoints inactive if environment is currently unavailable.</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {isCreating && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">New API endpoint</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="e.g., Users Service"
                    value={formData.name}
                    onChange={event => setFormData({ ...formData, name: event.target.value })}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={formData.method}
                    onValueChange={(value: 'GET' | 'POST') => setFormData({ ...formData, method: value })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">API URL *</Label>
                <Input
                  className="h-8 text-sm font-mono"
                  placeholder="https://api.example.com/data"
                  value={formData.url}
                  onChange={event => setFormData({ ...formData, url: event.target.value })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Authentication</Label>
                  <Select
                    value={formData.authType}
                    onValueChange={(value: AuthType) =>
                      setFormData({
                        ...formData,
                        authType: value,
                        authKey: '',
                        authValue: '',
                        customHeaders: '',
                      })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="api-key">API Key</SelectItem>
                      <SelectItem value="bearer">Bearer</SelectItem>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="custom-headers">Custom headers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: StatusType) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {authHint && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Credentials
                    </span>
                  </div>
                  {formData.authType !== 'bearer' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{authHint.keyLabel}</Label>
                      <Input
                        className="h-8 text-sm"
                        placeholder={authHint.keyPlaceholder || authHint.keyLabel}
                        value={formData.authKey}
                        onChange={event => setFormData({ ...formData, authKey: event.target.value })}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">{authHint.valueLabel}</Label>
                    <Input
                      className="h-8 text-sm font-mono"
                      type="password"
                      value={formData.authValue}
                      onChange={event => setFormData({ ...formData, authValue: event.target.value })}
                    />
                  </div>
                </div>
              )}

              {formData.authType === 'custom-headers' && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                  <Label className="text-xs">Custom headers</Label>
                  <Textarea
                    className="text-xs font-mono min-h-[92px]"
                    placeholder={'userid: asxxp12\npassword: 212@121'}
                    value={formData.customHeaders}
                    onChange={event => setFormData({ ...formData, customHeaders: event.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Format: <span className="font-mono">Header-Name: value</span>
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleSubmit} disabled={!formData.name.trim() || !formData.url.trim()}>
                  Save Endpoint
                </Button>
                <Button size="sm" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Connected APIs</h2>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-300 text-emerald-700">
                {statusCounts.active} active
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {statusCounts.inactive} inactive
              </Badge>
              <span className="text-xs text-muted-foreground ml-1">
                {dashboardEndpoints.length} source{dashboardEndpoints.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {dashboardEndpoints.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  className="h-8 pl-8 text-sm"
                  placeholder="Search APIs by name or URL..."
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value: 'all' | StatusType) => setStatusFilter(value)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {dashboardEndpoints.length === 0 && !isCreating && (
            <Card>
              <CardContent className="py-10 text-center">
                <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-semibold mb-1">No APIs yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Add your first data source.</p>
                <Button size="sm" onClick={() => setIsCreating(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add first API
                </Button>
              </CardContent>
            </Card>
          )}

          {filteredEndpoints.map(endpoint => {
            const isActive = endpoint.status === 'active'
            const isExpanded = expandedId === endpoint.id
            return (
              <Card key={endpoint.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {isActive ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                        </div>
                        <h3 className="font-semibold text-xs truncate">{endpoint.name}</h3>
                        <Badge variant="outline" className="text-[10px]">{endpoint.method}</Badge>
                        <Badge
                          variant={isActive ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <p className="text-[11px] text-muted-foreground font-mono truncate flex-1">
                          {endpoint.url}
                        </p>
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => copyUrl(endpoint.url, endpoint.id)}
                          title="Copy URL"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {copiedId === endpoint.id && (
                          <span className="text-[10px] text-emerald-600">Copied</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Switch checked={isActive} onCheckedChange={() => toggleStatus(endpoint.id, endpoint.status as StatusType)} />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => toggleAnalysisPanel(endpoint.id)}
                      >
                        Diagnostics
                        {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700"
                        onClick={() => setDeleteId(endpoint.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="pt-3 border-t">
                      <LiveAPIPreview
                        url={endpoint.url}
                        method={endpoint.method}
                        headers={endpoint.headers}
                        endpointId={endpoint.id}
                        hideActionButton
                        runToken={previewRunToken}
                        onAnalysisComplete={() => {}}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {dashboardEndpoints.length > 0 && filteredEndpoints.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No API endpoint matches the current filter.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open: boolean) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the endpoint from this dashboard. Widgets linked to it will stop fetching data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteId) {
                  removeEndpoint(deleteId)
                  toast.success('Endpoint removed')
                }
                setDeleteId(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
