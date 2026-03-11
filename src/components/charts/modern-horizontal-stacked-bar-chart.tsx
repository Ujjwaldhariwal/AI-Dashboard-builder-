'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface ModernHorizontalStackedBarChartProps {
  data: Record<string, unknown>[]
  xField: string
  yField?: string
  yFields?: string[]
  style?: WidgetStyle
}

function getNumericFields(
  data: Record<string, unknown>[],
  xField: string,
  yField?: string,
  yFields?: string[],
): string[] {
  const preset = (yFields ?? []).filter(Boolean)
  if (preset.length) return preset
  if (!data.length) return yField ? [yField] : []

  const keys = Object.keys(data[0]).filter(k => k !== xField)
  const numeric = keys.filter(key =>
    data.some(row => !isNaN(Number(row[key]))),
  )

  if (yField && numeric.includes(yField)) {
    const rest = numeric.filter(k => k !== yField).slice(0, 4)
    return [yField, ...rest]
  }
  return numeric.slice(0, 5)
}

export function ModernHorizontalStackedBarChart({
  data,
  xField,
  yField,
  yFields,
  style,
}: ModernHorizontalStackedBarChartProps) {
  useEnterpriseTheme()

  const s = { ...DEFAULT_STYLE, ...style }
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)
  const metrics = useMemo(
    () => getNumericFields(data, xField, yField, yFields),
    [data, xField, yField, yFields],
  )

  const rows = useMemo(() => {
    return data.slice(0, 20).map((row, i) => ({
      name: String(row[xField] ?? `#${i + 1}`).slice(0, 28),
      values: metrics.map(m => Number(row[m]) || 0),
    }))
  }, [data, metrics, xField])

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 650,
    animationEasing: 'cubicOut' as const,
    backgroundColor: 'transparent',
    color: s.colors,
    grid: { top: 18, right: 16, bottom: 22, left: 10, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tt,
      valueFormatter: (v: number) => fmtValue(v, s.labelFormat),
    },
    legend: s.showLegend
      ? { show: true, top: 0, textStyle: { fontSize: 10, color: axis.label } }
      : { show: false },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: axis.label,
        fontSize: 10,
        formatter: (v: number) => fmtValue(v, s.labelFormat),
      },
      splitLine: {
        show: s.showGrid,
        lineStyle: { type: 'dashed' as const, color: axis.splitLine },
      },
    },
    yAxis: {
      type: 'category',
      data: rows.map(r => r.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: axis.label, fontSize: 11 },
    },
    series: metrics.map((metric, idx) => ({
      name: metric,
      type: 'bar',
      stack: 'total',
      emphasis: { focus: 'series' as const },
      barMaxWidth: 26,
      data: rows.map(r => r.values[idx]),
      itemStyle: { borderRadius: idx === metrics.length - 1 ? [0, 6, 6, 0] : 0 },
    })),
  }), [axis.label, axis.splitLine, metrics, rows, s, tt])

  if (!metrics.length) {
    return (
      <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
        No numeric fields found for stacked chart
      </div>
    )
  }

  return (
    <ReactECharts
      option={option}
      theme="enterprise"
      notMerge={true}
      style={{ height: 300, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}

