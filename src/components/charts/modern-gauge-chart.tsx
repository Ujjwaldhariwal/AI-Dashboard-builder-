'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

// ── Fix #3 — reactive dark mode via hook, not bare function call
function useIsDarkMode(): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return dark
}

interface ModernGaugeChartProps {
  value:       number
  label?:      string
  thresholds?: { warn: number; danger: number }
  style?:      WidgetStyle
}

export function ModernGaugeChart({
  value,
  label      = 'Score',
  thresholds = { warn: 60, danger: 80 },
  style,
}: ModernGaugeChartProps) {
  useEnterpriseTheme() // ← Fix #1

  const s       = { ...DEFAULT_STYLE, ...style }
  const clamped = Math.min(100, Math.max(0, value))
  const dark    = useIsDarkMode() // ← Fix #3

  const gaugeColor =
    clamped >= thresholds.danger ? (s.colors[5] ?? '#ef4444')
    : clamped >= thresholds.warn ? (s.colors[4] ?? '#f59e0b')
    :                               (s.colors[2] ?? '#10b981')

  const trackColor = dark ? '#1e293b' : '#f1f5f9'
  const labelColor = dark ? '#94a3b8' : '#64748b'

  const option = useMemo(() => ({
    animation:         true,
    animationDuration: 700,
    animationEasing:   'cubicOut' as const,
    backgroundColor:   'transparent',
    series: [{
      type:       'gauge',
      startAngle: 180,
      endAngle:   0,
      min:        0,
      max:        100,
      radius:     '90%',
      center:     ['50%', '72%'],
      progress: {
        show:      true,
        width:     18,
        roundCap:  true,
        itemStyle: { color: gaugeColor },
      },
      axisLine: {
        roundCap:  true,
        lineStyle: { width: 18, color: [[1, trackColor]] },
      },
      pointer:   { show: false },
      axisTick:  { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: {
        show:         true,
        offsetCenter: [0, '28%'],
        fontSize:     11,
        color:        labelColor,
        fontWeight:   'normal' as const,
      },
      detail: {
        valueAnimation: true,
        offsetCenter:   [0, '-15%'],
        fontSize:       30,
        fontWeight:     'bold' as const,
        color:          gaugeColor,
        formatter:      '{value}%',
      },
      data: [{ value: clamped, name: label }],
    }],
  }), [clamped, gaugeColor, trackColor, labelColor, label])

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      notMerge={true}           // ← Fix #2
      style={{ height: 200, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}

export function ModernGaugeChartFromData({
  data,
  yField,
  label,
  style,
}: {
  data:   Record<string, unknown>[]  // ← Fix #5
  yField: string
  label?: string
  style?: WidgetStyle
}) {
  const values = data
    .map(d => parseFloat(String(d[yField])))
    .filter(v => !isNaN(v))

  // ── Fix #8 — guard against empty array before Math.max ───────
  if (!values.length) {
    return <ModernGaugeChart value={0} label={label ?? yField} style={style} />
  }

  const avg        = values.reduce((a, b) => a + b, 0) / values.length
  const max        = Math.max(...values)
  const normalised = max > 0 ? (avg / max) * 100 : 0

  return <ModernGaugeChart value={normalised} label={label ?? yField} style={style} />
}
