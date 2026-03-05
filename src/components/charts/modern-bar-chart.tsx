'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import { getChartHeight, getTickInterval, getBottomMargin } from './chart-registry'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'

// ── Fix #1 — guard against SSR, register only in browser ─────
function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

// ── Fix #3 — safe opacity via ECharts alpha helper ────────────
function withAlpha(hex: string, alpha: number): string {
  // handles 3-digit, 6-digit hex and gracefully skips non-hex
  const match = hex.replace('#', '').match(/^([a-f\d]{3}|[a-f\d]{6})$/i)
  if (!match) return hex
  const full = match[1].length === 3
    ? match[1].split('').map(c => c + c).join('')
    : match[1]
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface TooltipParam {
  name:       string
  seriesName: string
  value:      number
  dataIndex:  number
}

interface ModernBarChartProps {
  data:   Record<string, unknown>[]
  xField: string
  yField: string
  title?: string
  style?: WidgetStyle
}

export function ModernBarChart({ data, xField, yField, style }: ModernBarChartProps) {
  useEnterpriseTheme() // ← Fix #1

  const s      = { ...DEFAULT_STYLE, ...style }
  const colors = s.colors
  const r      = s.barRadius ?? 5

  const chartData = useMemo(() => {
    const isNumeric = data.length > 0 && !isNaN(Number(data[0]?.[yField]))
    if (isNumeric) {
      return data.slice(0, 30).map((item, i) => ({
        name:  String(item[xField] ?? `#${i + 1}`).slice(0, 18),
        value: parseFloat(String(item[yField])) || 0,
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
    animation:        true,
    animationDuration: 700,
    animationEasing:  'cubicOut' as const,
    backgroundColor:  'transparent',
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
      // ── Fix #5 — typed formatter param ─────────────────────
      formatter: (params: TooltipParam[]) => {
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
      type:        'bar',
      name:        yField,
      barMaxWidth: 48,
      data: chartData.map((d, i) => ({
        value: d.value,
        itemStyle: {
          // ── Fix #3 — safe gradient using rgba helper ────────
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(colors[i % colors.length], 1)    },
            { offset: 1, color: withAlpha(colors[i % colors.length], 0.55) },
          ]),
          borderRadius: [r, r, 0, 0],
        },
      })),
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
      },
    }],
  // deps are intentionally coarse — s/colors/axis/tt derive from listed deps
  }), [chartData, colors, r, s, axis, tt, yField]) // ← Fix #6: removed eslint-disable, proper deps

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
