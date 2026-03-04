'use client'

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { WidgetStyle, DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle } from '@/lib/echarts/style-translator'

registerEnterpriseTheme()

interface ModernPieChartProps {
  data:       any[]
  nameField:  string
  valueField: string
  title?:     string
  donut?:     boolean
  style?:     WidgetStyle
}

export function ModernPieChart({ data, nameField, valueField, donut = false, style }: ModernPieChartProps) {
  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors
  const axis   = getAxisColors()
  const tt     = getTooltipStyle(s)

  const chartData = useMemo(() => {
    const isNumeric = data.length > 0 && !isNaN(Number(data[0]?.[valueField]))
    if (isNumeric) {
      const grouped: Record<string, number> = {}
      data.forEach(item => {
        const k = String(item[nameField] ?? 'Unknown').slice(0, 22)
        grouped[k] = (grouped[k] ?? 0) + (parseFloat(item[valueField]) || 0)
      })
      return Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value]) => ({ name, value }))
    }
    const counts: Record<string, number> = {}
    data.forEach(item => {
      const k = String(item[nameField] ?? 'Unknown').slice(0, 22)
      counts[k] = (counts[k] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }))
  }, [data, nameField, valueField])

  const option = useMemo(() => ({
    color: colors,
    tooltip: {
      trigger: 'item',
      ...tt,
      formatter: (p: any) =>
        `<b>${p.name}</b><br/>Value: <strong>${p.value?.toLocaleString()}</strong><br/>${p.percent?.toFixed(1)}%`,
    },
    legend: s.showLegend ? {
      show:      true,
      bottom:    0,
      type:      'scroll' as const,
      orient:    'horizontal' as const,
      textStyle: { fontSize: 10, color: axis.label },
      formatter: (name: string) => name.length > 12 ? name.slice(0, 10) + '…' : name,
    } : { show: false },
    series: [{
      type:         'pie',
      center:       ['50%', '42%'],
      radius:       donut ? ['26%', '52%'] : ['0%', '52%'],
      padAngle:     donut ? 3 : 1,
      data:         chartData,
      label: {
        show:      true,
        fontSize:  11,
        formatter: (p: any) => p.percent >= 8 ? `${p.percent.toFixed(0)}%` : '',
      },
      labelLine:  { show: false },
      itemStyle:  { borderWidth: 2, borderColor: 'transparent' },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
        scale:     true,
        scaleSize: 5,
      },
    }],
  }), [data, nameField, valueField, style]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      style={{ height: 340, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  )
}
