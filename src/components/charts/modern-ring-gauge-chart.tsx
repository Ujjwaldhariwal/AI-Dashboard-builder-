'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface ModernRingGaugeChartProps {
  value: number
  label?: string
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
}

function toPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function ModernRingGaugeChart({
  value,
  label = 'Progress',
  style,
  sizePreset = 'medium',
}: ModernRingGaugeChartProps) {
  useEnterpriseTheme()

  const s = { ...DEFAULT_STYLE, ...style }
  const percent = toPercent(value)

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 800,
    animationEasing: 'cubicOut' as const,
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 90,
        endAngle: -270,
        radius: sizePreset === 'small' ? '80%' : '88%',
        center: ['50%', '52%'],
        min: 0,
        max: 100,
        splitNumber: 10,
        pointer: { show: false },
        progress: {
          show: true,
          roundCap: true,
          width: 18,
          itemStyle: { color: s.colors[0] ?? '#3b82f6' },
        },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 18,
            color: [[1, 'rgba(148, 163, 184, 0.2)']],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: {
          show: true,
          offsetCenter: [0, '68%'],
          fontSize: 11,
          color: '#64748b',
        },
        detail: {
          valueAnimation: true,
          fontSize: 32,
          fontWeight: 'bold' as const,
          color: s.colors[0] ?? '#3b82f6',
          offsetCenter: [0, '-2%'],
          formatter: '{value}%',
        },
        data: [{ value: percent, name: label }],
      },
    ],
  }), [label, percent, s.colors])

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      notMerge={true}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}

export function ModernRingGaugeChartFromData({
  data,
  yField,
  label,
  style,
  sizePreset = 'medium',
}: {
  data: Record<string, unknown>[]
  yField: string
  label?: string
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
}) {
  const values = data
    .map(row => Number(row[yField]))
    .filter(v => !Number.isNaN(v))

  if (!values.length) {
    return <ModernRingGaugeChart value={0} label={label ?? yField} style={style} sizePreset={sizePreset} />
  }

  const avg = values.reduce((sum, n) => sum + n, 0) / values.length
  const max = Math.max(...values)
  const percent = max > 100 ? (avg / max) * 100 : avg

  return <ModernRingGaugeChart value={percent} label={label ?? yField} style={style} sizePreset={sizePreset} />
}
