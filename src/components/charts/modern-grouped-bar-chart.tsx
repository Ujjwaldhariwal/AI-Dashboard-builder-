'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import type { WidgetStyle, YAxisConfig } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'
import { escapeTooltipHtml, formatAuxiliaryTooltipRows, formatTooltipHtmlLabel } from '@/lib/echarts/safe-tooltip'
import { withAlpha } from '@/lib/echarts/utils'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'
import {
  chartFontWeight,
  formatCategoryAxisLabel,
  formatChartLabel,
  formatChartText,
  getCategoryTickInterval,
  getChartDensityLayout,
  getChartMargin,
  getLegendLayout,
  getLegendVisibility,
  showValueLabels,
} from '@/lib/charts/chart-constants'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface SeriesMeta {
  key: string
  label: string
  color: string
}

interface TooltipParam {
  name: string
  seriesName: string
  value: number
  dataIndex: number
}

interface ModernGroupedBarChartProps {
  data: Record<string, unknown>[]
  xField: string
  yField?: string
  yFields?: string[]
  tooltipFields?: string[]
  yAxisConfig?: YAxisConfig[]
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
}

function inferMetrics(
  data: Record<string, unknown>[],
  xField: string,
  yField?: string,
  yFields?: string[],
): string[] {
  const explicit = (yFields ?? []).filter(Boolean)
  if (explicit.length) return explicit
  if (!data.length) return yField ? [yField] : []

  const keys = Object.keys(data[0]).filter(k => k !== xField)
  const numeric = keys.filter(key => data.some(r => !isNaN(Number(r[key]))))

  if (yField && numeric.includes(yField)) {
    const rest = numeric.filter(n => n !== yField).slice(0, 3)
    return [yField, ...rest]
  }
  return numeric.slice(0, 4)
}

export function ModernGroupedBarChart({
  data,
  xField,
  yField,
  yFields,
  tooltipFields,
  yAxisConfig,
  style,
  sizePreset = 'medium',
}: ModernGroupedBarChartProps) {
  useEnterpriseTheme()

  const s = useMemo(() => ({ ...DEFAULT_STYLE, ...style }), [style])
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)
  const margin = getChartMargin(sizePreset, s.chartMargin)
  const density = useMemo(() => getChartDensityLayout(s.density), [s.density])
  const metrics = useMemo(() => inferMetrics(data, xField, yField, yFields), [data, xField, yField, yFields])
  const rows = useMemo(
    () =>
      data.slice(0, 20).map((row, i) => ({
        label: String(row[xField] ?? `#${i + 1}`).slice(0, 18),
        raw: row,
      })),
    [data, xField],
  )

  const seriesMeta = useMemo<SeriesMeta[]>(() => {
    const configured = (yAxisConfig ?? [])
      .map((cfg, i) => {
        const key = String(cfg.key ?? '').trim()
        if (!key) return null
        return {
          key,
          label: cfg.label?.trim() || key,
          color: cfg.color || s.colors[i % s.colors.length],
        } satisfies SeriesMeta
      })
      .filter((cfg): cfg is SeriesMeta => Boolean(cfg))

    if (configured.length) return configured

    return metrics.map((key, i) => ({
      key,
      label: key,
      color: s.colors[i % s.colors.length],
    }))
  }, [metrics, s.colors, yAxisConfig])

  const labels = useMemo(() => rows.map(row => row.label), [rows])
  const tickInterval = getCategoryTickInterval(sizePreset, labels.length)
  const displayLegend = getLegendVisibility(sizePreset, s.showLegend)
  const displayLabels = s.showLabels ?? showValueLabels(sizePreset, labels.length)

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 760,
    animationEasing: 'cubicOut' as const,
    color: seriesMeta.map(meta => meta.color),
    backgroundColor: 'transparent',
    grid: {
      top: margin.top + (displayLegend ? 20 : 0),
      right: margin.right,
      bottom: margin.bottom + (labels.length > 8 ? 24 : 12) + (displayLegend && sizePreset !== 'medium' ? 14 : 0),
      left: margin.left,
      containLabel: true,
    },
    tooltip: {
      show: s.tooltipEnabled !== false,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tt,
      formatter: (params: TooltipParam[]) => {
        const header = formatTooltipHtmlLabel(
          params[0]?.name,
          undefined,
          s.tooltipLabelOverflow,
          s.tooltipLabelMaxLength,
        )
        const values = params.map(param => (
          `${formatTooltipHtmlLabel(param.seriesName, s.tooltipLabelOverrides, s.tooltipLabelOverflow, s.tooltipLabelMaxLength)}: <strong>${escapeTooltipHtml(fmtValue(Number(param.value), s.labelFormat, s.tooltipNumberFormat))}</strong>`
        ))
        const auxiliary = formatAuxiliaryTooltipRows({
          row: rows[params[0]?.dataIndex]?.raw,
          fields: tooltipFields,
          style: s,
          excludedFields: [xField, ...seriesMeta.map(meta => meta.key)],
        })
        return `<b>${header}</b><br/>${values.join('<br/>')}${auxiliary ? `<br/>${auxiliary}` : ''}`
      },
    },
    legend: displayLegend
      ? {
          show: true,
          ...getLegendLayout(s.legendPosition, margin),
          icon: 'roundRect',
          itemWidth: 10,
          itemHeight: 6,
          itemGap: density.legendItemGap,
          textStyle: {
            fontSize: s.legendLabelFontSize ?? 10,
            fontWeight: chartFontWeight(s.legendLabelFontWeight),
            color: axis.label,
          },
          formatter: (name: string) => formatChartLabel(
            name,
            s.legendLabelOverrides,
            s.legendLabelOverflow,
            s.legendLabelMaxLength,
          ),
        }
      : { show: false },
    xAxis: {
      show: s.showXAxis !== false,
      type: 'category',
      name: s.xAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 36,
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: s.xAxisLabelColor ?? axis.label,
        fontSize: s.xAxisLabelFontSize ?? 10,
        fontWeight: chartFontWeight(s.xAxisLabelFontWeight),
        rotate: s.xAxisLabelRotation ?? (labels.length > 8 ? -32 : 0),
        interval: tickInterval,
        margin: density.axisLabelMargin,
        formatter: (value: string) => formatChartText(
          formatCategoryAxisLabel(
            value,
            s.xAxisLabelFormat,
            s.xAxisLabelLocale,
            s.xAxisLabelTimeZone,
          ),
          s.xAxisLabelOverflow,
          s.xAxisLabelMaxLength,
        ),
      },
    },
    yAxis: {
      show: s.showYAxis !== false,
      type: 'value',
      name: s.yAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 46,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: s.yAxisLabelColor ?? axis.label,
        fontSize: s.yAxisLabelFontSize ?? 10,
        fontWeight: chartFontWeight(s.yAxisLabelFontWeight),
        formatter: (v: number) => fmtValue(v, s.labelFormat, s.yAxisNumberFormat),
      },
      splitLine: {
        show: s.showGrid,
        lineStyle: { type: 'dashed' as const, color: axis.splitLine },
      },
    },
    series: seriesMeta.map(meta => ({
      name: meta.label,
      type: 'bar',
      barMaxWidth: 28,
      barCategoryGap: density.barCategoryGap,
      data: rows.map(row => Number(row.raw[meta.key]) || 0),
      label: displayLabels
        ? {
            show: true,
            position: s.labelPosition === 'inside'
              ? 'inside' as const
              : s.labelPosition === 'right'
                ? 'right' as const
                : 'top' as const,
            fontSize: s.labelFontSize ?? 9,
            fontWeight: chartFontWeight(s.labelFontWeight),
            color: s.labelColor ?? axis.label,
            hideOverlap: s.labelCollision === 'hide-overlap',
            formatter: (p: { value: number }) => fmtValue(
              Number(p.value),
              s.labelFormat,
              s.valueLabelNumberFormat,
            ),
          }
        : { show: false },
      itemStyle: {
        borderRadius: [s.barRadius ?? 8, s.barRadius ?? 8, 0, 0],
        color: new graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: withAlpha(meta.color, 0.95) },
          { offset: 1, color: withAlpha(meta.color, 0.55) },
        ]),
        shadowBlur: 8,
        shadowColor: withAlpha(meta.color, 0.3),
      },
    })),
  }), [
    axis.label,
    axis.splitLine,
    displayLabels,
    displayLegend,
    density,
    labels,
    margin,
    rows,
    s,
    seriesMeta,
    sizePreset,
    tickInterval,
    tooltipFields,
    tt,
    xField,
  ])

  if (!seriesMeta.length) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-xs text-muted-foreground">
        No numeric fields found for grouped chart
      </div>
    )
  }

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      notMerge={true}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
