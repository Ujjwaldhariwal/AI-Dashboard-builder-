// Module: Widget Types — 3-layer schema (deps | base | style)
// src/types/widget.ts

export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'horizontal-bar'
  | 'gauge'
  | 'status-card'
  | 'table'

export type ChartDeps = 'echarts' // frozen — never changes

// ─── Layer 3: AI edits ONLY this ─────────────────────────────
export interface WidgetStyle {
  colors: string[]
  tooltipBg?: string
  tooltipBorder?: string
  labelFormat?: string
  customCSS?: string
  barRadius?: number
  showLegend?: boolean
  showGrid?: boolean
}

export const DEFAULT_STYLE: WidgetStyle = {
  colors: ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444'],
  barRadius: 5,
  showLegend: true,
  showGrid: true,
}

// ─── Existing types (unchanged) ──────────────────────────────
export interface YAxisConfig {
  key: string
  color: string
  label?: string
}

export interface DataMapping {
  xAxis: string
  yAxis?: string
  yAxes?: YAxisConfig[]
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

// ─── Core Widget — 3-layer ────────────────────────────────────
export interface Widget {
  id: string
  dashboardId: string
  title: string
  type: ChartType

  // Layer 1 — frozen
  deps: ChartDeps

  // Layer 2 — user configures (base)
  endpointId: string
  dataMapping: DataMapping

  // Layer 3 — AI edits only this
  style: WidgetStyle

  position?: WidgetPosition
  createdAt?: string
  updatedAt?: string
  created_at?: string  // legacy compat
  updated_at?: string  // legacy compat
}

export interface WidgetConfigInput {
  title: string
  type: ChartType
  endpointId: string
  dashboardId?: string
  xAxis?: string
  yAxis?: string
  dataMapping?: DataMapping
  style?: Partial<WidgetStyle> // optional override at creation
}
