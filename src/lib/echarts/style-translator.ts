// src/lib/echarts/style-translator.ts

import type { WidgetStyle } from '@/types/widget'

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
    textStyle:       { color: dark ? '#e2e8f0' : '#1e293b', fontSize: 11 },
    padding:         [6, 10] as [number, number],
    extraCssText:    'border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);',
  }
}

export function fmtValue(v: number, format?: string): string {
  if (format === 'currency') return `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString()}`
  if (format === 'percent')  return `${v.toFixed(1)}%`
  if (v >= 1_000_000)        return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)            return `${(v / 1_000).toFixed(1)}k`
  return v.toLocaleString()
}
