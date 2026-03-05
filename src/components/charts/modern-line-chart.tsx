'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import { getChartHeight, getTickInterval, getBottomMargin } from './chart-registry'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface TooltipParam {
  name:       string
  seriesName: string
  value:      number
}

interface ModernLineChartProps {
  data:   Record<string, unknown>[]
  xField: string
  yField: string
  title?: string
  style?: WidgetStyle
}

export function ModernLineChart({ data, xField, yField, style }: ModernLineChartProps) {
  useEnterpriseTheme() // ← Fix #1

  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors

  const chartData = useMemo(() => data.map((item, i) => ({
    name:  String(item[xField] ?? `#${i + 1}`).slice(0, 18),
    value: parseFloat(String(item[yField])) || 0,
  })), [data, xField, yField])

  const avg = useMemo(() =>
    chartData.length
      ? chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length
      : 0
  , [chartData])

  const h      = getChartHeight(chartData.length)
  const rotate = chartData.length > 8
  const axis   = getAxisColors()
  const tt     = getTooltipStyle(s)

  const option = useMemo(() => ({
    animation:         true,
    animationDuration: 700,
    animationEasing:   'cubicOut' as const,
    backgroundColor:   'transparent',
    color: colors,
    grid: {
      top: 8, right: 28,
      bottom: getBottomMargin(chartData.length),
      left: 8, containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      ...tt,
      // ── Fix #5 — typed formatter param ─────────────────────
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
        interval:  getTickInterval(chartData.length),
        formatter: (v: string) => v.length > 14 ? v.slice(0, 12) + '…' : v,
      },
      axisLine:  { show: false },
      axisTick:  { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color:    axis.label,
        fontSize: 11,
        formatter: (v: number) => fmtValue(v, s.labelFormat),
      },
      axisLine:  { show: false },
      axisTick:  { show: false },
      splitLine: {
        show: s.showGrid,
        lineStyle: { type: 'dashed' as const, color: axis.splitLine },
      },
    },
    legend: s.showLegend
      ? { show: true, bottom: 0, textStyle: { fontSize: 11, color: axis.label } }
      : { show: false },
    series: [{
      type:       'line',
      name:       yField,
      data:       chartData.map(d => d.value),
      smooth:     0.3,
      symbol:     'circle',
      symbolSize: chartData.length < 25 ? 5 : 0,
      lineStyle:  { width: 2.5, color: colors[0] },
      itemStyle:  { color: colors[0] },
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
  // deps are intentionally coarse — s/colors/axis/tt/avg derive from listed deps
  }), [chartData, avg, colors, s, axis, tt, yField]) // ← Fix #6: proper deps

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      notMerge={true}    // ← Fix #2
      style={{ height: h, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
