'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'
import { escapeTooltipHtml, formatAuxiliaryTooltipRows, formatTooltipHtmlLabel } from '@/lib/echarts/safe-tooltip'
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
} from '@/lib/charts/chart-constants'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface TooltipParam {
  name:       string
  seriesName: string
  value:      number
  dataIndex:  number
}

interface ModernLineChartProps {
  data:   Record<string, unknown>[]
  xField: string
  yField: string
  tooltipFields?: string[]
  title?: string
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
}

export function ModernLineChart({ data, xField, yField, tooltipFields, style, sizePreset = 'medium' }: ModernLineChartProps) {
  useEnterpriseTheme() // ← Fix #1

  const s      = useMemo(() => ({ ...DEFAULT_STYLE, ...style }), [style])
  const colors = s.colors

  const chartData = useMemo(() => data.map((item, i) => ({
    name:  String(item[xField] ?? `#${i + 1}`),
    value: parseFloat(String(item[yField])) || 0,
  })), [data, xField, yField])

  const avg = useMemo(() =>
    chartData.length
      ? chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length
      : 0
  , [chartData])

  const margin = getChartMargin(sizePreset, s.chartMargin)
  const rotate = sizePreset === 'small' ? chartData.length > 5 : chartData.length > 8
  const tickInterval = getCategoryTickInterval(sizePreset, chartData.length)
  const displayLegend = getLegendVisibility(sizePreset, s.showLegend)
  const axis   = getAxisColors()
  const tt     = getTooltipStyle(s)
  const density = useMemo(() => getChartDensityLayout(s.density), [s.density])

  const option = useMemo(() => ({
    animation:         true,
    animationDuration: 700,
    animationEasing:   'cubicOut' as const,
    backgroundColor:   'transparent',
    color: colors,
    grid: {
      top: margin.top + (displayLegend ? 18 : 0),
      right: margin.right + (sizePreset === 'medium' ? 16 : 0),
      bottom: margin.bottom + (rotate ? 28 : 14) + (displayLegend && sizePreset !== 'medium' ? 14 : 0),
      left: margin.left,
      containLabel: true,
    },
    tooltip: {
      show: s.tooltipEnabled !== false,
      trigger: 'axis',
      ...tt,
      // ── Fix #5 — typed formatter param ─────────────────────
      formatter: (params: TooltipParam[]) => {
        const p = params[0]
        const auxiliary = formatAuxiliaryTooltipRows({
          row: data[p?.dataIndex],
          fields: tooltipFields,
          style: s,
          excludedFields: [xField, yField],
        })
        return `<b style="font-size:12px">${formatTooltipHtmlLabel(p.name, undefined, s.tooltipLabelOverflow, s.tooltipLabelMaxLength)}</b><br/>${formatTooltipHtmlLabel(p.seriesName, s.tooltipLabelOverrides, s.tooltipLabelOverflow, s.tooltipLabelMaxLength)}: <strong>${escapeTooltipHtml(fmtValue(p.value, s.labelFormat, s.tooltipNumberFormat))}</strong>${auxiliary ? `<br/>${auxiliary}` : ''}`
      },
    },
    xAxis: {
      show: s.showXAxis !== false,
      type: 'category',
      name: s.xAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 34,
      data: chartData.map(d => d.name),
      boundaryGap: false,
      axisLabel: {
        color:     s.xAxisLabelColor ?? axis.label,
        fontSize:  s.xAxisLabelFontSize ?? (chartData.length > 15 ? 10 : 11),
        fontWeight: chartFontWeight(s.xAxisLabelFontWeight),
        rotate:    s.xAxisLabelRotation ?? (rotate ? -35 : 0),
        interval:  tickInterval,
        margin: density.axisLabelMargin,
        formatter: (v: string) => {
          const label = formatCategoryAxisLabel(
            v,
            s.xAxisLabelFormat,
            s.xAxisLabelLocale,
            s.xAxisLabelTimeZone,
          )
          if (s.xAxisLabelOverflow) {
            return formatChartText(label, s.xAxisLabelOverflow, s.xAxisLabelMaxLength)
          }
          return label.length > 14 ? label.slice(0, 12) + '…' : label
        },
      },
      axisLine:  { show: false },
      axisTick:  { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      show: s.showYAxis !== false,
      type: 'value',
      name: s.yAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 48,
      axisLabel: {
        color:    s.yAxisLabelColor ?? axis.label,
        fontSize: s.yAxisLabelFontSize ?? 11,
        fontWeight: chartFontWeight(s.yAxisLabelFontWeight),
        formatter: (v: number) => fmtValue(v, s.labelFormat, s.yAxisNumberFormat),
      },
      axisLine:  { show: false },
      axisTick:  { show: false },
      splitLine: {
        show: s.showGrid,
        lineStyle: { type: 'dashed' as const, color: axis.splitLine },
      },
    },
    legend: displayLegend
      ? {
          show: true,
          ...getLegendLayout(s.legendPosition, margin),
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
    series: [{
      type:       'line',
      name:       yField,
      data:       chartData.map(d => d.value),
      smooth:     s.lineSmooth === false ? false : 0.3,
      symbol:     'circle',
      symbolSize: chartData.length < 25 ? density.symbolSize : 0,
      lineStyle:  { width: s.lineWidth ?? 2.5, color: colors[0] },
      itemStyle:  { color: colors[0] },
      label: s.showLabels
        ? {
            show: true,
            position: s.labelPosition === 'inside' ? 'inside' as const : 'top' as const,
            color: s.labelColor ?? axis.label,
            fontSize: s.labelFontSize ?? 10,
            fontWeight: chartFontWeight(s.labelFontWeight),
            hideOverlap: s.labelCollision === 'hide-overlap',
            formatter: (p: { value: number }) => fmtValue(
              Number(p.value),
              s.labelFormat,
              s.valueLabelNumberFormat,
            ),
          }
        : { show: false },
      // ── Fix #4 — gradient area fill for enterprise look ─────
      areaStyle: {
        color: new graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0,   color: colors[0] + '55' },
          { offset: 0.7, color: colors[0] + '11' },
          { offset: 1,   color: colors[0] + '00' },
        ]),
      },
      markLine: {
        symbol:    'none',
        silent:    true,
        data:      [{ yAxis: avg }],
        lineStyle: { type: 'dashed' as const, color: axis.label, opacity: 0.5 },
        label: {
          show:      true,
          position:  'end',
          formatter: 'avg',
          fontSize:  9,
          color:     axis.label,
        },
      },
    }],
  }), [
    avg,
    axis,
    chartData,
    colors,
    data,
    density,
    displayLegend,
    margin,
    rotate,
    s,
    sizePreset,
    tickInterval,
    tooltipFields,
    tt,
    xField,
    yField,
  ])

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      notMerge={true}    // ← Fix #2
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
