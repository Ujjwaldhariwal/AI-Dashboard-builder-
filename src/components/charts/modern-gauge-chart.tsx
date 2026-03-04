'use client'

// ✅ UPGRADE: Replaced PieChart hack (total=200, hidden half) with
// ECharts native gauge series — proper progress arc, no tricks needed.

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { WidgetStyle, DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { isDarkMode } from '@/lib/echarts/style-translator'

registerEnterpriseTheme()

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
  const s       = { ...DEFAULT_STYLE, ...style }
  const clamped = Math.min(100, Math.max(0, value))

  const gaugeColor =
    clamped >= thresholds.danger ? (s.colors[5] ?? '#ef4444')
    : clamped >= thresholds.warn ? (s.colors[4] ?? '#f59e0b')
    :                               (s.colors[2] ?? '#10b981')

  const dark       = isDarkMode()
  const trackColor = dark ? '#1e293b' : '#f1f5f9'
  const labelColor = dark ? '#94a3b8' : '#64748b'

  const option = useMemo(() => ({
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
      style={{ height: 200, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge
    />
  )
}

export function ModernGaugeChartFromData({
  data, yField, label, style,
}: {
  data:   any[]
  yField: string
  label?: string
  style?: WidgetStyle
}) {
  const values     = data.map(d => parseFloat(d[yField])).filter(v => !isNaN(v))
  const avg        = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const max        = Math.max(...values, 1)
  const normalised = (avg / max) * 100
  return <ModernGaugeChart value={normalised} label={label ?? yField} style={style} />
}
