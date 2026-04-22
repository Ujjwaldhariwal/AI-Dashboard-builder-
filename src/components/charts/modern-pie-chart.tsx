'use client'

import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import { registerEnterpriseTheme } from '@/lib/echarts/theme'
import { getAxisColors, getTooltipStyle } from '@/lib/echarts/style-translator'
import { withAlpha } from '@/lib/echarts/utils'
import { sortNamedValues } from '@/lib/charts/domain-order'
import type { WidgetSizePreset } from '@/lib/builder/widget-size'

function useEnterpriseTheme() {
  useEffect(() => {
    registerEnterpriseTheme()
  }, [])
}

interface ModernPieChartProps {
  data: Record<string, unknown>[]
  nameField: string
  valueField: string
  title?: string
  donut?: boolean
  style?: WidgetStyle
  sizePreset?: WidgetSizePreset
}

interface PieSlice {
  name: string
  value: number
  actualValue: number
  actualPercent: number
}

interface TooltipParam {
  name?: string
  value?: number
  data?: {
    actualValue?: number
    actualPercent?: number
  }
}

interface LabelParam {
  name?: string
  data?: {
    actualPercent?: number
  }
}

const MIN_VISUAL_PERCENT = 4

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

function compactLabel(raw: string): string {
  const normalized = raw.trim().replace(/\s+/g, ' ')
  return normalized
    .replace(/^Between\s+(\d+)\s+(?:to|and)\s+(\d+)\s+Days?$/i, '$1-$2 Days')
    .replace(/^More than\s+(\d+)\s+days?$/i, '>$1 Days')
    .replace(/^Less than\s+(\d+)\s+days?$/i, '<$1 Days')
}

function wrapLabel(value: string, maxCharsPerLine: number, maxLines = 2): string {
  const source = value.trim().replace(/\s+/g, ' ')
  if (!source) return ''

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

    if (current) {
      pushCurrent()
    }

    if (word.length <= maxCharsPerLine) {
      current = word
      return
    }

    let remaining = word
    while (remaining.length > maxCharsPerLine) {
      lines.push(remaining.slice(0, maxCharsPerLine - 1) + '-')
      remaining = remaining.slice(maxCharsPerLine - 1)
      if (lines.length >= maxLines) break
    }
    current = remaining
  })

  pushCurrent()
  if (lines.length <= maxLines) return lines.join('\n')

  const visible = lines.slice(0, maxLines)
  visible[maxLines - 1] = truncate(visible[maxLines - 1], Math.max(6, maxCharsPerLine - 1))
  return visible.join('\n')
}

function resolveValueField(data: Record<string, unknown>[], requestedField: string): string {
  if (!data.length) return requestedField || ''
  const keys = Object.keys(data[0])
  const candidateKeys = requestedField && keys.includes(requestedField)
    ? [requestedField, ...keys.filter(key => key !== requestedField)]
    : keys

  if (keys.includes('value')) return 'value'

  let bestField = ''
  let bestScore = -1

  candidateKeys.forEach(key => {
    let score = 0
    data.slice(0, 150).forEach(row => {
      if (asFiniteNumber(row[key]) !== null) score += 1
    })

    if (score > bestScore) {
      bestScore = score
      bestField = key
    }
  })

  return bestScore > 0 ? bestField : ''
}

function resolveNameField(
  data: Record<string, unknown>[],
  requestedField: string,
  resolvedValueFieldName: string,
): string {
  if (!data.length) return requestedField || ''
  const keys = Object.keys(data[0])
  if (requestedField && keys.includes(requestedField)) return requestedField
  if (keys.includes('name')) return 'name'

  const preferred = ['label', 'category', 'type', 'title']
  for (const field of preferred) {
    if (keys.includes(field)) return field
  }

  const fallback = keys.find(key => key !== resolvedValueFieldName)
  return fallback ?? keys[0] ?? ''
}

function aggregateSlices(
  data: Record<string, unknown>[],
  nameField: string,
  valueField: string,
  maxSlices: number,
): PieSlice[] {
  if (!data.length) return []

  const grouped = new Map<string, number>()
  const hasNumericValues = valueField.length > 0

  data.forEach((row, index) => {
    const rawName = nameField ? row[nameField] : undefined
    const bucketName = truncate(String(rawName ?? `Item ${index + 1}`), 48)

    if (!hasNumericValues) {
      grouped.set(bucketName, (grouped.get(bucketName) ?? 0) + 1)
      return
    }

    const numericValue = asFiniteNumber(row[valueField]) ?? 0
    grouped.set(bucketName, (grouped.get(bucketName) ?? 0) + numericValue)
  })

  const sorted = [...grouped.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const limited = sorted.length > maxSlices
    ? [
        ...sorted.slice(0, maxSlices - 1),
        {
          name: 'Other',
          value: sorted.slice(maxSlices - 1).reduce((sum, item) => sum + item.value, 0),
        },
      ]
    : sorted

  const ordered = sortNamedValues(limited)
  const total = ordered.reduce((sum, item) => sum + item.value, 0)

  return ordered.map(item => ({
    name: item.name,
    value: item.value,
    actualValue: item.value,
    actualPercent: total > 0 ? (item.value / total) * 100 : 0,
  }))
}

function applyMinimumVisibilityScaling(slices: PieSlice[]): PieSlice[] {
  if (slices.length <= 1) return slices

  const minPercent = Math.min(
    MIN_VISUAL_PERCENT,
    Math.max(1, (100 / slices.length) * 0.8),
  )

  const small = slices.filter(slice => slice.actualPercent < minPercent)
  const large = slices.filter(slice => slice.actualPercent >= minPercent)

  if (small.length === 0 || large.length === 0) return slices

  const reservedForSmall = small.length * minPercent
  const remainingForLarge = Math.max(1, 100 - reservedForSmall)
  const largeActualTotal = large.reduce((sum, slice) => sum + slice.actualPercent, 0)

  return slices.map(slice => {
    if (slice.actualPercent < minPercent) {
      return {
        ...slice,
        value: minPercent,
      }
    }

    const scaledPercent = largeActualTotal > 0
      ? (slice.actualPercent / largeActualTotal) * remainingForLarge
      : remainingForLarge / Math.max(1, large.length)

    return {
      ...slice,
      value: scaledPercent,
    }
  })
}

export function ModernPieChart({
  data,
  nameField,
  valueField,
  donut = false,
  style,
  sizePreset = 'medium',
}: ModernPieChartProps) {
  useEnterpriseTheme()

  const s = { ...DEFAULT_STYLE, ...style }
  const axis = getAxisColors()
  const tt = getTooltipStyle(s)
  const displayLegend = s.showLegend !== false

  const maxSlices = sizePreset === 'small' ? 6 : sizePreset === 'medium' ? 8 : 10

  const resolvedFields = useMemo(() => {
    const resolvedValue = resolveValueField(data, valueField)
    const resolvedName = resolveNameField(data, nameField, resolvedValue)
    return {
      name: resolvedName,
      value: resolvedValue,
    }
  }, [data, nameField, valueField])

  const baseSlices = useMemo(
    () => aggregateSlices(data, resolvedFields.name, resolvedFields.value, maxSlices),
    [data, maxSlices, resolvedFields.name, resolvedFields.value],
  )

  const chartData = useMemo(
    () => applyMinimumVisibilityScaling(baseSlices),
    [baseSlices],
  )

  const total = useMemo(
    () => baseSlices.reduce((sum, item) => sum + item.actualValue, 0),
    [baseSlices],
  )

  const sliceMap = useMemo(
    () => Object.fromEntries(chartData.map(slice => [slice.name, slice])),
    [chartData],
  )

  if (!chartData.length) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-xs text-muted-foreground">
        No chartable rows
      </div>
    )
  }

  const showBottomLegend = displayLegend
  const shouldUseScrollableLegend = chartData.length > (sizePreset === 'small' ? 4 : 8)
  const legendLabelMaxChars = sizePreset === 'small' ? 14 : sizePreset === 'medium' ? 20 : 26
  const labelMaxChars = sizePreset === 'small' ? 12 : 16
  const compactedNames = useMemo(
    () => chartData.map(slice => compactLabel(slice.name)),
    [chartData],
  )
  const crowdedByCount = chartData.length >= (sizePreset === 'small' ? 5 : 7)
  const crowdedByLength = compactedNames.some(name => name.length > (sizePreset === 'small' ? 16 : 22))
  const needsCompactRadius = showBottomLegend && (crowdedByCount || crowdedByLength)

  const pieOuterRadiusPercent = sizePreset === 'small'
    ? (needsCompactRadius ? 66 : 72)
    : sizePreset === 'medium'
      ? (needsCompactRadius ? 70 : 76)
      : (needsCompactRadius ? 72 : 78)
  const donutInnerRadiusPercent = sizePreset === 'small'
    ? (needsCompactRadius ? 40 : 44)
    : sizePreset === 'medium'
      ? (needsCompactRadius ? 42 : 46)
      : (needsCompactRadius ? 44 : 48)
  const donutOuterRadiusPercent = sizePreset === 'small'
    ? (needsCompactRadius ? 66 : 72)
    : sizePreset === 'medium'
      ? (needsCompactRadius ? 70 : 76)
      : (needsCompactRadius ? 72 : 78)

  const centerY = showBottomLegend
    ? (sizePreset === 'small'
      ? (needsCompactRadius ? '49%' : '51%')
      : (needsCompactRadius ? '50%' : '52%'))
    : '50%'
  const center = ['50%', centerY]
  const donutRadius: [string, string] = [
    `${donutInnerRadiusPercent}%`,
    `${donutOuterRadiusPercent}%`,
  ]
  const pieOuterRadius = `${pieOuterRadiusPercent}%`
  const seriesBottom = showBottomLegend
    ? (sizePreset === 'small'
      ? (needsCompactRadius ? 20 : 24)
      : (needsCompactRadius ? 22 : 26))
    : 10

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 760,
    animationEasing: 'cubicOut' as const,
    backgroundColor: 'transparent',
    color: s.colors,
    tooltip: {
      trigger: 'item',
      ...tt,
      formatter: (param: TooltipParam) => {
        const name = String(param.name ?? 'Unknown')
        const actualValue = param.data?.actualValue ?? param.value ?? 0
        const actualPercent = param.data?.actualPercent ?? 0
        return `<b>${name}</b><br/>Value: <strong>${Number(actualValue).toLocaleString()}</strong><br/>${Number(actualPercent).toFixed(1)}%`
      },
    },
    legend: showBottomLegend
      ? {
          show: true,
          type: shouldUseScrollableLegend ? 'scroll' as const : 'plain' as const,
          orient: 'horizontal' as const,
          left: 'center',
          right: 'center',
          bottom: 4,
          width: '94%',
          itemWidth: 10,
          itemHeight: 10,
          itemGap: sizePreset === 'small' ? 10 : 12,
          pageIconColor: axis.label,
          pageTextStyle: { color: axis.label, fontSize: 10 },
          textStyle: {
            fontSize: sizePreset === 'small' ? 9 : 10,
            color: axis.label,
          },
          formatter: (name: string) => {
            const item = sliceMap[name]
            const percent = item ? ` ${item.actualPercent.toFixed(1)}%` : ''
            return `${truncate(compactLabel(name), legendLabelMaxChars)}${percent}`
          },
        }
      : { show: false },
    series: [{
      type: 'pie',
      left: '4%',
      right: '4%',
      top: 10,
      bottom: seriesBottom,
      center,
      radius: donut ? donutRadius : ['0%', pieOuterRadius],
      padAngle: donut ? 2 : 1.5,
      minAngle: 1.2,
      minShowLabelAngle: 0,
      avoidLabelOverlap: false,
      data: chartData,
      label: {
        show: true,
        position: 'outside' as const,
        alignTo: 'labelLine' as const,
        bleedMargin: sizePreset === 'small' ? 2 : 4,
        color: axis.label,
        fontSize: sizePreset === 'small' ? 9 : 10,
        lineHeight: sizePreset === 'small' ? 11 : 13,
        formatter: (param: LabelParam) => {
          const actualPercent = Number(param.data?.actualPercent ?? 0)
          const compact = compactLabel(String(param.name ?? ''))
          const wrapped = wrapLabel(compact, labelMaxChars, 2)
          const percent = `${actualPercent.toFixed(actualPercent >= 10 ? 0 : 1)}%`
          return wrapped.includes('\n') ? `${wrapped}\n${percent}` : `${wrapped} ${percent}`
        },
      },
      labelLayout: {
        hideOverlap: false,
        moveOverlap: 'shiftY',
      },
      labelLine: {
        show: true,
        length: 10,
        length2: 10,
        minTurnAngle: 30,
        lineStyle: {
          color: withAlpha(axis.label, 0.35),
          width: 1,
        },
      },
      itemStyle: {
        borderWidth: 1.5,
        borderColor: withAlpha(axis.border, 0.4),
        shadowBlur: 10,
        shadowColor: 'rgba(15,23,42,0.14)',
      },
      emphasis: {
        scale: true,
        scaleSize: 7,
        itemStyle: {
          shadowBlur: 20,
          shadowColor: 'rgba(15,23,42,0.28)',
        },
      },
    }],
    graphic: donut
      ? [
          {
            type: 'text',
            left: 'center',
            top: showBottomLegend ? '36%' : '40%',
            style: {
              text: Number(total).toLocaleString(),
              fontSize: sizePreset === 'small' ? 14 : 18,
              fontWeight: 700,
              fill: axis.label,
            },
          },
          {
            type: 'text',
            left: 'center',
            top: showBottomLegend ? '43%' : '47%',
            style: {
              text: 'Total',
              fontSize: 10,
              fill: withAlpha(axis.label, 0.68),
            },
          },
        ]
      : undefined,
  }), [
    axis.border,
    axis.label,
    center,
    chartData,
    donut,
    donutRadius,
    labelMaxChars,
    legendLabelMaxChars,
    pieOuterRadius,
    s.colors,
    seriesBottom,
    shouldUseScrollableLegend,
    showBottomLegend,
    sizePreset,
    sliceMap,
    total,
    tt,
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
