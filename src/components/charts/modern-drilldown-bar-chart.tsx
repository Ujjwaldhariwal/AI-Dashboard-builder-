'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import { Button } from '@/components/ui/button'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'
import { withAlpha } from '@/lib/echarts/utils'

function useEnterpriseTheme() {
  useEffect(() => { registerEnterpriseTheme() }, [])
}

interface ModernDrilldownBarChartProps {
  data: Record<string, unknown>[]
  xField: string
  yField: string
  drillField?: string
  style?: WidgetStyle
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
}: ModernDrilldownBarChartProps) {
  useEnterpriseTheme()

  const s = { ...DEFAULT_STYLE, ...style }
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)

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
  const subtitle = selectedPrimary && drillField
    ? `${selectedPrimary} -> ${drillField}`
    : xField

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 700,
    animationEasing: 'cubicOut' as const,
    backgroundColor: 'transparent',
    color: s.colors,
    grid: { top: 12, right: 12, bottom: 42, left: 10, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tt,
      valueFormatter: (v: number) => fmtValue(v, s.labelFormat),
    },
    xAxis: {
      type: 'category',
      data: rows.map(row => row.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: axis.label,
        fontSize: 10,
        rotate: rows.length > 8 ? -28 : 0,
        formatter: (v: string) => v.length > 18 ? `${v.slice(0, 16)}..` : v,
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
    series: [
      {
        type: 'bar',
        data: rows.map(row => row.value),
        barMaxWidth: 42,
        itemStyle: {
          borderRadius: [8, 8, 0, 0],
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(s.colors[0] ?? '#3b82f6', 0.95) },
            { offset: 1, color: withAlpha(s.colors[0] ?? '#3b82f6', 0.58) },
          ]),
          shadowBlur: 9,
          shadowColor: withAlpha(s.colors[0] ?? '#3b82f6', 0.35),
        },
      },
    ],
  }), [axis.label, axis.splitLine, rows, s, tt])

  return (
    <div className="space-y-2">
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
        style={{ height: 300, width: '100%' }}
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
