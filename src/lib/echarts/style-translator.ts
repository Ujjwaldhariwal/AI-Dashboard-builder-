// src/lib/echarts/style-translator.ts

import type { WidgetStyle } from '@/types/widget'
import type { DashboardChartNumberFormat } from '@/types/dashboard-chart'

export function isDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

// ── Fix #7 — document reactivity limitation ───────────────────
// getAxisColors() and getTooltipStyle() read the DOM at call time.
// They are called inside useMemo() in chart components, so they
// reflect the theme correctly on initial render and whenever
// the chart re-renders (e.g. data change, style update).
// They do NOT auto-update on theme toggle without a re-render.
// If live theme switching is needed, use useIsDarkMode() hook
// from modern-gauge-chart.tsx and pass dark as a prop instead.

export function getAxisColors() {
  const dark = isDarkMode()
  return {
    label:     dark ? '#94a3b8' : '#64748b',
    splitLine: dark ? '#1e293b' : '#f1f5f9',
    border:    dark ? '#334155' : '#e2e8f0',
  }
}

export function getTooltipStyle(style?: WidgetStyle) {
  const dark = isDarkMode()
  return {
    backgroundColor: style?.tooltipBg    ?? (dark ? '#1e2433' : '#ffffff'),
    borderColor:     style?.tooltipBorder ?? (dark ? '#334155' : '#e2e8f0'),
    textStyle:       { color: style?.tooltipTextColor ?? (dark ? '#e2e8f0' : '#1e293b'), fontSize: 11 },
    padding:         [6, 10] as [number, number],
    extraCssText:    'max-width:320px;white-space:normal;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);',
  }
}

export function formatChartNumber(
  value: unknown,
  format: DashboardChartNumberFormat,
): string {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return String(value ?? '')

  const boundedDigits = (digits: unknown, fallback: number) => (
    typeof digits === 'number' && Number.isFinite(digits)
      ? Math.max(0, Math.min(4, Math.trunc(digits)))
      : fallback
  )
  const minimumFractionDigits = boundedDigits(format.minimumFractionDigits, 0)
  const maximumFractionDigits = Math.max(
    minimumFractionDigits,
    boundedDigits(format.maximumFractionDigits, format.style === 'decimal' ? 2 : 1),
  )
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: format.useGrouping ?? true,
  }
  let normalizedValue = parsed

  if (format.style === 'currency') {
    options.style = 'currency'
    options.currency = ['USD', 'EUR', 'GBP', 'INR', 'JPY'].includes(format.currency ?? '')
      ? format.currency
      : 'USD'
    options.currencyDisplay = 'narrowSymbol'
  } else if (format.style === 'percent') {
    options.style = 'percent'
    if (format.percentScale === 'whole') normalizedValue /= 100
  } else if (format.style === 'compact') {
    options.notation = 'compact'
    options.compactDisplay = 'short'
  } else {
    options.style = 'decimal'
  }

  try {
    return new Intl.NumberFormat('en-US', options).format(normalizedValue)
  } catch {
    return parsed.toLocaleString('en-US')
  }
}

export function fmtValue(
  v: number,
  format?: WidgetStyle['labelFormat'],
  numberFormat?: DashboardChartNumberFormat,
): string {
  if (numberFormat) return formatChartNumber(v, numberFormat)
  if (format === 'currency') return `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString()}`
  if (format === 'percent')  return `${v.toFixed(1)}%`
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return v.toLocaleString()
}
