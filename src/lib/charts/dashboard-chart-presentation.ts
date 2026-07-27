import { z } from 'zod'

import type { DashboardChartPresentation } from '@/types/dashboard-chart'
import type { WidgetStyle } from '@/types/widget'

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color such as #EC4899.')
const FontWeightSchema = z.enum(['normal', 'medium', 'bold'])
const MarginSchema = z.number().int().min(0).max(120)

const AxisPresentationSchema = z.object({
  show: z.boolean().optional(),
  title: z.string().trim().min(1).max(80).nullable().optional(),
  labelColor: HexColorSchema.nullable().optional(),
  labelFontSize: z.number().int().min(8).max(24).optional(),
  labelFontWeight: FontWeightSchema.optional(),
  labelRotation: z.number().int().min(-90).max(90).optional(),
}).strict()

const YAxisPresentationSchema = AxisPresentationSchema.omit({ labelRotation: true })

export const DashboardChartPresentationPatchSchema = z.object({
  size: z.enum(['compact', 'standard', 'wide', 'full']).optional(),
  showLegend: z.boolean().optional(),
  showLabels: z.boolean().optional(),
  valueFormat: z.enum(['currency', 'percent']).nullable().optional(),
  colors: z.array(HexColorSchema).min(1).max(12).optional(),
  showGrid: z.boolean().optional(),
  legendPosition: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  xAxis: AxisPresentationSchema.optional(),
  yAxis: YAxisPresentationSchema.optional(),
  labels: z.object({
    color: HexColorSchema.nullable().optional(),
    fontSize: z.number().int().min(8).max(24).optional(),
    fontWeight: FontWeightSchema.optional(),
    position: z.enum(['auto', 'top', 'right', 'inside', 'outside']).optional(),
  }).strict().optional(),
  tooltip: z.object({
    enabled: z.boolean().optional(),
    backgroundColor: HexColorSchema.nullable().optional(),
    borderColor: HexColorSchema.nullable().optional(),
    textColor: HexColorSchema.nullable().optional(),
  }).strict().optional(),
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
  patch: z.infer<typeof DashboardChartPresentationPatchSchema> | undefined,
): DashboardChartPresentation {
  if (!patch) return normalizeDashboardChartPresentation(current)
  return normalizeDashboardChartPresentation({
    ...current,
    ...patch,
    xAxis: mergeNested(current.xAxis, patch.xAxis),
    yAxis: mergeNested(current.yAxis, patch.yAxis),
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
): WidgetStyle {
  const normalized = normalizeDashboardChartPresentation(presentation)
  return {
    colors: normalized.colors?.length ? normalized.colors : fallbackColors,
    showLegend: normalized.showLegend,
    showLabels: normalized.showLabels,
    showGrid: normalized.showGrid !== false,
    labelFormat: normalized.valueFormat === 'currency' || normalized.valueFormat === 'percent'
      ? normalized.valueFormat
      : undefined,
    legendPosition: normalized.legendPosition,
    tooltipEnabled: normalized.tooltip?.enabled !== false,
    tooltipBg: normalized.tooltip?.backgroundColor ?? undefined,
    tooltipBorder: normalized.tooltip?.borderColor ?? undefined,
    tooltipTextColor: normalized.tooltip?.textColor ?? undefined,
    labelColor: normalized.labels?.color ?? undefined,
    labelFontSize: normalized.labels?.fontSize,
    labelFontWeight: normalized.labels?.fontWeight,
    labelPosition: normalized.labels?.position,
    showXAxis: normalized.xAxis?.show !== false,
    showYAxis: normalized.yAxis?.show !== false,
    xAxisTitle: normalized.xAxis?.title ?? undefined,
    yAxisTitle: normalized.yAxis?.title ?? undefined,
    xAxisLabelColor: normalized.xAxis?.labelColor ?? undefined,
    yAxisLabelColor: normalized.yAxis?.labelColor ?? undefined,
    xAxisLabelFontSize: normalized.xAxis?.labelFontSize,
    yAxisLabelFontSize: normalized.yAxis?.labelFontSize,
    xAxisLabelFontWeight: normalized.xAxis?.labelFontWeight,
    yAxisLabelFontWeight: normalized.yAxis?.labelFontWeight,
    xAxisLabelRotation: normalized.xAxis?.labelRotation,
    chartMargin: normalized.margins,
    lineSmooth: normalized.line?.smooth,
    lineWidth: normalized.line?.width,
    barRadius: normalized.bar?.radius,
  }
}
