import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import {
  fetchEndpointPayloadWithCache,
  type EndpointRuntimeTarget,
} from '@/lib/api/endpoint-runtime-cache'
import { getBoschSeedMapping } from '@/lib/training/bosch-seed-mappings'
import { resolveMappingWithFallback } from '@/lib/training/mapping-engine'
import type { EndpointProfile, MappingCandidate } from '@/types/training'
import type { ChartType, Widget, YAxisConfig } from '@/types/widget'

const AUTO_CHART_TYPES = new Set<ChartType>([
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
])

export interface AutoWidgetDraft {
  endpointId: string
  endpointName: string
  title: string
  type: ChartType
  xAxis: string
  yAxis?: string
  yAxes?: YAxisConfig[]
  position: {
    x: number
    y: number
    w: number
    h: number
  }
}

export interface AutoWidgetBuildResult {
  drafts: AutoWidgetDraft[]
  skippedExisting: number
  skippedNoData: number
  skippedFetch: number
  skippedReview: number
  eligibleCount: number
}

function isChartType(value: string): value is ChartType {
  return AUTO_CHART_TYPES.has(value as ChartType)
}

function getDefaultWidgetSize(type: ChartType) {
  if (type === 'table' || type === 'drilldown-bar' || type === 'horizontal-stacked-bar') {
    return { w: 12, h: 7 }
  }
  if (type === 'pie' || type === 'donut' || type === 'gauge' || type === 'ring-gauge' || type === 'status-card') {
    return { w: 4, h: 4 }
  }
  return { w: 6, h: 5 }
}

export function getNextWidgetStartY(widgets: Widget[]) {
  return widgets.reduce((maxY, widget) => {
    const y = widget.position?.y ?? 0
    const h = widget.position?.h ?? 4
    return Math.max(maxY, y + h)
  }, 0)
}

export function applyAutoLayout(
  drafts: Array<Omit<AutoWidgetDraft, 'position'>>,
  startY: number,
): AutoWidgetDraft[] {
  let cursorX = 0
  let cursorY = startY
  let rowHeight = 0

  return drafts.map(draft => {
    const size = getDefaultWidgetSize(draft.type)
    if (size.w === 12 && cursorX !== 0) {
      cursorY += rowHeight
      cursorX = 0
      rowHeight = 0
    }

    if (cursorX + size.w > 12) {
      cursorY += rowHeight
      cursorX = 0
      rowHeight = 0
    }

    const positioned: AutoWidgetDraft = {
      ...draft,
      position: {
        x: cursorX,
        y: cursorY,
        w: size.w,
        h: size.h,
      },
    }

    if (size.w === 12) {
      cursorY += size.h
      cursorX = 0
      rowHeight = 0
      return positioned
    }

    cursorX += size.w
    rowHeight = Math.max(rowHeight, size.h)
    return positioned
  })
}

export async function buildAutoWidgetDraftFromPayload(input: {
  endpointId: string
  endpointName: string
  endpointUrl: string
  payload: unknown
  preferredMapping?: MappingCandidate | null
}): Promise<Omit<AutoWidgetDraft, 'position'> | null> {
  const rows = DataAnalyzer.extractDataArray(input.payload)
  if (!rows || rows.length === 0) return null

  const validRows = rows.filter(
    row => row && typeof row === 'object' && !Array.isArray(row),
  ) as Record<string, unknown>[]
  if (!validRows.length) return null

  const analysis = DataAnalyzer.analyzeArray(validRows)
  if (!analysis.fields.length) return null

  const fieldNames = new Set(analysis.fields.map(field => field.name))
  const numericFields = new Set(
    analysis.fields.filter(field => field.type === 'number').map(field => field.name),
  )

  const preferred = input.preferredMapping ?? null
  const isPreferredValid = preferred
    && (!preferred.xAxis || fieldNames.has(preferred.xAxis))
    && (!preferred.yAxis || fieldNames.has(preferred.yAxis))
    && (!preferred.yAxis || preferred.type === 'table' || numericFields.has(preferred.yAxis))
    && (!preferred.yAxes || preferred.yAxes.every(axis => fieldNames.has(axis.key) && numericFields.has(axis.key)))

  const fallbackXAxis = analysis.fields.find(field => field.type === 'string' || field.type === 'date')?.name
    ?? analysis.fields[0]?.name
    ?? ''
  const fallbackYAxis = analysis.fields.find(field => field.type === 'number')?.name
    ?? analysis.fields[1]?.name
    ?? analysis.fields[0]?.name
    ?? ''

  const fallbackSuggestion =
    analysis.suggestedCharts.find(suggestion => suggestion.type !== 'table') ??
    analysis.suggestedCharts[0]

  const suggestedCandidate: MappingCandidate | null = isPreferredValid
    ? preferred
    : (await resolveMappingWithFallback({
      rows: validRows,
      endpointName: input.endpointName,
      endpointUrl: input.endpointUrl,
      seedMapping: getBoschSeedMapping({
        endpointUrl: input.endpointUrl,
        endpointName: input.endpointName,
      }),
    })).candidate

  const candidateType = suggestedCandidate?.type
  const fallbackType = fallbackSuggestion?.type
  let type: ChartType = 'table'
  if (candidateType && isChartType(candidateType)) {
    type = candidateType
  } else if (fallbackType && isChartType(fallbackType)) {
    type = fallbackType
  }
  const xAxis = suggestedCandidate?.xAxis
    ?? fallbackSuggestion?.xAxis
    ?? fallbackSuggestion?.groupBy
    ?? fallbackXAxis
  const yAxis = suggestedCandidate?.yAxis
    ?? fallbackSuggestion?.yAxis
    ?? fallbackYAxis
  const needsXAxis = !['gauge', 'ring-gauge', 'status-card'].includes(type)
  if (needsXAxis && !xAxis) return null
  if (!yAxis && type !== 'table') return null

  const cleanedEndpointName = input.endpointName.trim() || 'API'
  return {
    endpointId: input.endpointId,
    endpointName: cleanedEndpointName,
    title: `${cleanedEndpointName} Overview`,
    type,
    xAxis: xAxis || analysis.fields[0]?.name || 'label',
    yAxis: yAxis || undefined,
    yAxes: suggestedCandidate?.yAxes ?? (yAxis ? [{ key: yAxis, color: '#3b82f6' }] : undefined),
  }
}

export async function buildAutoWidgetsFromEndpoints(params: {
  endpoints: EndpointRuntimeTarget[]
  widgets: Widget[]
  sessionScope: string
  healthyEndpointIds?: Set<string>
  trainedProfilesByEndpointId?: Record<string, EndpointProfile>
}): Promise<AutoWidgetBuildResult> {
  const uniqueByEndpointId = new Map<string, EndpointRuntimeTarget>()
  params.endpoints.forEach(endpoint => {
    const endpointId = endpoint.id
    if (!endpointId) return
    if (endpoint.status === 'inactive') return
    if (!endpoint.url?.trim()) return
    if (params.healthyEndpointIds && !params.healthyEndpointIds.has(endpointId)) return
    if (!uniqueByEndpointId.has(endpointId)) {
      uniqueByEndpointId.set(endpointId, endpoint)
    }
  })

  const existingWidgetEndpointIds = new Set(params.widgets.map(widget => widget.endpointId))
  const eligibleEndpoints = Array.from(uniqueByEndpointId.values())
  const eligibleForCreate = eligibleEndpoints.filter(endpoint =>
    Boolean(endpoint.id) && !existingWidgetEndpointIds.has(endpoint.id as string),
  )

  const skippedExisting = eligibleEndpoints.length - eligibleForCreate.length
  let skippedNoData = 0
  let skippedFetch = 0
  let skippedReview = 0
  const draftCollection: Array<Omit<AutoWidgetDraft, 'position'>> = []

  for (const endpoint of eligibleForCreate) {
    if (!endpoint.id) continue
    const profile = params.trainedProfilesByEndpointId?.[endpoint.id]
    const preferredMapping = profile?.bestMapping
    if (profile?.confidenceBand === 'review' || profile?.confidenceBand === 'low') {
      skippedReview += 1
      continue
    }

    try {
      const { value } = await fetchEndpointPayloadWithCache(endpoint, {
        sessionScope: params.sessionScope,
      })
      const draft = await buildAutoWidgetDraftFromPayload({
        endpointId: endpoint.id,
        endpointName: endpoint.name ?? endpoint.url,
        endpointUrl: endpoint.url,
        payload: value.payload,
        preferredMapping,
      })
      if (!draft) {
        skippedNoData += 1
        continue
      }
      draftCollection.push(draft)
    } catch {
      skippedFetch += 1
    }
  }

  return {
    drafts: applyAutoLayout(draftCollection, getNextWidgetStartY(params.widgets)),
    skippedExisting,
    skippedNoData,
    skippedFetch,
    skippedReview,
    eligibleCount: eligibleEndpoints.length,
  }
}
