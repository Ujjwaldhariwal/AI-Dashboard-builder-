// src/lib/echarts/theme.ts

import * as echarts from 'echarts'

export const ENTERPRISE_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

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
      color: ENTERPRISE_COLORS,
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
