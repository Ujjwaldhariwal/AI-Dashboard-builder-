export type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'table'

export interface Widget {
  id: string
  dashboardId: string
  title: string
  type: ChartType
  endpointId: string
  dataMapping: {
    xAxis: string
    yAxis: string
  }
  position: {
    x: number
    y: number
    w: number
    h: number
  }
  refreshInterval?: number
  createdAt: string
  updatedAt: string
}

export interface WidgetConfigInput {
  title: string
  type: ChartType
  endpointId: string
  xAxis: string
  yAxis: string
}
