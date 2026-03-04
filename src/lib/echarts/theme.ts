import * as echarts from 'echarts'

export const ENTERPRISE_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

let _registered = false
export function registerEnterpriseTheme() {
  if (_registered) return
  echarts.registerTheme('enterprise', {
    color:           ENTERPRISE_COLORS,
    backgroundColor: 'transparent',
    textStyle:       { fontFamily: 'inherit', fontSize: 11 },
  })
  _registered = true
}
