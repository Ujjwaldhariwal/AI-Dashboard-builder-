'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'
import { withAlpha } from '@/lib/echarts/utils'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'
import {
  getCategoryTickInterval,
  getChartMargin,
  getLegendVisibility,
} from '@/lib/charts/chart-constants'

// ── Fix #1 — browser-only theme registration ──────────────────
function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface TooltipParam {
  name:       string
  seriesName: string
  value:      number
}

interface ModernAreaChartProps {
  data:   Record<string, unknown>[]
  xField: string
  yField: string
  title?: string
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
}

export function ModernAreaChart({ data, xField, yField, style, sizePreset = 'medium' }: ModernAreaChartProps) {
  useEnterpriseTheme() // ← Fix #1

  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors

  const chartData = useMemo(() => data.map((item, i) => ({
    name:  String(item[xField] ?? `#${i + 1}`).slice(0, 18),
    value: parseFloat(String(item[yField])) || 0,
  })), [data, xField, yField])

  const margin = getChartMargin(sizePreset)
  const rotate = sizePreset === 'small' ? chartData.length > 5 : chartData.length > 8
  const tickInterval = getCategoryTickInterval(sizePreset, chartData.length)
  const displayLegend = getLegendVisibility(sizePreset, s.showLegend)
  const axis   = getAxisColors()
  const tt     = getTooltipStyle(s)

  const option = useMemo(() => ({
    animation:         true,
    animationDuration: 700,
    animationEasing:   'cubicOut' as const,
    backgroundColor:   'transparent',
    color: colors,
    grid: {
      top: margin.top + (displayLegend ? 18 : 0),
      right: margin.right,
      bottom: margin.bottom + (rotate ? 28 : 14) + (displayLegend && sizePreset !== 'medium' ? 14 : 0),
      left: margin.left,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      ...tt,
      // ── Fix #5 — typed formatter ──────────────────────────
      formatter: (params: TooltipParam[]) => {
        const p = params[0]
        return `<b style="font-size:12px">${p.name}</b><br/>${p.seriesName}: <strong>${fmtValue(p.value, s.labelFormat)}</strong>`
      },
    },
    xAxis: {
      type: 'category',
      data: chartData.map(d => d.name),
      boundaryGap: false,
      axisLabel: {
        color:     axis.label,
        fontSize:  chartData.length > 15 ? 10 : 11,
        rotate:    rotate ? -35 : 0,
        interval:  tickInterval,
        formatter: (v: string) => v.length > 14 ? v.slice(0, 12) + '…' : v,
      },
      axisLine:  { show: false },
      axisTick:  { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color:     axis.label,
        fontSize:  11,
        formatter: (v: number) => fmtValue(v, s.labelFormat),
      },
      axisLine:  { show: false },
      axisTick:  { show: false },
      splitLine: {
        show: s.showGrid,
        lineStyle: { type: 'dashed' as const, color: axis.splitLine },
      },
    },
    legend: displayLegend
      ? sizePreset === 'medium'
        ? {
            show: true,
            top: margin.top - 4,
            right: margin.right,
            textStyle: { fontSize: 10, color: axis.label },
          }
        : {
            show: true,
            bottom: margin.bottom - 8,
            textStyle: { fontSize: 11, color: axis.label },
          }
      : { show: false },
    series: [{
      type:       'line',
      name:       yField,
      data:       chartData.map(d => d.value),
      smooth:     0.4,
      symbol:     'circle',
      symbolSize: chartData.length < 25 ? 4 : 0,
      lineStyle:  { width: 2.5, color: colors[0] },
      itemStyle:  { color: colors[0] },
      areaStyle: {
        // ── Fix #6 — withAlpha from shared utils ─────────────
        color: new graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: withAlpha(colors[0], 0.4) },
          { offset: 1, color: withAlpha(colors[0], 0.03) },
        ]),
      },
    }],
  // deps are intentionally coarse — s/colors/axis/tt derive from listed deps
  }), [chartData, colors, s, axis, tt, yField]) // ← Fix #7: removed eslint-disable

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
