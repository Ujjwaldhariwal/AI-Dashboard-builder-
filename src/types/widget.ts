// src/types/widget.ts
export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'table'

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
  position?: number      // ✅ optional
  createdAt?: string     // ✅ optional
  updatedAt?: string     // ✅ optional
}

export interface WidgetConfigInput {
  title: string
  type: ChartType
  endpointId: string
  dataMapping: {
    xAxis: string
    yAxis: string
  }
  dashboardId?: string
}
