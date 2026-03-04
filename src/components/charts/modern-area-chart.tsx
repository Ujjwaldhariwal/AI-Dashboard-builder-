'use client'

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts/core'
import { getChartHeight, getTickInterval, getBottomMargin } from './chart-registry'
import { WidgetStyle, DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'

registerEnterpriseTheme()

interface ModernAreaChartProps {
  data:   any[]
  xField: string
  yField: string
  title?: string
  style?: WidgetStyle
}

export function ModernAreaChart({ data, xField, yField, style }: ModernAreaChartProps) {
  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors

  const chartData = useMemo(() => data.map((item, i) => ({
    name:  String(item[xField] ?? `#${i + 1}`).slice(0, 18),
    value: parseFloat(item[yField]) || 0,
  })), [data, xField, yField])

  const h      = getChartHeight(chartData.length)
  const rotate = chartData.length > 8
  const axis   = getAxisColors()
  const tt     = getTooltipStyle(s)

  const option = useMemo(() => ({
    color: colors,
    grid: {
      top: 8, right: 12,
      bottom: getBottomMargin(chartData.length),
      left: 8, containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      ...tt,
      formatter: (params: any[]) => {
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
        color: new graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: colors[0] + '66' },
          { offset: 1, color: colors[0] + '08' },
        ]),
      },
    }],
  }), [data, xField, yField, style]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      style={{ height: h, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  )
}
