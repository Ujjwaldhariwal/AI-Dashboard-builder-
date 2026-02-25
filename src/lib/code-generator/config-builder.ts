import type { Widget, ChartType } from '@/types/widget'

interface DashboardShape {
  id: string
  name: string
  description?: string
}

interface EndpointShape {
  id: string
  name: string
  url: string
  method: string
}

export interface DashboardExportConfig {
  meta: {
    id: string
    name: string
    description?: string
    exportedAt: string
  }
  endpoints: {
    id: string
    name: string
    url: string
    method: string
  }[]
  widgets: {
    id: string
    title: string
    type: ChartType
    endpointId: string
    xAxis: string
    yAxis: string
  }[]
}

export function buildDashboardConfig(
  dashboard: DashboardShape,
  endpoints: EndpointShape[],
  widgets: Widget[]
): DashboardExportConfig {
  const dashboardWidgets = widgets.filter((w) => w.dashboardId === dashboard.id)
  const endpointMap = new Map(endpoints.map((e) => [e.id, e]))
  const usedEndpointIds = new Set(dashboardWidgets.map((w) => w.endpointId))

  return {
    meta: {
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      exportedAt: new Date().toISOString(),
    },
    endpoints: Array.from(usedEndpointIds)
      .map((id) => endpointMap.get(id))
      .filter((e): e is EndpointShape => Boolean(e))
      .map((e) => ({
        id: e.id,
        name: e.name,
        url: e.url,
        method: e.method,
      })),
    widgets: dashboardWidgets.map((w) => ({
      id: w.id,
      title: w.title,
      type: w.type,
      endpointId: w.endpointId,
      xAxis: w.dataMapping.xAxis,
      yAxis: w.dataMapping.yAxis,
    })),
  }
}

export function slugifyDashboardName(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dashboard'
  )
}
