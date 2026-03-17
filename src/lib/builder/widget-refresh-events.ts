export const DASHBOARD_WIDGET_REFRESH_EVENT = 'dashboardWidgetRefresh'

export interface DashboardWidgetRefreshDetail {
  scope: 'all' | 'endpoint'
  endpointId?: string
  force?: boolean
}

export function dispatchDashboardWidgetRefresh(detail: DashboardWidgetRefreshDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<DashboardWidgetRefreshDetail>(DASHBOARD_WIDGET_REFRESH_EVENT, { detail }),
  )
}

