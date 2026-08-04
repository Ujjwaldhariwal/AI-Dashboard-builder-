'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'
import { escapeTooltipHtml, formatAuxiliaryTooltipRows, formatTooltipHtmlLabel } from '@/lib/echarts/safe-tooltip'
import { withAlpha } from '@/lib/echarts/utils' // ← Fix #6
import type { WidgetSizePreset } from '@/lib/builder/widget-size'
import {
  chartFontWeight,
  formatChartText,
  getChartDensityLayout,
  getChartMargin,
  showValueLabels,
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

interface LabelParam {
  value: number
}

interface ModernHorizontalBarChartProps {
  data:     Record<string, unknown>[]  // ← Fix #5
  xField:   string
  yField:   string
  tooltipFields?: string[]
  stacked?: boolean
  style?:   WidgetStyle
  sizePreset?: WidgetSizePreset
}

export function ModernHorizontalBarChart({
  data,
  xField,
  yField,
  tooltipFields,
  style,
  sizePreset = 'medium',
}: ModernHorizontalBarChartProps) {
  useEnterpriseTheme() // ← Fix #1

  const s      = useMemo(() => ({ ...DEFAULT_STYLE, ...style }), [style])
  const colors = s.colors
  const r      = s.barRadius ?? 6
  const margin = getChartMargin(sizePreset, s.chartMargin)
  const axis   = getAxisColors()
  const tt     = getTooltipStyle(s)
  const density = useMemo(() => getChartDensityLayout(s.density), [s.density])
  const hasNumericData = useMemo(
    () => data.length > 0 && !isNaN(Number(data[0]?.[yField])),
    [data, yField],
  )

  const chartData = useMemo(() => {
    if (hasNumericData) {
      return data.slice(0, 25).map((item, i) => ({
        name:  String(item[xField] ?? `#${i}`).slice(0, 24),
        value: parseFloat(String(item[yField])) || 0,
      }))
    }
    const counts: Record<string, number> = {}
    data.forEach(item => {
      const k = String(item[xField] ?? 'Unknown').slice(0, 24)
      counts[k] = (counts[k] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, value]) => ({ name, value }))
  }, [data, hasNumericData, xField, yField])

  const displayLabels = s.showLabels ?? showValueLabels(sizePreset, chartData.length)

  const option = useMemo(() => ({
    animation:         true,
    animationDuration: 700,
    animationEasing:   'cubicOut' as const,
    backgroundColor:   'transparent',
    color: colors,
    grid: {
      top: margin.top,
      right: margin.right + (displayLabels ? 44 : 20),
      bottom: margin.bottom,
      left: margin.left,
      containLabel: true,
    },
    tooltip: {
      show: s.tooltipEnabled !== false,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tt,
      formatter: (params: TooltipParam[]) => {
        const p = params[0]
        const auxiliary = hasNumericData
          ? formatAuxiliaryTooltipRows({
              row: data[p?.dataIndex],
              fields: tooltipFields,
              style: s,
              excludedFields: [xField, yField],
            })
          : ''
        return `<b style="font-size:12px">${formatTooltipHtmlLabel(p.name, undefined, s.tooltipLabelOverflow, s.tooltipLabelMaxLength)}</b><br/>${formatTooltipHtmlLabel(p.seriesName, s.tooltipLabelOverrides, s.tooltipLabelOverflow, s.tooltipLabelMaxLength)}: <strong>${escapeTooltipHtml(fmtValue(p.value, s.labelFormat, s.tooltipNumberFormat))}</strong>${auxiliary ? `<br/>${auxiliary}` : ''}`
      },
    },
    xAxis: {
      show: s.showXAxis !== false,
      type: 'value',
      name: s.xAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 34,
      axisLabel: {
        color:     s.xAxisLabelColor ?? axis.label,
        fontSize:  s.xAxisLabelFontSize ?? 11,
        fontWeight: chartFontWeight(s.xAxisLabelFontWeight),
        margin: density.axisLabelMargin,
        formatter: (v: number) => fmtValue(v, s.labelFormat, s.xAxisNumberFormat),
      },
      axisLine:  { show: false },
      axisTick:  { show: false },
      splitLine: {
        show: s.showGrid,
        lineStyle: { type: 'dashed' as const, color: axis.splitLine },
      },
    },
    yAxis: {
      show: s.showYAxis !== false,
      type:      'category',
      name: s.yAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 52,
      data:      chartData.map(d => d.name),
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
      axisLine:  { show: false },
      axisTick:  { show: false },
    },
    series: [{
      type:        'bar',
      name:        yField,
      barMaxWidth: 28,
      barCategoryGap: density.barCategoryGap,
      data: chartData.map((d, i) => ({
        value: d.value,
        itemStyle: {
          // ── Fix #4 — safe gradient via withAlpha ───────────
          color: new graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: withAlpha(colors[i % colors.length], 1)    },
            { offset: 1, color: withAlpha(colors[i % colors.length], 0.55) },
          ]),
          borderRadius: [0, r, r, 0],
        },
      })),
      label: {
        show:      displayLabels,
        position:  s.labelPosition === 'inside' ? 'insideRight' as const : 'right' as const,
        // ── Fix #5 — typed label formatter ───────────────────
        formatter: (p: LabelParam) => fmtValue(
          p.value,
          s.labelFormat,
          s.valueLabelNumberFormat,
        ),
        fontSize:  s.labelFontSize ?? 10,
        fontWeight: chartFontWeight(s.labelFontWeight),
        color:     s.labelColor ?? axis.label,
        hideOverlap: s.labelCollision === 'hide-overlap',
      },
      emphasis: {
        itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' },
      },
    }],
  // deps are intentionally coarse — s/colors/axis/tt derive from listed deps
  }), [
    axis.label,
    axis.splitLine,
    chartData,
    colors,
    density,
    displayLabels,
    margin.bottom,
    margin.left,
    margin.right,
    margin.top,
    hasNumericData,
    r,
    s,
    tt,
    tooltipFields,
    data,
    xField,
    yField,
  ])

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      notMerge={true}           // ← Fix #2
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
