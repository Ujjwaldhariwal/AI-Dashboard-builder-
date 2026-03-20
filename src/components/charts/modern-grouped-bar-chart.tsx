'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import type { WidgetStyle, YAxisConfig } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'
import { withAlpha } from '@/lib/echarts/utils'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface SeriesMeta {
  key: string
  label: string
  color: string
}

interface ModernGroupedBarChartProps {
  data: Record<string, unknown>[]
  xField: string
  yField?: string
  yFields?: string[]
  yAxisConfig?: YAxisConfig[]
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
  yAxisConfig,
  style,
}: ModernGroupedBarChartProps) {
  useEnterpriseTheme()

  const s = { ...DEFAULT_STYLE, ...style }
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)
  const metrics = useMemo(() => inferMetrics(data, xField, yField, yFields), [data, xField, yField, yFields])
  const rows = useMemo(
    () =>
      data.slice(0, 20).map((row, i) => ({
        label: String(row[xField] ?? `#${i + 1}`).slice(0, 18),
        raw: row,
      })),
    [data, xField],
  )

  const seriesMeta = useMemo<SeriesMeta[]>(() => {
    const configured = (yAxisConfig ?? [])
      .map((cfg, i) => {
        const key = String(cfg.key ?? '').trim()
        if (!key) return null
        return {
          key,
          label: cfg.label?.trim() || key,
          color: cfg.color || s.colors[i % s.colors.length],
        } satisfies SeriesMeta
      })
      .filter((cfg): cfg is SeriesMeta => Boolean(cfg))

    if (configured.length) return configured

    return metrics.map((key, i) => ({
      key,
      label: key,
      color: s.colors[i % s.colors.length],
    }))
  }, [metrics, s.colors, yAxisConfig])

  const labels = useMemo(() => rows.map(row => row.label), [rows])

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 760,
    animationEasing: 'cubicOut' as const,
    color: seriesMeta.map(meta => meta.color),
    backgroundColor: 'transparent',
    grid: { top: 34, right: 14, bottom: 48, left: 10, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tt,
      valueFormatter: (v: number) => fmtValue(v, s.labelFormat),
    },
    legend: s.showLegend
      ? {
          show: true,
          top: 0,
          icon: 'roundRect',
          itemWidth: 10,
          itemHeight: 6,
          textStyle: { fontSize: 10, color: axis.label },
        }
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
    series: seriesMeta.map(meta => ({
      name: meta.label,
      type: 'bar',
      barMaxWidth: 28,
      data: rows.map(row => Number(row.raw[meta.key]) || 0),
      itemStyle: {
        borderRadius: [8, 8, 0, 0],
        color: new graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: withAlpha(meta.color, 0.95) },
          { offset: 1, color: withAlpha(meta.color, 0.55) },
        ]),
        shadowBlur: 8,
        shadowColor: withAlpha(meta.color, 0.3),
      },
    })),
  }), [axis.label, axis.splitLine, labels, rows, s, seriesMeta, tt])

  if (!seriesMeta.length) {
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
