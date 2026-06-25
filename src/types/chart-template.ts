import type { BusinessFieldRole, BusinessMetricAggregation } from '@/types/semantic-model'

export type ChartTemplateId =
  | 'bar'
  | 'horizontal-bar'
  | 'grouped-bar'
  | 'horizontal-stacked-bar'
  | 'line'
  | 'trend-composed'
  | 'pie'
  | 'gauge'
  | 'ring-gauge'
  | 'kpi-card'
  | 'kpi-grid'
  | 'drilldown-bar'
  | 'table-grid'

export type DatasetShapeKind =
  | 'empty'
  | 'name_value'
  | 'single_metric'
  | 'one_dimension_many_metrics'
  | 'time_series'
  | 'time_series_many_metrics'
  | 'two_dimensions_one_metric'
  | 'event_list'
  | 'wide_table'

export type FieldValueKind = 'string' | 'number' | 'date' | 'boolean' | 'unknown'

export interface DatasetShapeField {
  id: string
  label: string
  role: BusinessFieldRole
  valueKind: FieldValueKind
  semanticKey?: string
  displayFormat?: string | null
}

export interface DatasetShapeMetric {
  id: string
  label: string
  aggregation: BusinessMetricAggregation
  semanticKey?: string
  displayFormat?: string | null
  unit?: string | null
}

export interface DatasetShape {
  kind: DatasetShapeKind
  fields: DatasetShapeField[]
  metrics: DatasetShapeMetric[]
  dimensions: DatasetShapeField[]
  dateFields: DatasetShapeField[]
  tooltipFields: DatasetShapeField[]
  metricCount: number
  dimensionCount: number
  hasDateAxis: boolean
  hasMultipleMetrics: boolean
  warnings: string[]
}

export interface ChartTemplateRequirement {
  minDimensions: number
  maxDimensions: number
  minMetrics: number
  maxMetrics: number
  requiresDateAxis?: boolean
  allowedShapeKinds?: DatasetShapeKind[]
  blockedShapeKinds?: DatasetShapeKind[]
}

export interface ChartTemplateDefinition {
  id: ChartTemplateId
  name: string
  family: 'comparison' | 'composition' | 'trend' | 'summary' | 'table' | 'drilldown'
  description: string
  requirement: ChartTemplateRequirement
  supports: {
    grouping: boolean
    stacking: boolean
    drilldown: boolean
    customTooltip: boolean
    customLabels: boolean
    multipleMetrics: boolean
  }
  defaultSize: 'compact' | 'standard' | 'wide' | 'full'
  priority: number
}

export interface ChartCompatibilityResult {
  template: ChartTemplateDefinition
  status: 'recommended' | 'allowed' | 'blocked'
  score: number
  reasons: string[]
}
