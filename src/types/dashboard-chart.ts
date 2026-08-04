import type { ChartTemplateId } from '@/types/chart-template'

export type DashboardChartStatus = 'draft' | 'published' | 'archived'

export type DashboardChartValidationState = 'unknown' | 'valid' | 'warning' | 'invalid'

export type DashboardChartSize = 'compact' | 'standard' | 'wide' | 'full'
export type DashboardChartFontWeight = 'normal' | 'medium' | 'bold'
export type DashboardChartLegendPosition = 'top' | 'right' | 'bottom' | 'left'
export type DashboardChartLabelPosition = 'auto' | 'top' | 'right' | 'inside' | 'outside'
export type DashboardChartDensity = 'compact' | 'comfortable' | 'spacious'
export type DashboardChartTextOverflow = 'none' | 'truncate' | 'wrap'
export type DashboardChartDateFormat = 'auto' | 'date-only' | 'month-short' | 'month-year' | 'year'
export type DashboardChartLocale = 'en-US' | 'en-GB' | 'en-IN'
export type DashboardChartTimeZone = 'preserve' | 'UTC'
export type DashboardChartNumberFormatStyle = 'decimal' | 'percent' | 'currency' | 'compact'
export type DashboardChartCurrency = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY'

export interface DashboardChartNumberFormat {
  style: DashboardChartNumberFormatStyle
  currency?: DashboardChartCurrency
  percentScale?: 'fraction' | 'whole'
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  useGrouping?: boolean
}

export interface DashboardChartLabelOverride {
  targetId: string
  label: string
}

export type DashboardChartAxisPresentation = {
  show?: boolean
  title?: string | null
  labelColor?: string | null
  labelFontSize?: number
  labelFontWeight?: DashboardChartFontWeight
  labelRotation?: number
  labelFormat?: DashboardChartDateFormat
  labelLocale?: DashboardChartLocale
  labelTimeZone?: DashboardChartTimeZone
  numberFormat?: DashboardChartNumberFormat
  labelOverflow?: DashboardChartTextOverflow
  labelMaxLength?: number
}

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
  density?: DashboardChartDensity
  xAxis?: DashboardChartAxisPresentation
  yAxis?: Omit<DashboardChartAxisPresentation, 'labelRotation'>
  legend?: {
    labelFontSize?: number
    labelFontWeight?: DashboardChartFontWeight
    labelOverflow?: DashboardChartTextOverflow
    labelMaxLength?: number
    labelOverrides?: DashboardChartLabelOverride[]
  }
  labels?: {
    color?: string | null
    fontSize?: number
    fontWeight?: DashboardChartFontWeight
    position?: DashboardChartLabelPosition
    numberFormat?: DashboardChartNumberFormat
    collision?: 'allow' | 'hide-overlap'
  }
  tooltip?: {
    enabled?: boolean
    backgroundColor?: string | null
    borderColor?: string | null
    textColor?: string | null
    labelOverflow?: DashboardChartTextOverflow
    labelMaxLength?: number
    labelOverrides?: DashboardChartLabelOverride[]
    numberFormat?: DashboardChartNumberFormat
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
