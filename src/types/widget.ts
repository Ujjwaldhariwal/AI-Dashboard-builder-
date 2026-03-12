// src/types/widget.ts

export type ChartType =
  | 'bar' | 'line' | 'area' | 'pie'
  | 'donut' | 'horizontal-bar' | 'horizontal-stacked-bar'
  | 'grouped-bar' | 'drilldown-bar'
  | 'gauge' | 'ring-gauge' | 'status-card' | 'table'

export type ChartDeps = 'echarts'

// ── Fix #1 — narrow labelFormat to valid fmtValue() values ───
export type LabelFormat = 'currency' | 'percent'

export interface WidgetStyle {
  colors:        string[]
  tooltipBg?:    string
  tooltipBorder?: string
  labelFormat?:  LabelFormat   // ← Fix #1: was string
  barRadius?:    number
  showLegend?:   boolean
  showGrid?:     boolean
  // ── Fix #4 — customCSS removed (unused in all chart components)
}

// ── Fix #2 — align with ENTERPRISE_COLORS in theme.ts ────────
export const DEFAULT_STYLE: WidgetStyle = {
  colors:     ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
  barRadius:  5,
  showLegend: true,
  showGrid:   true,
}

export interface YAxisConfig {
  key:    string
  color:  string
  label?: string
}

export interface DataMapping {
  xAxis:      string
  yAxis?:     string
  yAxes?:     YAxisConfig[]
  aliases?:   Record<string, string>
  sortBy?:    string
  sortOrder?: 'asc' | 'desc'
  limit?:     number
}

export interface WidgetPosition {
  x: number; y: number
  w: number; h: number
}

export interface Widget {
  id:          string
  dashboardId: string
  title:       string
  type:        ChartType
  deps:        ChartDeps        // Layer 1 — frozen
  endpointId:  string
  dataMapping: DataMapping      // Layer 2 — user config
  style:       WidgetStyle      // Layer 3 — AI edits only
  groupId?:    string
  sectionName?: string
  position?:   WidgetPosition
  createdAt?:  string
  updatedAt?:  string
  // ── Fix #3 — legacy snake_case fields removed ─────────────
  // Migrate any persisted data via builder-store version bump
}

// ── Fix #5 — added sectionName to match Widget ────────────────
export interface WidgetConfigInput {
  title:        string
  type:         ChartType
  endpointId:   string
  dashboardId?: string
  xAxis?:       string
  yAxis?:       string
  dataMapping?: DataMapping
  style?:       Partial<WidgetStyle>
  groupId?:     string
  sectionName?: string           // ← Fix #5
}
