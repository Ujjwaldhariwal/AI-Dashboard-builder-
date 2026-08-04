import { z } from 'zod'

import { getChartTemplate } from '@/lib/semantic/chart-template-registry'
import type { ChartTemplateId } from '@/types/chart-template'
import type {
  DashboardChartLabelOverride,
  DashboardChartPresentation,
} from '@/types/dashboard-chart'
import type { WidgetStyle } from '@/types/widget'

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color such as #EC4899.')
const FontWeightSchema = z.enum(['normal', 'medium', 'bold'])
const MarginSchema = z.number().int().min(0).max(120)
const DensitySchema = z.enum(['compact', 'comfortable', 'spacious'])
const TextOverflowSchema = z.enum(['none', 'truncate', 'wrap'])
const DateFormatSchema = z.enum(['auto', 'date-only', 'month-short', 'month-year', 'year'])
const LocaleSchema = z.enum(['en-US', 'en-GB', 'en-IN'])
const TimeZoneSchema = z.enum(['preserve', 'UTC'])
const CurrencySchema = z.enum(['USD', 'EUR', 'GBP', 'INR', 'JPY'])

export const DashboardChartNumberFormatSchema = z.object({
  style: z.enum(['decimal', 'percent', 'currency', 'compact']),
  currency: CurrencySchema.optional(),
  percentScale: z.enum(['fraction', 'whole']).optional(),
  minimumFractionDigits: z.number().int().min(0).max(4).optional(),
  maximumFractionDigits: z.number().int().min(0).max(4).optional(),
  useGrouping: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (value.style === 'currency' && !value.currency) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currency'],
      message: 'Currency formatting requires an allowed currency code.',
    })
  }
  if (value.style !== 'currency' && value.currency !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currency'],
      message: 'currency is allowed only when style is currency.',
    })
  }
  if (value.style === 'percent' && !value.percentScale) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['percentScale'],
      message: 'Percent formatting requires fraction or whole scaling.',
    })
  }
  if (value.style !== 'percent' && value.percentScale !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['percentScale'],
      message: 'percentScale is allowed only when style is percent.',
    })
  }
  if (
    value.minimumFractionDigits !== undefined
    && value.maximumFractionDigits !== undefined
    && value.minimumFractionDigits > value.maximumFractionDigits
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maximumFractionDigits'],
      message: 'maximumFractionDigits must be at least minimumFractionDigits.',
    })
  }
})

const LabelOverrideSchema = z.object({
  targetId: z.string().uuid(),
  label: z.string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[^\u0000-\u001F\u007F]+$/, 'Labels cannot contain control characters.'),
}).strict()

const LabelOverridesSchema = z.array(LabelOverrideSchema).max(12).superRefine((overrides, context) => {
  const seen = new Set<string>()
  overrides.forEach((override, index) => {
    if (seen.has(override.targetId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'targetId'],
        message: 'Each target can have only one label override.',
      })
    }
    seen.add(override.targetId)
  })
})

function validateOverflow(
  value: { labelOverflow?: 'none' | 'truncate' | 'wrap'; labelMaxLength?: number },
  context: z.RefinementCtx,
) {
  if (value.labelOverflow && value.labelOverflow !== 'none' && value.labelMaxLength === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['labelMaxLength'],
      message: 'truncate and wrap require labelMaxLength.',
    })
  }
  if (value.labelOverflow === 'none' && value.labelMaxLength !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['labelMaxLength'],
      message: 'labelMaxLength is not used when overflow is none.',
    })
  }
}

const AxisPresentationShape = {
  show: z.boolean().optional(),
  title: z.string().trim().min(1).max(80).nullable().optional(),
  labelColor: HexColorSchema.nullable().optional(),
  labelFontSize: z.number().int().min(8).max(24).optional(),
  labelFontWeight: FontWeightSchema.optional(),
  labelRotation: z.number().int().min(-90).max(90).optional(),
  labelFormat: DateFormatSchema.optional(),
  labelLocale: LocaleSchema.optional(),
  labelTimeZone: TimeZoneSchema.optional(),
  numberFormat: DashboardChartNumberFormatSchema.optional(),
  labelOverflow: TextOverflowSchema.optional(),
  labelMaxLength: z.number().int().min(8).max(40).optional(),
}

function validateAxisPresentation(
  value: z.infer<z.ZodObject<typeof AxisPresentationShape>>,
  context: z.RefinementCtx,
) {
  validateOverflow(value, context)
  if (value.labelFormat && value.numberFormat) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['numberFormat'],
      message: 'An axis cannot use date and number formatting simultaneously.',
    })
  }
  if ((value.labelLocale || value.labelTimeZone) && (!value.labelFormat || value.labelFormat === 'auto')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['labelFormat'],
      message: 'Locale and timezone require an explicit date format.',
    })
  }
}

const AxisPresentationSchema = z.object(AxisPresentationShape).strict().superRefine(validateAxisPresentation)
const YAxisPresentationSchema = z.object({
  ...AxisPresentationShape,
  labelRotation: z.never().optional(),
}).strict().superRefine(validateAxisPresentation)

const LegendPresentationSchema = z.object({
  labelFontSize: z.number().int().min(8).max(24).optional(),
  labelFontWeight: FontWeightSchema.optional(),
  labelOverflow: TextOverflowSchema.optional(),
  labelMaxLength: z.number().int().min(8).max(40).optional(),
  labelOverrides: LabelOverridesSchema.optional(),
}).strict().superRefine(validateOverflow)

const TooltipPresentationSchema = z.object({
  enabled: z.boolean().optional(),
  backgroundColor: HexColorSchema.nullable().optional(),
  borderColor: HexColorSchema.nullable().optional(),
  textColor: HexColorSchema.nullable().optional(),
  labelOverflow: TextOverflowSchema.optional(),
  labelMaxLength: z.number().int().min(8).max(80).optional(),
  labelOverrides: LabelOverridesSchema.optional(),
  numberFormat: DashboardChartNumberFormatSchema.optional(),
}).strict().superRefine(validateOverflow)

export const DashboardChartPresentationPatchSchema = z.object({
  size: z.enum(['compact', 'standard', 'wide', 'full']).optional(),
  showLegend: z.boolean().optional(),
  showLabels: z.boolean().optional(),
  valueFormat: z.enum(['currency', 'percent']).nullable().optional(),
  colors: z.array(HexColorSchema).min(1).max(12).optional(),
  showGrid: z.boolean().optional(),
  legendPosition: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  density: DensitySchema.optional(),
  xAxis: AxisPresentationSchema.optional(),
  yAxis: YAxisPresentationSchema.optional(),
  legend: LegendPresentationSchema.optional(),
  labels: z.object({
    color: HexColorSchema.nullable().optional(),
    fontSize: z.number().int().min(8).max(24).optional(),
    fontWeight: FontWeightSchema.optional(),
    position: z.enum(['auto', 'top', 'right', 'inside', 'outside']).optional(),
    numberFormat: DashboardChartNumberFormatSchema.optional(),
    collision: z.enum(['allow', 'hide-overlap']).optional(),
  }).strict().optional(),
  tooltip: TooltipPresentationSchema.optional(),
  margins: z.object({
    top: MarginSchema.optional(),
    right: MarginSchema.optional(),
    bottom: MarginSchema.optional(),
    left: MarginSchema.optional(),
  }).strict().optional(),
  line: z.object({
    smooth: z.boolean().optional(),
    width: z.number().min(1).max(8).optional(),
  }).strict().optional(),
  bar: z.object({
    radius: z.number().int().min(0).max(32).optional(),
  }).strict().optional(),
}).strict()

export type DashboardChartPresentationPatch = z.infer<typeof DashboardChartPresentationPatchSchema>

export const DashboardChartPresentationSchema = DashboardChartPresentationPatchSchema.extend({
  size: z.enum(['compact', 'standard', 'wide', 'full']).default('standard'),
  showLegend: z.boolean().default(true),
  showLabels: z.boolean().default(false),
  valueFormat: z.string().max(80).nullable().default(null),
}).strip()

export const DEFAULT_DASHBOARD_CHART_PRESENTATION: DashboardChartPresentation = {
  size: 'standard',
  showLegend: true,
  showLabels: false,
  valueFormat: null,
  showGrid: true,
}

function mergeNested<T extends object>(current: T | undefined, patch: Partial<T> | undefined): T | undefined {
  if (!current && !patch) return undefined
  return { ...(current ?? {}), ...(patch ?? {}) } as T
}

export function normalizeDashboardChartPresentation(value: unknown): DashboardChartPresentation {
  const parsed = DashboardChartPresentationSchema.safeParse(value)
  if (!parsed.success) return { ...DEFAULT_DASHBOARD_CHART_PRESENTATION }
  return {
    ...DEFAULT_DASHBOARD_CHART_PRESENTATION,
    ...parsed.data,
  }
}

export function mergeDashboardChartPresentation(
  current: DashboardChartPresentation,
  patch: DashboardChartPresentationPatch | undefined,
): DashboardChartPresentation {
  if (!patch) return normalizeDashboardChartPresentation(current)
  return normalizeDashboardChartPresentation({
    ...current,
    ...patch,
    xAxis: mergeNested(current.xAxis, patch.xAxis),
    yAxis: mergeNested(current.yAxis, patch.yAxis),
    legend: mergeNested(current.legend, patch.legend),
    labels: mergeNested(current.labels, patch.labels),
    tooltip: mergeNested(current.tooltip, patch.tooltip),
    margins: mergeNested(current.margins, patch.margins),
    line: mergeNested(current.line, patch.line),
    bar: mergeNested(current.bar, patch.bar),
  })
}

export function dashboardChartPresentationToWidgetStyle(
  presentation: DashboardChartPresentation,
  fallbackColors: string[],
  options: {
    templateId?: ChartTemplateId
    labelById?: Record<string, string>
  } = {},
): WidgetStyle {
  const normalized = normalizeDashboardChartPresentation(presentation)
  const capabilities = options.templateId
    ? getChartTemplate(options.templateId)?.supports.presentation
    : null
  const supportsAxis = (
    capability: 'fontWeight' | 'dateFormat' | 'numberFormat' | 'rotation' | 'overflow',
    axis: 'x' | 'y',
  ) => !capabilities || capabilities.axes[capability].includes(axis)
  const resolveOverrides = (
    overrides: DashboardChartLabelOverride[] | undefined,
  ) => Object.fromEntries((overrides ?? []).flatMap(override => {
    const runtimeLabel = options.labelById?.[override.targetId]
    return runtimeLabel ? [[runtimeLabel, override.label]] : []
  }))
  const legendOverrides = capabilities?.legend.labelOverrides === false
    ? {}
    : resolveOverrides(normalized.legend?.labelOverrides)
  const tooltipOverrides = capabilities?.tooltip.labelOverrides === false
    ? {}
    : resolveOverrides(normalized.tooltip?.labelOverrides)

  return {
    colors: normalized.colors?.length ? normalized.colors : fallbackColors,
    showLegend: capabilities?.legend.visibility === false ? false : normalized.showLegend,
    showLabels: capabilities?.valueLabels.visibility === false ? false : normalized.showLabels,
    showGrid: capabilities?.grid === false ? undefined : normalized.showGrid !== false,
    density: capabilities?.density === false ? undefined : normalized.density,
    labelFormat: normalized.valueFormat === 'currency' || normalized.valueFormat === 'percent'
      ? normalized.valueFormat
      : undefined,
    legendPosition: capabilities?.legend.visibility === false ? undefined : normalized.legendPosition,
    legendLabelFontSize: capabilities?.legend.visibility === false ? undefined : normalized.legend?.labelFontSize,
    legendLabelFontWeight: capabilities?.legend.visibility === false ? undefined : normalized.legend?.labelFontWeight,
    legendLabelOverflow: capabilities?.legend.overflow === false
      ? undefined
      : normalized.legend?.labelOverflow,
    legendLabelMaxLength: capabilities?.legend.overflow === false
      ? undefined
      : normalized.legend?.labelMaxLength,
    legendLabelOverrides: Object.keys(legendOverrides).length ? legendOverrides : undefined,
    tooltipEnabled: capabilities?.tooltip.visibility === false
      ? false
      : normalized.tooltip?.enabled !== false,
    tooltipBg: capabilities?.tooltip.visibility === false
      ? undefined
      : normalized.tooltip?.backgroundColor ?? undefined,
    tooltipBorder: capabilities?.tooltip.visibility === false
      ? undefined
      : normalized.tooltip?.borderColor ?? undefined,
    tooltipTextColor: capabilities?.tooltip.visibility === false
      ? undefined
      : normalized.tooltip?.textColor ?? undefined,
    tooltipLabelOverflow: capabilities?.tooltip.overflow === false
      ? undefined
      : normalized.tooltip?.labelOverflow,
    tooltipLabelMaxLength: capabilities?.tooltip.overflow === false
      ? undefined
      : normalized.tooltip?.labelMaxLength,
    tooltipLabelOverrides: Object.keys(tooltipOverrides).length ? tooltipOverrides : undefined,
    tooltipNumberFormat: capabilities?.tooltip.numberFormat === false
      ? undefined
      : normalized.tooltip?.numberFormat,
    labelColor: capabilities?.valueLabels.visibility === false ? undefined : normalized.labels?.color ?? undefined,
    labelFontSize: capabilities?.valueLabels.visibility === false ? undefined : normalized.labels?.fontSize,
    labelFontWeight: capabilities?.valueLabels.visibility === false ? undefined : normalized.labels?.fontWeight,
    labelPosition: capabilities?.valueLabels.visibility === false ? undefined : normalized.labels?.position,
    valueLabelNumberFormat: capabilities?.valueLabels.numberFormat === false
      ? undefined
      : normalized.labels?.numberFormat,
    labelCollision: capabilities?.valueLabels.collision === false
      ? undefined
      : normalized.labels?.collision,
    showXAxis: capabilities?.axes.x === false ? undefined : normalized.xAxis?.show !== false,
    showYAxis: capabilities?.axes.y === false ? undefined : normalized.yAxis?.show !== false,
    xAxisTitle: capabilities?.axes.x === false ? undefined : normalized.xAxis?.title ?? undefined,
    yAxisTitle: capabilities?.axes.y === false ? undefined : normalized.yAxis?.title ?? undefined,
    xAxisLabelColor: capabilities?.axes.x === false ? undefined : normalized.xAxis?.labelColor ?? undefined,
    yAxisLabelColor: capabilities?.axes.y === false ? undefined : normalized.yAxis?.labelColor ?? undefined,
    xAxisLabelFontSize: capabilities?.axes.x === false ? undefined : normalized.xAxis?.labelFontSize,
    yAxisLabelFontSize: capabilities?.axes.y === false ? undefined : normalized.yAxis?.labelFontSize,
    xAxisLabelFontWeight: supportsAxis('fontWeight', 'x') ? normalized.xAxis?.labelFontWeight : undefined,
    yAxisLabelFontWeight: supportsAxis('fontWeight', 'y') ? normalized.yAxis?.labelFontWeight : undefined,
    xAxisLabelRotation: supportsAxis('rotation', 'x') ? normalized.xAxis?.labelRotation : undefined,
    xAxisLabelFormat: supportsAxis('dateFormat', 'x') ? normalized.xAxis?.labelFormat : undefined,
    xAxisLabelLocale: supportsAxis('dateFormat', 'x') ? normalized.xAxis?.labelLocale : undefined,
    xAxisLabelTimeZone: supportsAxis('dateFormat', 'x') ? normalized.xAxis?.labelTimeZone : undefined,
    xAxisNumberFormat: supportsAxis('numberFormat', 'x') ? normalized.xAxis?.numberFormat : undefined,
    yAxisNumberFormat: supportsAxis('numberFormat', 'y') ? normalized.yAxis?.numberFormat : undefined,
    xAxisLabelOverflow: supportsAxis('overflow', 'x') ? normalized.xAxis?.labelOverflow : undefined,
    xAxisLabelMaxLength: supportsAxis('overflow', 'x') ? normalized.xAxis?.labelMaxLength : undefined,
    yAxisLabelOverflow: supportsAxis('overflow', 'y') ? normalized.yAxis?.labelOverflow : undefined,
    yAxisLabelMaxLength: supportsAxis('overflow', 'y') ? normalized.yAxis?.labelMaxLength : undefined,
    chartMargin: normalized.margins,
    lineSmooth: normalized.line?.smooth,
    lineWidth: normalized.line?.width,
    barRadius: normalized.bar?.radius,
  }
}
