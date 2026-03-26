// src/lib/builder/widget-size.ts
// Widget size presets and utilities
// ─────────────────────────────────
// KEY FIXES:
//  • min-h → h (fixed height so ResponsiveContainer has a ceiling)
//  • Added md: breakpoint classes for tablet layout
//  • Responsive height variants (mobile → desktop)

import type { WidgetPosition } from '@/types/widget'

export type WidgetSizePreset = 'small' | 'medium' | 'large' | 'full'

const PRESET_POSITION: Record<WidgetSizePreset, Pick<WidgetPosition, 'w' | 'h'>> = {
  small:  { w: 4,  h: 4 },
  medium: { w: 6,  h: 5 },
  large:  { w: 8,  h: 6 },
  full:   { w: 12, h: 7 },
}

export function getWidgetSizePreset(position?: WidgetPosition): WidgetSizePreset {
  const width = position?.w ?? PRESET_POSITION.medium.w
  if (width >= PRESET_POSITION.full.w)   return 'full'
  if (width >= PRESET_POSITION.large.w)  return 'large'
  if (width >= PRESET_POSITION.medium.w) return 'medium'
  return 'small'
}

export function getWidgetSizeFromPreset(preset: WidgetSizePreset): Pick<WidgetPosition, 'w' | 'h'> {
  return PRESET_POSITION[preset]
}

/**
 * Grid span classes with md: breakpoints so tablet isn't all full-width.
 * mobile = col-span-1 (full width in single-col)
 * tablet = md:col-span-1 or md:col-span-2 (2-col grid)
 * desktop = lg:col-span-N (12-col grid)
 */
export function getWidgetGridSpanClass(position?: WidgetPosition): string {
  const preset = getWidgetSizePreset(position)
  if (preset === 'full')   return 'col-span-1 md:col-span-2 lg:col-span-12'
  if (preset === 'large')  return 'col-span-1 md:col-span-2 lg:col-span-8'
  if (preset === 'medium') return 'col-span-1 md:col-span-1 lg:col-span-6'
  return                          'col-span-1 md:col-span-1 lg:col-span-4'
}

/**
 * CRITICAL FIX: Uses `h-[]` (fixed height) instead of `min-h-[]`.
 * ResponsiveContainer height="100%" needs a bounded ancestor —
 * min-h has no ceiling, causing infinite chart growth on re-render.
 * Responsive: smaller on mobile, larger on lg+ screens.
 */
export function getWidgetCardHeightClass(position?: WidgetPosition): string {
  const height = position?.h ?? PRESET_POSITION.medium.h
  if (height >= 7) return 'h-[480px] lg:h-[560px]'
  if (height >= 6) return 'h-[420px] lg:h-[500px]'
  if (height >= 5) return 'h-[360px] lg:h-[440px]'
  if (height >= 4) return 'h-[320px] lg:h-[380px]'
  return                  'h-[280px] lg:h-[340px]'
}

export const WIDGET_SIZE_LABEL: Record<WidgetSizePreset, string> = {
  small:  'Small',
  medium: 'Medium',
  large:  'Large',
  full:   'Full Width',
}