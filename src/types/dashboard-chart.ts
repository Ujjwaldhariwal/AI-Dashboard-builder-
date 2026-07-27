import type { ChartTemplateId } from '@/types/chart-template'

export type DashboardChartStatus = 'draft' | 'published' | 'archived'

export type DashboardChartValidationState = 'unknown' | 'valid' | 'warning' | 'invalid'

export type DashboardChartSize = 'compact' | 'standard' | 'wide' | 'full'
export type DashboardChartFontWeight = 'normal' | 'medium' | 'bold'
export type DashboardChartLegendPosition = 'top' | 'right' | 'bottom' | 'left'
export type DashboardChartLabelPosition = 'auto' | 'top' | 'right' | 'inside' | 'outside'

export type DashboardChartFilterOperator =
  | 'eq'
  | 'not_eq'
  | 'in'
  | 'contains'
  | 'gte'
  | 'lte'

export interface DashboardChartFilter {
  fieldId: string
  operator: DashboardChartFilterOperator
  value: string | number | boolean | Array<string | number | boolean>
}

export interface DashboardChartEncoding {
  xAxisFieldId?: string
  yMetricIds: string[]
  seriesFieldId?: string
  stackMetricIds?: string[]
  tooltipFieldIds: string[]
  labelById: Record<string, string>
  colorById: Record<string, string>
  sort?: {
    byId: string
    direction: 'asc' | 'desc'
  } | null
  limit?: number | null
  filters?: DashboardChartFilter[]
}

export interface DashboardChartPresentation {
  size: DashboardChartSize
  showLegend: boolean
  showLabels: boolean
  valueFormat?: string | null
  colors?: string[]
  showGrid?: boolean
  legendPosition?: DashboardChartLegendPosition
  xAxis?: {
    show?: boolean
    title?: string | null
    labelColor?: string | null
    labelFontSize?: number
    labelFontWeight?: DashboardChartFontWeight
    labelRotation?: number
  }
  yAxis?: {
    show?: boolean
    title?: string | null
    labelColor?: string | null
    labelFontSize?: number
    labelFontWeight?: DashboardChartFontWeight
  }
  labels?: {
    color?: string | null
    fontSize?: number
    fontWeight?: DashboardChartFontWeight
    position?: DashboardChartLabelPosition
  }
  tooltip?: {
    enabled?: boolean
    backgroundColor?: string | null
    borderColor?: string | null
    textColor?: string | null
  }
  margins?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  line?: {
    smooth?: boolean
    width?: number
  }
  bar?: {
    radius?: number
  }
}

export interface DashboardChartInteractions {
  drilldown?: {
    enabled: boolean
    fieldId?: string
    targetChartId?: string
  } | null
  filterOnClick?: boolean
}

export interface DashboardChartConfig {
  id: string
  tenantId: string
  projectId: string
  datasetId: string
  name: string
  description?: string | null
  status: DashboardChartStatus
  templateId: ChartTemplateId
  encoding: DashboardChartEncoding
  presentation: DashboardChartPresentation
  interactions: DashboardChartInteractions
  layout: {
    order: number
    gridSpan: number
  }
  validationState: DashboardChartValidationState
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export interface DashboardChartValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface DashboardChartValidationResult {
  state: DashboardChartValidationState
  issues: DashboardChartValidationIssue[]
}
