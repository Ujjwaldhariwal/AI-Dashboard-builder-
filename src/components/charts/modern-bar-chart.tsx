'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { graphic } from 'echarts'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle, fmtValue } from '@/lib/echarts/style-translator'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'
import {
  getCategoryTickInterval,
  getChartMargin,
  getLegendVisibility,
  showValueLabels,
} from '@/lib/charts/chart-constants'

function useEnterpriseTheme() {
  useEffect(() => {
    registerEnterpriseTheme()
  }, [])
}

function withAlpha(hex: string, alpha: number): string {
  const match = hex.replace('#', '').match(/^([a-f\d]{3}|[a-f\d]{6})$/i)
  if (!match) return hex

  const full = match[1].length === 3
    ? match[1].split('').map(ch => ch + ch).join('')
    : match[1]

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface TooltipParam {
  name: string
  seriesName: string
  value: number
  data?: {
    rawValue?: number
  }
}

interface ModernBarChartProps {
  data: Record<string, unknown>[]
  xField: string
  yField: string
  title?: string
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
  logarithmic?: boolean
}

type XAxisLayout = {
  shouldRotate: boolean
  angle: number
  bottomPadding: number
  maxCharsPerLine: number
  maxLines: number
}

const ISO_DATE_PATTERN = /^\d{4}[-/]\d{2}[-/]\d{2}(?:[T\s].*)?$/

function toCompactDateLabel(raw: string): string {
  if (!ISO_DATE_PATTERN.test(raw)) return raw

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(parsed)
}

function normalizeLabel(value: unknown, fallback: string): string {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ')
  if (!text) return fallback
  return toCompactDateLabel(text)
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function breakLabelIntoLines(text: string, maxCharsPerLine: number, maxLines: number): string {
  const source = text.trim().replace(/\s+/g, ' ')
  if (!source) return ''
  if (source.length <= maxCharsPerLine) return source

  const separators = ['_', '-', ' ']
  for (const sep of separators) {
    const sepIndex = source.indexOf(sep, Math.floor(source.length / 2))
    if (sepIndex > 0 && sepIndex < source.length - 3) {
      const first = source.slice(0, sepIndex)
      const second = source.slice(sepIndex + sep.length)
      const lines = [first, second].slice(0, maxLines)
      const lastIdx = lines.length - 1
      if (second.length > maxCharsPerLine) {
        lines[lastIdx] = second.slice(0, Math.max(6, maxCharsPerLine - 1)) + '...'
      }
      return lines.join('\n')
    }
  }

  const words = source.split(' ')
  const lines: string[] = []
  let current = ''

  const pushCurrent = () => {
    if (!current) return
    lines.push(current)
    current = ''
  }

  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharsPerLine) {
      current = candidate
      return
    }

    if (current) pushCurrent()

    if (word.length <= maxCharsPerLine) {
      current = word
      return
    }

    lines.push(word.slice(0, Math.max(6, maxCharsPerLine - 1)) + '...')
  })

  pushCurrent()

  if (lines.length <= maxLines) return lines.join('\n')

  const visible = lines.slice(0, maxLines)
  const lastIdx = visible.length - 1
  visible[lastIdx] = visible[lastIdx].slice(0, Math.max(6, maxCharsPerLine - 1)) + '...'
  return visible.join('\n')
}

function getXAxisLayout(labels: string[]): XAxisLayout {
  if (!labels.length) {
    return {
      shouldRotate: false,
      angle: 0,
      bottomPadding: 14,
      maxCharsPerLine: 12,
      maxLines: 1,
    }
  }

  const lengths = labels.map(label => label.length)
  const maxLength = Math.max(...lengths)
  const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length
  const shouldRotate = maxLength > 15 || avgLength > 10 || (labels.length > 8 && avgLength > 8)

  if (!shouldRotate) {
    return {
      shouldRotate: false,
      angle: 0,
      bottomPadding: 14,
      maxCharsPerLine: maxLength > 16 ? 14 : 12,
      maxLines: 1,
    }
  }

  if (maxLength > 25) {
    return {
      shouldRotate: true,
      angle: -45,
      bottomPadding: Math.min(78, Math.max(58, Math.round(maxLength * 1.4))),
      maxCharsPerLine: 16,
      maxLines: 2,
    }
  }

  if (maxLength > 15) {
    return {
      shouldRotate: true,
      angle: -35,
      bottomPadding: Math.min(68, Math.max(52, Math.round(maxLength * 1.3))),
      maxCharsPerLine: 16,
      maxLines: 2,
    }
  }

  return {
    shouldRotate: true,
    angle: -25,
    bottomPadding: 46,
    maxCharsPerLine: 14,
    maxLines: 2,
  }
}

function fmtAxisTick(v: number, format: WidgetStyle['labelFormat'], logarithmic: boolean): string {
  if (logarithmic && v < 1) return v.toFixed(2)
  return fmtValue(v, format)
}

export function ModernBarChart({
  data,
  xField,
  yField,
  style,
  sizePreset = 'medium',
  logarithmic = false,
}: ModernBarChartProps) {
  useEnterpriseTheme()

  const s = useMemo(() => ({ ...DEFAULT_STYLE, ...style }), [style])
  const colors = s.colors
  const r = s.barRadius ?? 5

  const chartData = useMemo(() => {
    const isNumeric = data.some(row => !isNaN(Number(row?.[yField])))

    if (isNumeric) {
      return data.slice(0, 30).map((item, i) => ({
        name: normalizeLabel(item[xField], `#${i + 1}`).slice(0, 72),
        value: parseNumber(item[yField]),
      }))
    }

    const counts: Record<string, number> = {}
    data.forEach(item => {
      const key = normalizeLabel(item[xField], 'Unknown').slice(0, 72)
      counts[key] = (counts[key] ?? 0) + 1
    })

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, value]) => ({ name, value }))
  }, [data, xField, yField])

  const labelLayout = useMemo(
    () => getXAxisLayout(chartData.map(point => point.name)),
    [chartData],
  )

  const processedSeriesData = useMemo(
    () => chartData.map(point => ({
      ...point,
      value: logarithmic && point.value <= 0 ? 0.1 : point.value,
      rawValue: point.value,
    })),
    [chartData, logarithmic],
  )

  const margin = getChartMargin(sizePreset)
  const tickInterval = getCategoryTickInterval(sizePreset, chartData.length)
  const displayLegend = getLegendVisibility(sizePreset, s.showLegend)
  const displayLabels = showValueLabels(sizePreset, chartData.length)
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)
  const barMaxWidth = chartData.length <= 6 ? 34 : chartData.length <= 12 ? 28 : 22

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 700,
    animationEasing: 'cubicOut' as const,
    backgroundColor: 'transparent',
    color: colors,
    grid: {
      top: margin.top + (displayLegend ? 18 : 0),
      right: margin.right,
      bottom: margin.bottom + labelLayout.bottomPadding + (displayLegend && sizePreset !== 'medium' ? 14 : 0),
      left: margin.left,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tt,
      formatter: (params: TooltipParam[]) => {
        const first = params[0]
        const rawValue = first?.data?.rawValue ?? first?.value ?? 0
        return `<b style="font-size:12px">${first?.name ?? ''}</b><br/>${first?.seriesName ?? ''}: <strong>${fmtValue(Number(rawValue), s.labelFormat)}</strong>`
      },
    },
    xAxis: {
      type: 'category',
      data: chartData.map(d => d.name),
      axisLabel: {
        color: axis.label,
        fontSize: labelLayout.shouldRotate ? 10 : (chartData.length > 15 ? 10 : 11),
        rotate: labelLayout.shouldRotate ? labelLayout.angle : 0,
        interval: tickInterval,
        hideOverlap: !labelLayout.shouldRotate,
        lineHeight: labelLayout.shouldRotate ? 12 : 14,
        margin: labelLayout.shouldRotate ? 18 : 10,
        formatter: (value: string) =>
          breakLabelIntoLines(value, labelLayout.maxCharsPerLine, labelLayout.maxLines),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: logarithmic ? 'log' : 'value',
      min: logarithmic ? 0.1 : 0,
      logBase: logarithmic ? 10 : undefined,
      axisLabel: {
        color: axis.label,
        fontSize: 11,
        formatter: (v: number) => fmtAxisTick(v, s.labelFormat, logarithmic),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: s.showGrid,
        lineStyle: { type: 'dashed' as const, color: axis.splitLine },
      },
    },
    legend: displayLegend
      ? sizePreset === 'medium'
        ? {
            show: true,
            top: margin.top - 4,
            right: margin.right,
            textStyle: { fontSize: 10, color: axis.label },
          }
        : {
            show: true,
            bottom: margin.bottom - 8,
            textStyle: { fontSize: 11, color: axis.label },
          }
      : { show: false },
    series: [{
      type: 'bar',
      name: yField,
      barMaxWidth,
      label: displayLabels
        ? {
            show: true,
            position: 'top',
            fontSize: 10,
            color: axis.label,
            formatter: (p: { data?: { rawValue?: number }; value: number }) => {
              const rawValue = p?.data?.rawValue ?? p.value
              return fmtValue(Number(rawValue), s.labelFormat)
            },
          }
        : { show: false },
      data: processedSeriesData.map((point, i) => ({
        value: point.value,
        rawValue: point.rawValue,
        itemStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(colors[i % colors.length], 1) },
            { offset: 1, color: withAlpha(colors[i % colors.length], 0.55) },
          ]),
          borderRadius: [r, r, 0, 0],
        },
      })),
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' },
      },
    }],
  }), [
    axis,
    barMaxWidth,
    chartData,
    colors,
    displayLabels,
    displayLegend,
    labelLayout,
    logarithmic,
    margin,
    processedSeriesData,
    r,
    s,
    sizePreset,
    tickInterval,
    tt,
    yField,
  ])

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
