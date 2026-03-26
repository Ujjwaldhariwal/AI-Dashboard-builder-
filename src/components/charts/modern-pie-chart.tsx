'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle } from '@/lib/echarts/style-translator'
import { withAlpha } from '@/lib/echarts/utils'
import { sortNamedValues } from '@/lib/charts/domain-order'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'
import {
  getChartMargin,
  getLegendVisibility,
} from '@/lib/charts/chart-constants'

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
  sizePreset?: WidgetSizePreset
}

export function ModernPieChart({
  data, nameField, valueField, donut = false, style, sizePreset = 'medium',
}: ModernPieChartProps) {
  useEnterpriseTheme() // ← Fix #1

  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors
  const axis   = getAxisColors()
  const tt     = getTooltipStyle(s)
  const margin = getChartMargin(sizePreset)

  const chartData = useMemo(() => {
    const isNumeric = data.length > 0 && !isNaN(Number(data[0]?.[valueField]))
    if (isNumeric) {
      const grouped: Record<string, number> = {}
      data.forEach(item => {
        const k = String(item[nameField] ?? 'Unknown').slice(0, 22)
        grouped[k] = (grouped[k] ?? 0) + (parseFloat(String(item[valueField])) || 0)
      })
      const ranked = Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value]) => ({ name, value }))
      return sortNamedValues(ranked)
    }
    const counts: Record<string, number> = {}
    data.forEach(item => {
      const k = String(item[nameField] ?? 'Unknown').slice(0, 22)
      counts[k] = (counts[k] ?? 0) + 1
    })
    const ranked = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }))
    return sortNamedValues(ranked)
  }, [data, nameField, valueField])
  const total = useMemo(() => chartData.reduce((sum, item) => sum + item.value, 0), [chartData])
  const displayLegend = getLegendVisibility(sizePreset, s.showLegend)

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
    legend: displayLegend
      ? sizePreset === 'medium'
        ? {
            show: true,
            top: margin.top - 4,
            right: margin.right,
            type: 'scroll' as const,
            orient: 'vertical' as const,
            textStyle: { fontSize: 10, color: axis.label },
            formatter: (name: string) => name.length > 12 ? name.slice(0, 10) + '…' : name,
          }
        : {
            show: true,
            bottom: margin.bottom - 8,
            type: 'scroll' as const,
            orient: 'horizontal' as const,
            textStyle: { fontSize: 10, color: axis.label },
            formatter: (name: string) => name.length > 12 ? name.slice(0, 10) + '…' : name,
          }
      : { show: false },
    series: [{
      type:     'pie',
      center:   sizePreset === 'medium' && displayLegend ? ['40%', '52%'] : ['50%', '46%'],
      // ── donut now correctly in deps via donut var ─────────
      radius:   donut
        ? (sizePreset === 'small' ? ['24%', '50%'] : ['26%', '52%'])
        : ['0%', sizePreset === 'small' ? '50%' : '52%'],
      padAngle: donut ? 3 : 1,
      data:     chartData,
      label: {
        show:      true,
        fontSize:  11,
        // ── Fix #5 — typed label formatter ───────────────────
        formatter: (p: LabelParam) => p.percent >= 8 ? `${p.percent.toFixed(0)}%` : '',
      },
      labelLine: { show: false },
      itemStyle: {
        borderWidth: 1,
        borderColor: withAlpha(axis.border, 0.28),
        shadowBlur: 8,
        shadowColor: 'rgba(15,23,42,0.12)',
      },
      emphasis: {
        itemStyle: { shadowBlur: 14, shadowColor: 'rgba(0,0,0,0.24)' },
        scale:     true,
        scaleSize: 5,
      },
    }],
    graphic: donut ? [
      {
        type: 'text',
        left: 'center',
        top: '35%',
        style: {
          text: total.toLocaleString(),
          fontSize: 18,
          fontWeight: 700,
          fill: axis.label,
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '42%',
        style: {
          text: 'Total',
          fontSize: 10,
          fill: withAlpha(axis.label, 0.7),
        },
      },
    ] : undefined,
  // deps are intentionally coarse — s/colors/axis/tt derive from listed deps
  }), [axis, chartData, colors, donut, s, total, tt]) // ← Fix #7: donut added, eslint-disable removed

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
