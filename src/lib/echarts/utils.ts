// src/lib/echarts/utils.ts  ← NEW FILE
export function withAlpha(hex: string, alpha: number): string {
  const match = hex.replace('#', '').match(/^([a-f\d]{3}|[a-f\d]{6})$/i)
  if (!match) return hex
  const full = match[1].length === 3
    ? match[1].split('').map(c => c + c).join('')
    : match[1]
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
