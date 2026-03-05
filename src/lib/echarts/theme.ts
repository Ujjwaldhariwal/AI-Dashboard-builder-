// src/lib/echarts/theme.ts

import * as echarts from 'echarts'

export const ENTERPRISE_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

let _registered = false

// ── Fix #8 — try/catch guards against echarts internal throws ─
// on hot reload in dev, echarts may throw if theme already exists
export function registerEnterpriseTheme() {
  if (_registered) return
  try {
    echarts.registerTheme('enterprise', {
      color:           ENTERPRISE_COLORS,
      backgroundColor: 'transparent',
      textStyle:       { fontFamily: 'inherit', fontSize: 11 },
    })
    _registered = true
  } catch {
    // Theme already registered from a previous hot-reload cycle — safe to ignore
    _registered = true
  }
}
