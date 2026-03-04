'use client'

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts/core'
import { getChartHeight } from './chart-registry'
import { WidgetStyle, DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'

registerEnterpriseTheme()

interface Props {
  data:     any[]
  xField:   string
  yField:   string
  stacked?: boolean
  style?:   WidgetStyle
}

export function ModernHorizontalBarChart({ data, xField, yField, style }: Props) {
  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors
  const r      = s.barRadius ?? 6
  const axis   = getAxisColors()
  const tt     = getTooltipStyle(s)

  const chartData = useMemo(() => {
    const isNumeric = data.length > 0 && !isNaN(Number(data[0]?.[yField]))
    if (isNumeric) {
      return data.slice(0, 25).map((item, i) => ({
        name:  String(item[xField] ?? `#${i}`).slice(0, 24),
        value: parseFloat(item[yField]) || 0,
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
  }, [data, xField, yField])

  const h = getChartHeight(chartData.length)

  const option = useMemo(() => ({
    color: colors,
    grid: { top: 4, right: 56, bottom: 4, left: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tt,
      formatter: (params: any[]) => {
        const p = params[0]
        return `<b style="font-size:12px">${p.name}</b><br/>${p.seriesName}: <strong>${fmtValue(p.value, s.labelFormat)}</strong>`
      },
    },
    xAxis: {
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
    yAxis: {
      type:      'category',
      data:      chartData.map(d => d.name),
      axisLabel: { color: axis.label, fontSize: 11 },
      axisLine:  { show: false },
      axisTick:  { show: false },
    },
    series: [{
      type:        'bar',
      name:        yField,
      barMaxWidth: 28,
      data: chartData.map((d, i) => ({
        value:     d.value,
        itemStyle: {
          color: new graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: colors[i % colors.length] },
            { offset: 1, color: colors[i % colors.length] + 'aa' },
          ]),
          borderRadius: [0, r, r, 0],
        },
      })),
      label: {
        show:      true,
        position:  'right' as const,
        formatter: (p: any) => fmtValue(p.value, s.labelFormat),
        fontSize:  10,
        color:     axis.label,
      },
      emphasis: {
        itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' },
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
