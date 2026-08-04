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
import { sortLabels } from '@/lib/charts/domain-order'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'
import {
  chartFontWeight,
  formatChartLabel,
  formatChartText,
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

interface ModernHorizontalStackedBarChartProps {
  data: Record<string, unknown>[]
  xField: string
  yField?: string
  yFields?: string[]
  tooltipFields?: string[]
  yAxisConfig?: YAxisConfig[]
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
}

function getNumericFields(
  data: Record<string, unknown>[],
  xField: string,
  yField?: string,
  yFields?: string[],
): string[] {
  const preset = (yFields ?? []).filter(Boolean)
  if (preset.length) return preset
  if (!data.length) return yField ? [yField] : []

  const keys = Object.keys(data[0]).filter(k => k !== xField)
  const numeric = keys.filter(key =>
    data.some(row => !isNaN(Number(row[key]))),
  )

  if (yField && numeric.includes(yField)) {
    const rest = numeric.filter(k => k !== yField).slice(0, 4)
    return [yField, ...rest]
  }
  return numeric.slice(0, 5)
}

export function ModernHorizontalStackedBarChart({
  data,
  xField,
  yField,
  yFields,
  tooltipFields,
  yAxisConfig,
  style,
  sizePreset = 'medium',
}: ModernHorizontalStackedBarChartProps) {
  useEnterpriseTheme()

  const s = useMemo(() => ({ ...DEFAULT_STYLE, ...style }), [style])
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)
  const margin = getChartMargin(sizePreset, s.chartMargin)
  const density = useMemo(() => getChartDensityLayout(s.density), [s.density])
  const metrics = useMemo(
    () => getNumericFields(data, xField, yField, yFields),
    [data, xField, yField, yFields],
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

    return sortLabels(metrics).map((key, i) => ({
      key,
      label: key,
      color: s.colors[i % s.colors.length],
    }))
  }, [metrics, s.colors, yAxisConfig])

  const rows = useMemo(() => {
    return data.slice(0, 20).map((row, i) => ({
      name: String(row[xField] ?? `#${i + 1}`).slice(0, 28),
      values: seriesMeta.map(meta => Number(row[meta.key]) || 0),
      raw: row,
    }))
  }, [data, seriesMeta, xField])
  const displayLegend = getLegendVisibility(sizePreset, s.showLegend)
  const displayLabels = s.showLabels ?? showValueLabels(sizePreset, rows.length)

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 740,
    animationEasing: 'cubicOut' as const,
    backgroundColor: 'transparent',
    color: seriesMeta.map(meta => meta.color),
    grid: {
      top: margin.top + (displayLegend ? 20 : 0),
      right: margin.right + (displayLabels ? 20 : 8),
      bottom: margin.bottom + (displayLegend && sizePreset !== 'medium' ? 14 : 0),
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
      type: 'value',
      name: s.xAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 34,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: s.xAxisLabelColor ?? axis.label,
        fontSize: s.xAxisLabelFontSize ?? 10,
        fontWeight: chartFontWeight(s.xAxisLabelFontWeight),
        margin: density.axisLabelMargin,
        formatter: (v: number) => fmtValue(v, s.labelFormat, s.xAxisNumberFormat),
      },
      splitLine: {
        show: s.showGrid,
        lineStyle: { type: 'dashed' as const, color: axis.splitLine },
      },
    },
    yAxis: {
      show: s.showYAxis !== false,
      type: 'category',
      name: s.yAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 54,
      data: rows.map(r => r.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: s.yAxisLabelColor ?? axis.label,
        fontSize: s.yAxisLabelFontSize ?? 11,
        fontWeight: chartFontWeight(s.yAxisLabelFontWeight),
        margin: density.axisLabelMargin,
        formatter: (value: string) => formatChartText(
          value,
          s.yAxisLabelOverflow,
          s.yAxisLabelMaxLength,
        ),
      },
    },
    series: seriesMeta.map((meta, idx) => ({
      name: meta.label,
      type: 'bar',
      stack: 'total',
      emphasis: { focus: 'series' as const },
      barMaxWidth: 26,
      barCategoryGap: density.barCategoryGap,
      data: rows.map(r => r.values[idx]),
      label: displayLabels
        ? {
            show: true,
            position: s.labelPosition === 'right' ? 'right' as const : 'insideRight' as const,
            fontSize: s.labelFontSize ?? 9,
            fontWeight: chartFontWeight(s.labelFontWeight),
            color: s.labelColor ?? '#f8fafc',
            hideOverlap: s.labelCollision === 'hide-overlap',
            formatter: (p: { value: number }) => fmtValue(
              Number(p.value),
              s.labelFormat,
              s.valueLabelNumberFormat,
            ),
          }
        : { show: false },
      itemStyle: {
        borderRadius: idx === seriesMeta.length - 1
          ? [0, s.barRadius ?? 8, s.barRadius ?? 8, 0]
          : 0,
        color: new graphic.LinearGradient(1, 0, 0, 0, [
          { offset: 0, color: withAlpha(meta.color, 0.95) },
          { offset: 1, color: withAlpha(meta.color, 0.6) },
        ]),
        borderWidth: 0.8,
        borderColor: withAlpha(axis.border, 0.22),
      },
    })),
  }), [
    axis.border,
    axis.label,
    axis.splitLine,
    displayLabels,
    displayLegend,
    density,
    margin,
    rows,
    s,
    seriesMeta,
    sizePreset,
    tt,
    tooltipFields,
    xField,
  ])

  if (!seriesMeta.length) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-xs text-muted-foreground">
        No numeric fields found for stacked chart
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
