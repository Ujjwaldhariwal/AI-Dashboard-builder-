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

interface ModernGroupedBarChartProps {
  data: Record<string, unknown>[]
  xField: string
  yField?: string
  yFields?: string[]
  style?: WidgetStyle
}

function inferMetrics(
  data: Record<string, unknown>[],
  xField: string,
  yField?: string,
  yFields?: string[],
): string[] {
  const explicit = (yFields ?? []).filter(Boolean)
  if (explicit.length) return explicit
  if (!data.length) return yField ? [yField] : []

  const keys = Object.keys(data[0]).filter(k => k !== xField)
  const numeric = keys.filter(key => data.some(r => !isNaN(Number(r[key]))))

  if (yField && numeric.includes(yField)) {
    const rest = numeric.filter(n => n !== yField).slice(0, 3)
    return [yField, ...rest]
  }
  return numeric.slice(0, 4)
}

export function ModernGroupedBarChart({
  data,
  xField,
  yField,
  yFields,
  style,
}: ModernGroupedBarChartProps) {
  useEnterpriseTheme()

  const s = { ...DEFAULT_STYLE, ...style }
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)
  const metrics = useMemo(() => inferMetrics(data, xField, yField, yFields), [data, xField, yField, yFields])

  const labels = useMemo(
    () => data.slice(0, 20).map((row, i) => String(row[xField] ?? `#${i + 1}`).slice(0, 18)),
    [data, xField],
  )

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 700,
    animationEasing: 'cubicOut' as const,
    color: s.colors,
    backgroundColor: 'transparent',
    grid: { top: 28, right: 14, bottom: 48, left: 10, containLabel: true },
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
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: axis.label,
        fontSize: 10,
        rotate: labels.length > 8 ? -32 : 0,
      },
    },
    yAxis: {
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
    series: metrics.map(metric => ({
      name: metric,
      type: 'bar',
      barMaxWidth: 34,
      data: data.slice(0, 20).map(row => Number(row[metric]) || 0),
      itemStyle: { borderRadius: [6, 6, 0, 0] },
    })),
  }), [axis.label, axis.splitLine, data, labels, metrics, s, tt])

  if (!metrics.length) {
    return (
      <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
        No numeric fields found for grouped chart
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

