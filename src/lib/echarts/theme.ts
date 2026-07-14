// src/lib/echarts/theme.ts

import * as echarts from 'echarts'

import { DASHBOARDOS_COLORS } from '@/lib/dashboardos/theme'

export const ENTERPRISE_LIGHT_COLORS = [...DASHBOARDOS_COLORS.chartDefaults.light]
export const ENTERPRISE_DARK_COLORS = [...DASHBOARDOS_COLORS.chartDefaults.dark]
export const ENTERPRISE_COLORS = ENTERPRISE_LIGHT_COLORS

export function getEnterpriseChartColors(dark = false) {
  return dark ? [...ENTERPRISE_DARK_COLORS] : [...ENTERPRISE_LIGHT_COLORS]
}

export const BOSCH_COLORS = [
  '#E20015', '#007BC0', '#00A651', '#F5A623',
  '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50',
]

let enterpriseRegistered = false
let boschRegistered = false

// Guard against duplicate registration during hot reload.
export function registerEnterpriseTheme() {
  if (enterpriseRegistered) return
  try {
    echarts.registerTheme('enterprise', {
      color: ENTERPRISE_LIGHT_COLORS,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'inherit', fontSize: 11 },
    })
    echarts.registerTheme('enterprise-dark', {
      color: ENTERPRISE_DARK_COLORS,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'inherit', fontSize: 11 },
    })
  } finally {
    enterpriseRegistered = true
  }
}

// Guard against duplicate registration during hot reload.
export function registerBoschTheme() {
  if (boschRegistered) return
  try {
    echarts.registerTheme('bosch-uppcl', {
      color: BOSCH_COLORS,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'inherit', fontSize: 11 },
    })
  } finally {
    boschRegistered = true
  }
}
