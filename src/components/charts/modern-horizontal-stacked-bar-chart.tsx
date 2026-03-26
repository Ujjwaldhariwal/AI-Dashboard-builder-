'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import type { WidgetStyle, YAxisConfig } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'
import { withAlpha } from '@/lib/echarts/utils'
import { sortLabels } from '@/lib/charts/domain-order'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'
import {
  getChartMargin,
  getLegendVisibility,
  showValueLabels,
} from '@/lib/charts/chart-constants'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface SeriesMeta {
  key: string
  label: string
  color: string
}

interface ModernHorizontalStackedBarChartProps {
  data: Record<string, unknown>[]
  xField: string
  yField?: string
  yFields?: string[]
  yAxisConfig?: YAxisConfig[]
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
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
  yAxisConfig,
  style,
  sizePreset = 'medium',
}: ModernHorizontalStackedBarChartProps) {
  useEnterpriseTheme()

  const s = { ...DEFAULT_STYLE, ...style }
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)
  const margin = getChartMargin(sizePreset)
  const metrics = useMemo(
    () => getNumericFields(data, xField, yField, yFields),
    [data, xField, yField, yFields],
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

    return sortLabels(metrics).map((key, i) => ({
      key,
      label: key,
      color: s.colors[i % s.colors.length],
    }))
  }, [metrics, s.colors, yAxisConfig])

  const rows = useMemo(() => {
    return data.slice(0, 20).map((row, i) => ({
      name: String(row[xField] ?? `#${i + 1}`).slice(0, 28),
      values: seriesMeta.map(meta => Number(row[meta.key]) || 0),
    }))
  }, [data, seriesMeta, xField])
  const displayLegend = getLegendVisibility(sizePreset, s.showLegend)
  const displayLabels = showValueLabels(sizePreset, rows.length)

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 740,
    animationEasing: 'cubicOut' as const,
    backgroundColor: 'transparent',
    color: seriesMeta.map(meta => meta.color),
    grid: {
      top: margin.top + (displayLegend ? 20 : 0),
      right: margin.right + (displayLabels ? 20 : 8),
      bottom: margin.bottom + (displayLegend && sizePreset !== 'medium' ? 14 : 0),
      left: margin.left,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tt,
      valueFormatter: (v: number) => fmtValue(v, s.labelFormat),
    },
    legend: displayLegend
      ? sizePreset === 'medium'
        ? {
            show: true,
            top: margin.top - 4,
            right: margin.right,
            icon: 'roundRect',
            itemWidth: 10,
            itemHeight: 6,
            textStyle: { fontSize: 10, color: axis.label },
          }
        : {
            show: true,
            bottom: margin.bottom - 8,
            icon: 'roundRect',
            itemWidth: 10,
            itemHeight: 6,
            textStyle: { fontSize: 10, color: axis.label },
          }
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
    series: seriesMeta.map((meta, idx) => ({
      name: meta.label,
      type: 'bar',
      stack: 'total',
      emphasis: { focus: 'series' as const },
      barMaxWidth: 26,
      data: rows.map(r => r.values[idx]),
      label: displayLabels
        ? {
            show: true,
            position: 'insideRight',
            fontSize: 9,
            color: '#f8fafc',
            formatter: (p: { value: number }) => fmtValue(Number(p.value), s.labelFormat),
          }
        : { show: false },
      itemStyle: {
        borderRadius: idx === seriesMeta.length - 1 ? [0, 8, 8, 0] : 0,
        color: new graphic.LinearGradient(1, 0, 0, 0, [
          { offset: 0, color: withAlpha(meta.color, 0.95) },
          { offset: 1, color: withAlpha(meta.color, 0.6) },
        ]),
        borderWidth: 0.8,
        borderColor: withAlpha(axis.border, 0.22),
      },
    })),
  }), [axis.border, axis.label, axis.splitLine, rows, s, seriesMeta, tt])

  if (!seriesMeta.length) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-xs text-muted-foreground">
        No numeric fields found for stacked chart
      </div>
    )
  }

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
