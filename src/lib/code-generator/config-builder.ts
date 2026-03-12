// src/lib/code-generator/config-builder.ts
import type { Widget, ChartType } from '@/types/widget'
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
}

export interface ExportWidget {
  id:           string
  title:        string
  type:         ChartType
  endpointId:   string
  xAxis:        string
  yAxis:        string
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

  return {
    meta: {
      id:          dashboard.id,
      name:        dashboard.name,
      description: dashboard.description,
      exportedAt:  new Date().toISOString(),
    },
    projectConfig: {
      ...projectConfig,
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
      })),
    widgets: dashboardWidgets.map(w => ({
      id:          w.id,
      title:       w.title,
      type:        w.type,
      endpointId:  w.endpointId,
      xAxis:       w.dataMapping.xAxis,
      yAxis:       w.dataMapping.yAxis ?? '',
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
