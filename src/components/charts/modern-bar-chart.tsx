'use client'

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts/core'
import { getChartHeight, getTickInterval, getBottomMargin } from './chart-registry'
import { WidgetStyle, DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'

registerEnterpriseTheme()

interface ModernBarChartProps {
  data:   any[]
  xField: string
  yField: string
  title?: string
  style?: WidgetStyle
}

export function ModernBarChart({ data, xField, yField, style }: ModernBarChartProps) {
  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors
  const r      = s.barRadius ?? 5

  const chartData = useMemo(() => {
    const isNumeric = data.length > 0 && !isNaN(Number(data[0]?.[yField]))
    if (isNumeric) {
      return data.slice(0, 30).map((item, i) => ({
        name:  String(item[xField] ?? `#${i + 1}`).slice(0, 18),
        value: parseFloat(item[yField]) || 0,
      }))
    }
    const counts: Record<string, number> = {}
    data.forEach(item => {
      const k = String(item[xField] ?? 'Unknown').slice(0, 18)
      counts[k] = (counts[k] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, value]) => ({ name, value }))
  }, [data, xField, yField])

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
      axisPointer: { type: 'shadow' },
      ...tt,
      formatter: (params: any[]) => {
        const p = params[0]
        return `<b style="font-size:12px">${p.name}</b><br/>${p.seriesName}: <strong>${fmtValue(p.value, s.labelFormat)}</strong>`
      },
    },
    xAxis: {
      type: 'category',
      data: chartData.map(d => d.name),
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
    legend: s.showLegend
      ? { show: true, bottom: 0, textStyle: { fontSize: 11, color: axis.label } }
      : { show: false },
    series: [{
      type:        'bar',
      name:        yField,
      barMaxWidth: 48,
      data: chartData.map((d, i) => ({
        value:     d.value,
        itemStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: colors[i % colors.length] },
            { offset: 1, color: colors[i % colors.length] + 'aa' },
          ]),
          borderRadius: [r, r, 0, 0],
        },
      })),
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
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
