// Module: Widget
// src/types/widget.ts
export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'table' | 'stat-card'

export interface YAxisConfig {
  key: string
  color: string
  label?: string
}

export interface DataMapping {
  xAxis: string
  yAxis?: string        // Legacy single-metric
  yAxes?: YAxisConfig[] // Multi-metric support
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  limit?: number
}

export interface WidgetPosition {
  x: number
  y: number
  w: number
  h: number
}

export interface Widget {
  id: string
  dashboardId: string
  title: string
  type: ChartType
  endpointId: string
  dataMapping: DataMapping
  position?: WidgetPosition
  createdAt?: string
  updatedAt?: string
  created_at?: string   // legacy snake_case kept for compat
  updated_at?: string
}

// ✅ FIX: supports BOTH flat xAxis/yAxis (widget-config-dialog)
//         AND full dataMapping (magic-paste-modal)
export interface WidgetConfigInput {
  title: string
  type: ChartType
  endpointId: string
  dashboardId?: string
  // Flat fields — used by widget-config-dialog
  xAxis?: string
  yAxis?: string
  // Full mapping — used by magic-paste-modal, overrides flat fields if present
  dataMapping?: DataMapping
}
