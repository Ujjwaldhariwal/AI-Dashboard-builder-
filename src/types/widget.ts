// src/types/widget.ts
export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'table' | 'stat-card'

export interface YAxisConfig {
  key: string
  color: string
  label?: string
}

export interface DataMapping {
  xAxis: string
  yAxis?: string // Legacy support for old widgets
  yAxes?: YAxisConfig[] // New multi-metric support
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  limit?: number
}

export interface Widget {
  id: string
  dashboardId: string
  title: string
  type: ChartType
  endpointId: string
  dataMapping: DataMapping
  position?: number
  created_at?: string
  updated_at?: string
}

export interface WidgetConfigInput {
  title: string
  type: ChartType
  endpointId: string
  dataMapping: DataMapping
  dashboardId?: string
}
