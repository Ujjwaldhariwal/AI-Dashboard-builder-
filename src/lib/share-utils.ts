// src/lib/share-utils.ts

import type {
  TransformFilterOperator,
  TransformMathOperator,
  TransformOp,
  WidgetStyle,
  YAxisConfig,
} from '@/types/widget'

export type ShareEndpointMethod = 'GET' | 'POST'

export interface ShareEndpointConfig {
  id: string
  url: string
  method: ShareEndpointMethod
  headers?: Record<string, string>
  body?: unknown
  transforms?: TransformOp[]
}

export interface ShareWidgetConfig {
  id: string
  title: string
  type: string
  endpointId: string
  xAxis: string
  yAxis: string
  yAxes?: YAxisConfig[]
  aliases?: Record<string, string>
  style?: Partial<WidgetStyle>
}

export interface SharePayload {
  dashboardId: string
  dashboardName: string
  endpoints: ShareEndpointConfig[]
  widgets: ShareWidgetConfig[]
  exportedAt: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeMethod(value: unknown): ShareEndpointMethod {
  return value === 'POST' ? 'POST' : 'GET'
}

function normalizeHeaders(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const entries = Object.entries(record)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, headerValue]) => [key.trim(), String(headerValue)])

  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

const isMathOperator = (value: unknown): value is TransformMathOperator =>
  value === '+' || value === '-' || value === '*' || value === '/'

const isFilterOperator = (value: unknown): value is TransformFilterOperator =>
  value === '>' || value === '<' || value === '=' || value === '!=' || value === '>=' || value === '<='

const isSortOrder = (value: unknown): value is 'asc' | 'desc' =>
  value === 'asc' || value === 'desc'

const isAggregateReducer = (
  value: unknown,
): value is Extract<TransformOp, { type: 'group_aggregate' }>['reducer'] =>
  value === 'sum' || value === 'avg' || value === 'min' || value === 'max' || value === 'count'

const isDateFormat = (
  value: unknown,
): value is Extract<TransformOp, { type: 'date_format' }>['format'] =>
  value === 'iso-date'
  || value === 'iso-datetime'
  || value === 'locale-date'
  || value === 'locale-datetime'
  || value === 'month-day'
  || value === 'month-short'
  || value === 'year-month'

const isStringRecord = (value: unknown): value is Record<string, string> => {
  const record = asRecord(value)
  if (!record) return false
  return Object.values(record).every(item => typeof item === 'string')
}

function isTransformOp(value: unknown): value is TransformOp {
  const record = asRecord(value)
  if (!record || typeof record.type !== 'string') return false

  switch (record.type) {
    case 'parse_number':
      return typeof record.field === 'string'
    case 'concat':
      return Array.isArray(record.fields)
        && record.fields.every(field => typeof field === 'string')
        && typeof record.separator === 'string'
        && typeof record.outputField === 'string'
    case 'rename':
      return typeof record.from === 'string' && typeof record.to === 'string'
    case 'math':
      return typeof record.field === 'string'
        && isMathOperator(record.operator)
        && typeof record.value === 'number'
        && Number.isFinite(record.value)
        && typeof record.outputField === 'string'
    case 'percent_of_total':
      return typeof record.field === 'string' && typeof record.outputField === 'string'
    case 'filter_rows':
      return typeof record.field === 'string' && isFilterOperator(record.operator)
    case 'sort':
      return typeof record.field === 'string' && isSortOrder(record.order)
    case 'limit':
      return typeof record.count === 'number' && Number.isFinite(record.count)
    case 'fields_to_rows':
      return Array.isArray(record.fields)
        && record.fields.every(field => typeof field === 'string')
        && typeof record.keyField === 'string'
        && typeof record.valueField === 'string'
        && (record.keyLabels === undefined || isStringRecord(record.keyLabels))
        && (record.keepOtherFields === undefined || typeof record.keepOtherFields === 'boolean')
    case 'group_aggregate':
      return Array.isArray(record.groupBy)
        && record.groupBy.every(field => typeof field === 'string')
        && typeof record.valueField === 'string'
        && isAggregateReducer(record.reducer)
        && typeof record.outputField === 'string'
    case 'map_values':
      return typeof record.field === 'string'
        && isStringRecord(record.mappings)
        && (record.defaultValue === undefined || typeof record.defaultValue === 'string')
    case 'date_format':
      return typeof record.field === 'string'
        && typeof record.outputField === 'string'
        && isDateFormat(record.format)
    default:
      return false
  }
}

function normalizeTransforms(value: unknown): TransformOp[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed = value.filter(isTransformOp)
  return parsed.length > 0 ? parsed : undefined
}

function normalizeAliases(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const entries = Object.entries(record)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, alias]) => [key.trim(), String(alias).trim()] as const)
    .filter(([, alias]) => alias.length > 0)

  if (!entries.length) return undefined
  return Object.fromEntries(entries)
}

function normalizeYAxisConfigs(value: unknown): YAxisConfig[] | undefined {
  if (!Array.isArray(value)) return undefined

  const parsed = value.flatMap(item => {
    const record = asRecord(item)
    if (!record) return []

    const key = typeof record.key === 'string' ? record.key.trim() : ''
    if (!key) return []

    const color = typeof record.color === 'string' && record.color.trim().length > 0
      ? record.color.trim()
      : '#3b82f6'
    const label = typeof record.label === 'string' && record.label.trim().length > 0
      ? record.label.trim()
      : undefined

    return [{ key, color, label }]
  })

  return parsed.length ? parsed : undefined
}

function normalizeWidgetStyle(value: unknown): Partial<WidgetStyle> | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const normalized: Partial<WidgetStyle> = {}

  if (Array.isArray(record.colors)) {
    const colors = record.colors
      .map(color => String(color).trim())
      .filter(color => color.length > 0)
    if (colors.length) normalized.colors = colors
  }

  if (typeof record.tooltipBg === 'string' && record.tooltipBg.trim().length > 0) {
    normalized.tooltipBg = record.tooltipBg.trim()
  }
  if (typeof record.tooltipBorder === 'string' && record.tooltipBorder.trim().length > 0) {
    normalized.tooltipBorder = record.tooltipBorder.trim()
  }
  if (record.labelFormat === 'currency' || record.labelFormat === 'percent') {
    normalized.labelFormat = record.labelFormat
  }
  if (typeof record.barRadius === 'number' && Number.isFinite(record.barRadius)) {
    normalized.barRadius = record.barRadius
  }
  if (typeof record.showLegend === 'boolean') normalized.showLegend = record.showLegend
  if (typeof record.showGrid === 'boolean') normalized.showGrid = record.showGrid

  return Object.keys(normalized).length ? normalized : undefined
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

function normalizePayload(parsed: unknown): SharePayload | null {
  const record = asRecord(parsed)
  if (!record) return null

  const dashboardId = typeof record.dashboardId === 'string' ? record.dashboardId : ''
  const dashboardName = typeof record.dashboardName === 'string'
    ? record.dashboardName
    : 'Shared Dashboard'
  const exportedAt = typeof record.exportedAt === 'string'
    ? record.exportedAt
    : new Date().toISOString()

  const endpointsById = new Map<string, ShareEndpointConfig>()
  const rawEndpoints = Array.isArray(record.endpoints) ? record.endpoints : []
  rawEndpoints.forEach((endpoint, index) => {
    const endpointRecord = asRecord(endpoint)
    if (!endpointRecord) return

    const endpointId = typeof endpointRecord.id === 'string' && endpointRecord.id.trim().length > 0
      ? endpointRecord.id.trim()
      : `endpoint-${index + 1}`
    const endpointUrl = typeof endpointRecord.url === 'string'
      ? endpointRecord.url.trim()
      : ''
    if (!endpointUrl) return

    endpointsById.set(endpointId, {
      id: endpointId,
      url: endpointUrl,
      method: normalizeMethod(endpointRecord.method),
      headers: normalizeHeaders(endpointRecord.headers),
      body: endpointRecord.body,
      transforms: normalizeTransforms(endpointRecord.transforms),
    })
  })

  const legacyEndpointIdsByKey = new Map<string, string>()
  const widgets: ShareWidgetConfig[] = []
  const rawWidgets = Array.isArray(record.widgets) ? record.widgets : []

  rawWidgets.forEach((widget, index) => {
    const widgetRecord = asRecord(widget)
    if (!widgetRecord) return

    const widgetId = typeof widgetRecord.id === 'string' && widgetRecord.id.trim().length > 0
      ? widgetRecord.id.trim()
      : `widget-${index + 1}`
    const widgetTitle = typeof widgetRecord.title === 'string' && widgetRecord.title.trim().length > 0
      ? widgetRecord.title.trim()
      : `Widget ${index + 1}`
    const widgetType = typeof widgetRecord.type === 'string' && widgetRecord.type.trim().length > 0
      ? widgetRecord.type.trim()
      : 'bar'
    const xAxis = typeof widgetRecord.xAxis === 'string' ? widgetRecord.xAxis : ''
    const yAxis = typeof widgetRecord.yAxis === 'string' ? widgetRecord.yAxis : ''
    const yAxes = normalizeYAxisConfigs(widgetRecord.yAxes)
    const aliases = normalizeAliases(widgetRecord.aliases)
    const style = normalizeWidgetStyle(widgetRecord.style)

    let endpointId = typeof widgetRecord.endpointId === 'string'
      ? widgetRecord.endpointId.trim()
      : ''

    if (!endpointId) {
      const legacyUrl = typeof widgetRecord.endpointUrl === 'string'
        ? widgetRecord.endpointUrl.trim()
        : ''

      if (legacyUrl) {
        const legacyMethod = normalizeMethod(widgetRecord.method)
        const legacyHeaders = normalizeHeaders(widgetRecord.headers)
        const legacyBody = widgetRecord.body

        const endpointKey = [
          legacyMethod,
          legacyUrl,
          safeStringify(legacyHeaders ?? {}),
          safeStringify(legacyBody ?? null),
        ].join('|')

        const existingId = legacyEndpointIdsByKey.get(endpointKey)
        if (existingId) {
          endpointId = existingId
        } else {
          endpointId = `legacy-endpoint-${legacyEndpointIdsByKey.size + 1}`
          legacyEndpointIdsByKey.set(endpointKey, endpointId)
          endpointsById.set(endpointId, {
            id: endpointId,
            url: legacyUrl,
            method: legacyMethod,
            headers: legacyHeaders,
            body: legacyBody,
          })
        }
      }
    }

    widgets.push({
      id: widgetId,
      title: widgetTitle,
      type: widgetType,
      endpointId,
      xAxis,
      yAxis,
      yAxes,
      aliases,
      style,
    })
  })

  return {
    dashboardId,
    dashboardName,
    endpoints: Array.from(endpointsById.values()),
    widgets,
    exportedAt,
  }
}

// Encode dashboard state into a base64 URL token
export function encodeShareToken(payload: SharePayload): string {
  const json = JSON.stringify(payload)
  const encoded = btoa(encodeURIComponent(json))
  // Make URL-safe
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Decode token back to payload — returns null if invalid
export function decodeShareToken(token: string): SharePayload | null {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = decodeURIComponent(atob(padded))
    const parsed = JSON.parse(json) as unknown
    return normalizePayload(parsed)
  } catch {
    return null
  }
}

export function buildShareUrl(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/view/${token}`
}
