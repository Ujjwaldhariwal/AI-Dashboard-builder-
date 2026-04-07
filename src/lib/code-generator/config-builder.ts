// src/lib/code-generator/config-builder.ts
import type {
  Widget,
  ChartType,
  TransformOp,
  TransformSortOrder,
  YAxisConfig,
} from '@/types/widget'
import type { ProjectConfig, ChartGroup } from '@/types/project-config'
import { BOSCH_COLORS } from '@/lib/echarts/theme'

interface DashboardShape {
  id:           string
  name:         string
  description?: string
}

interface EndpointShape {
  id:       string
  name:     string
  url:      string
  method:   string
  authType?: string
  headers?: Record<string, string>
  body?: unknown
}

export interface ExportWidget {
  id:           string
  title:        string
  type:         ChartType
  endpointId:   string
  dataMapping: {
    xAxis: string
    yAxis?: string
    yAxes?: YAxisConfig[]
    aliases?: Record<string, string>
    transforms?: TransformOp[]
    sortBy?: string
    sortOrder?: TransformSortOrder
    limit?: number
  }
  groupId?:     string
  sectionName?: string
  colors:       string[]
  barRadius:    number
  showLegend:   boolean
  showGrid:     boolean
}

export interface ExportEndpoint {
  id:       string
  name:     string
  url:      string
  method:   string
  authType?: string
  headers?: Record<string, string>
  body?: string
}

export interface ExportGroup {
  id:        string
  name:      string
  order:     number
  widgetIds: string[]
}

export interface DashboardExportConfig {
  meta: {
    id:           string
    name:         string
    description?: string
    exportedAt:   string
  }
  projectConfig: ProjectConfig
  endpoints:     ExportEndpoint[]
  widgets:       ExportWidget[]
  groups:        ExportGroup[]
}

export function buildDashboardConfig(
  dashboard:     DashboardShape,
  endpoints:     EndpointShape[],
  widgets:       Widget[],
  projectConfig: ProjectConfig,
  chartGroups:   ChartGroup[] = [],
): DashboardExportConfig {
  const dashboardWidgets = widgets.filter(w => w.dashboardId === dashboard.id)
  const dashboardGroups  = chartGroups.filter(g => g.dashboardId === dashboard.id)
  const endpointMap      = new Map(endpoints.map(e => [e.id, e]))
  const usedEndpointIds  = new Set(dashboardWidgets.map(w => w.endpointId))
  const exportPalette = projectConfig.chartTheme === 'bosch-uppcl'
    ? BOSCH_COLORS
    : null

  const resolvedBaseUrl = resolveBaseUrl(projectConfig)

  return {
    meta: {
      id:          dashboard.id,
      name:        dashboard.name,
      description: dashboard.description,
      exportedAt:  new Date().toISOString(),
    },
    projectConfig: {
      ...projectConfig,
      baseUrl: resolvedBaseUrl,
      dashboardId:  dashboard.id,
      projectTitle: projectConfig.projectTitle || dashboard.name,
    },
    endpoints: Array.from(usedEndpointIds)
      .map(id => endpointMap.get(id))
      .filter((e): e is EndpointShape => Boolean(e))
      .map(e => ({
        id:       e.id,
        name:     e.name,
        url:      e.url,
        method:   e.method,
        authType: e.authType,
        headers:  e.headers,
        body:     stringifyEndpointBody(e.body),
      })),
    widgets: dashboardWidgets.map(w => ({
      id:          w.id,
      title:       w.title,
      type:        w.type,
      endpointId:  w.endpointId,
      dataMapping: {
        xAxis:      w.dataMapping.xAxis,
        yAxis:      w.dataMapping.yAxis,
        yAxes:      w.dataMapping.yAxes,
        aliases:    w.dataMapping.aliases,
        transforms: w.dataMapping.transforms,
        sortBy:     w.dataMapping.sortBy,
        sortOrder:  w.dataMapping.sortOrder,
        limit:      w.dataMapping.limit,
      },
      groupId:     w.groupId,
      sectionName: w.sectionName,
      colors:      exportPalette ? [...exportPalette] : w.style.colors,
      barRadius:   w.style.barRadius  ?? 5,
      showLegend:  w.style.showLegend ?? true,
      showGrid:    w.style.showGrid   ?? true,
    })),
    groups: dashboardGroups
      .sort((a, b) => a.order - b.order)
      .map(g => ({
        id:        g.id,
        name:      g.name,
        order:     g.order,
        widgetIds: g.widgetIds,
      })),
  }
}

export function slugifyDashboardName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  if (!slug) return 'dashboard'
  return slug.endsWith('-dashboard')
    ? (slug.replace(/-dashboard$/, '') || 'dashboard')
    : slug
}

function resolveBaseUrl(projectConfig: ProjectConfig): string {
  const baseUrl = projectConfig.baseUrl.trim()
  if (baseUrl.length > 0) {
    return baseUrl.replace(/\/+$/, '')
  }

  const loginEndpoint = projectConfig.login.endpoint.trim()
  if (!/^https?:\/\//i.test(loginEndpoint)) {
    return ''
  }

  try {
    return new URL(loginEndpoint).origin
  } catch {
    return ''
  }
}

function stringifyEndpointBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return body
  try {
    return JSON.stringify(body)
  } catch {
    return String(body)
  }
}
