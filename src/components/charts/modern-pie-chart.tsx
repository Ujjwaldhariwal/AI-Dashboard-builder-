'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle } from '@/lib/echarts/style-translator'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface TooltipParam {
  name:    string
  value:   number
  percent: number
}

interface LabelParam {
  percent: number
}

interface ModernPieChartProps {
  data:       Record<string, unknown>[]  // ← Fix #5
  nameField:  string
  valueField: string
  title?:     string
  donut?:     boolean
  style?:     WidgetStyle
}

export function ModernPieChart({
  data, nameField, valueField, donut = false, style,
}: ModernPieChartProps) {
  useEnterpriseTheme() // ← Fix #1

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
        grouped[k] = (grouped[k] ?? 0) + (parseFloat(String(item[valueField])) || 0)
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
    animation:         true,
    animationDuration: 700,
    animationEasing:   'cubicOut' as const,
    backgroundColor:   'transparent',
    color: colors,
    tooltip: {
      trigger: 'item',
      ...tt,
      // ── Fix #5 — typed formatter ──────────────────────────
      formatter: (p: TooltipParam) =>
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
      type:     'pie',
      center:   ['50%', '42%'],
      // ── donut now correctly in deps via donut var ─────────
      radius:   donut ? ['26%', '52%'] : ['0%', '52%'],
      padAngle: donut ? 3 : 1,
      data:     chartData,
      label: {
        show:      true,
        fontSize:  11,
        // ── Fix #5 — typed label formatter ───────────────────
        formatter: (p: LabelParam) => p.percent >= 8 ? `${p.percent.toFixed(0)}%` : '',
      },
      labelLine: { show: false },
      itemStyle: { borderWidth: 2, borderColor: 'transparent' },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
        scale:     true,
        scaleSize: 5,
      },
    }],
  // deps are intentionally coarse — s/colors/axis/tt derive from listed deps
  }), [chartData, colors, donut, s, axis, tt]) // ← Fix #7: donut added, eslint-disable removed

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      notMerge={true}           // ← Fix #2
      style={{ height: 340, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
