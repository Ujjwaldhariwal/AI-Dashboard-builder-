'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import { Button } from '@/components/ui/button'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { DASHBOARDOS_COLORS } from '@/lib/dashboardos/theme'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'
import { escapeTooltipHtml, formatTooltipHtmlLabel } from '@/lib/echarts/safe-tooltip'
import { withAlpha } from '@/lib/echarts/utils'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'
import {
  chartFontWeight,
  formatCategoryAxisLabel,
  formatChartLabel,
  formatChartText,
  getCategoryTickInterval,
  getChartDensityLayout,
  getChartMargin,
  getLegendLayout,
  getLegendVisibility,
  showValueLabels,
} from '@/lib/charts/chart-constants'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface ModernDrilldownBarChartProps {
  data: Record<string, unknown>[]
  xField: string
  yField: string
  drillField?: string
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
}

interface TooltipParam {
  name: string
  seriesName: string
  value: number
}

function sumByField(
  rows: Record<string, unknown>[],
  groupField: string,
  valueField: string,
): Array<{ name: string; value: number }> {
  const sums = new Map<string, number>()
  rows.forEach((row, i) => {
    const key = String(row[groupField] ?? `#${i + 1}`)
    const n = Number(row[valueField])
    const prev = sums.get(key) ?? 0
    sums.set(key, prev + (Number.isNaN(n) ? 0 : n))
  })
  return Array.from(sums.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

function inferDrillField(
  data: Record<string, unknown>[],
  xField: string,
  yField: string,
): string | null {
  if (!data.length) return null
  const sample = data.slice(0, 200)
  const keys = Object.keys(sample[0]).filter(k => k !== xField && k !== yField)

  type Candidate = {
    key: string
    coverage: number
    unique: number
    preferredBand: boolean
    isIdLike: boolean
  }

  const candidates: Candidate[] = keys
    .map(key => {
      const values = sample
        .map(row => row[key])
        .filter(v => typeof v === 'string')
        .map(v => String(v).trim())
        .filter(Boolean)

      if (!values.length) return null

      const unique = new Set(values).size
      const coverage = values.length / sample.length
      const preferredBand = unique >= 2 && unique <= Math.max(20, Math.floor(sample.length * 0.8))
      const isIdLike = unique >= Math.floor(sample.length * 0.95)

      return { key, coverage, unique, preferredBand, isIdLike } satisfies Candidate
    })
    .filter((item): item is Candidate => Boolean(item))
    .sort((a, b) => {
      if (a.preferredBand !== b.preferredBand) return a.preferredBand ? -1 : 1
      if (a.isIdLike !== b.isIdLike) return a.isIdLike ? 1 : -1
      if (a.coverage !== b.coverage) return b.coverage - a.coverage
      return b.unique - a.unique
    })

  return candidates[0]?.key ?? null
}

export function ModernDrilldownBarChart({
  data,
  xField,
  yField,
  drillField: drillFieldProp,
  style,
  sizePreset = 'medium',
}: ModernDrilldownBarChartProps) {
  useEnterpriseTheme()

  const s = useMemo(() => ({ ...DEFAULT_STYLE, ...style }), [style])
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)
  const margin = getChartMargin(sizePreset, s.chartMargin)
  const density = useMemo(() => getChartDensityLayout(s.density), [s.density])

  const [selectedPrimary, setSelectedPrimary] = useState<string | null>(null)

  const drillField = useMemo(
    () => drillFieldProp ?? inferDrillField(data, xField, yField),
    [data, drillFieldProp, xField, yField],
  )

  const topLevel = useMemo(
    () => sumByField(data, xField, yField).slice(0, 20),
    [data, xField, yField],
  )

  const drillLevel = useMemo(() => {
    if (!selectedPrimary || !drillField) return []
    const scoped = data.filter(row => String(row[xField] ?? '') === selectedPrimary)
    return sumByField(scoped, drillField, yField).slice(0, 20)
  }, [data, drillField, selectedPrimary, xField, yField])

  const rows = selectedPrimary && drillLevel.length > 0 ? drillLevel : topLevel
  const tickInterval = getCategoryTickInterval(sizePreset, rows.length)
  const displayLabels = s.showLabels ?? showValueLabels(sizePreset, rows.length)
  const displayLegend = getLegendVisibility(sizePreset, s.showLegend)
  const subtitle = selectedPrimary && drillField
    ? `${selectedPrimary} -> ${drillField}`
    : xField

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 700,
    animationEasing: 'cubicOut' as const,
    backgroundColor: 'transparent',
    color: s.colors,
    grid: {
      top: margin.top + (displayLegend ? 18 : 0),
      right: margin.right,
      bottom: margin.bottom + (rows.length > 8 ? 24 : 12),
      left: margin.left,
      containLabel: true,
    },
    tooltip: {
      show: s.tooltipEnabled !== false,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tt,
      formatter: (params: TooltipParam[]) => {
        const item = params[0]
        return `<b>${formatTooltipHtmlLabel(item?.name, undefined, s.tooltipLabelOverflow, s.tooltipLabelMaxLength)}</b><br/>${formatTooltipHtmlLabel(item?.seriesName, s.tooltipLabelOverrides, s.tooltipLabelOverflow, s.tooltipLabelMaxLength)}: <strong>${escapeTooltipHtml(fmtValue(Number(item?.value ?? 0), s.labelFormat, s.tooltipNumberFormat))}</strong>`
      },
    },
    xAxis: {
      show: s.showXAxis !== false,
      type: 'category',
      name: s.xAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 36,
      data: rows.map(row => row.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: s.xAxisLabelColor ?? axis.label,
        fontSize: s.xAxisLabelFontSize ?? 10,
        fontWeight: chartFontWeight(s.xAxisLabelFontWeight),
        rotate: s.xAxisLabelRotation ?? (rows.length > 8 ? -28 : 0),
        interval: tickInterval,
        margin: density.axisLabelMargin,
        formatter: (v: string) => {
          const label = formatCategoryAxisLabel(
            v,
            s.xAxisLabelFormat,
            s.xAxisLabelLocale,
            s.xAxisLabelTimeZone,
          )
          if (s.xAxisLabelOverflow) {
            return formatChartText(label, s.xAxisLabelOverflow, s.xAxisLabelMaxLength)
          }
          return label.length > 18 ? `${label.slice(0, 16)}..` : label
        },
      },
    },
    yAxis: {
      show: s.showYAxis !== false,
      type: 'value',
      name: s.yAxisTitle,
      nameLocation: 'middle' as const,
      nameGap: 46,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: s.yAxisLabelColor ?? axis.label,
        fontSize: s.yAxisLabelFontSize ?? 10,
        fontWeight: chartFontWeight(s.yAxisLabelFontWeight),
        formatter: (v: number) => fmtValue(v, s.labelFormat, s.yAxisNumberFormat),
      },
      splitLine: {
        show: s.showGrid,
        lineStyle: { type: 'dashed' as const, color: axis.splitLine },
      },
    },
    legend: displayLegend
      ? {
          show: true,
          ...getLegendLayout(s.legendPosition, margin),
          itemGap: density.legendItemGap,
          textStyle: {
            fontSize: s.legendLabelFontSize ?? 10,
            fontWeight: chartFontWeight(s.legendLabelFontWeight),
            color: axis.label,
          },
          formatter: (name: string) => formatChartLabel(
            name,
            s.legendLabelOverrides,
            s.legendLabelOverflow,
            s.legendLabelMaxLength,
          ),
        }
      : { show: false },
    series: [
      {
        type: 'bar',
        name: yField,
        data: rows.map(row => row.value),
        barMaxWidth: 42,
        barCategoryGap: density.barCategoryGap,
        label: displayLabels
          ? {
              show: true,
              position: 'top',
              fontSize: s.labelFontSize ?? 9,
              fontWeight: chartFontWeight(s.labelFontWeight),
              color: s.labelColor ?? axis.label,
              hideOverlap: s.labelCollision === 'hide-overlap',
              formatter: (p: { value: number }) => fmtValue(
                Number(p.value),
                s.labelFormat,
                s.valueLabelNumberFormat,
              ),
            }
          : { show: false },
        itemStyle: {
          borderRadius: [8, 8, 0, 0],
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(s.colors[0] ?? DASHBOARDOS_COLORS.chartDefaults.dark[0], 0.95) },
            { offset: 1, color: withAlpha(s.colors[0] ?? DASHBOARDOS_COLORS.chartDefaults.dark[0], 0.58) },
          ]),
          shadowBlur: 9,
          shadowColor: withAlpha(s.colors[0] ?? DASHBOARDOS_COLORS.chartDefaults.dark[0], 0.35),
        },
      },
    ],
  }), [
    axis.label,
    axis.splitLine,
    density,
    displayLabels,
    displayLegend,
    margin,
    rows,
    s,
    tickInterval,
    tt,
    yField,
  ])

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground truncate">
          Drill path: <span className="font-mono">{subtitle}</span>
        </p>
        {selectedPrimary && (
          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setSelectedPrimary(null)}>
            Back
          </Button>
        )}
      </div>
      <ReactECharts
        option={option}
        theme="enterprise"
        notMerge={true}
        style={{ height: '100%', width: '100%', flex: 1 }}
        opts={{ renderer: 'svg' }}
        onEvents={{
          click: (params: { name?: string }) => {
            if (selectedPrimary || !drillField) return
            const next = params?.name
            if (next) setSelectedPrimary(next)
          },
        }}
      />
    </div>
  )
}
