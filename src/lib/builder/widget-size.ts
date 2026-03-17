import type { WidgetPosition } from '@/types/widget'

export type WidgetSizePreset = 'small' | 'medium' | 'large' | 'full'

const PRESET_POSITION: Record<WidgetSizePreset, Pick<WidgetPosition, 'w' | 'h'>> = {
  small: { w: 4, h: 4 },
  medium: { w: 6, h: 5 },
  large: { w: 8, h: 6 },
  full: { w: 12, h: 7 },
}

export function getWidgetSizePreset(position?: WidgetPosition): WidgetSizePreset {
  const width = position?.w ?? PRESET_POSITION.medium.w
  if (width >= PRESET_POSITION.full.w) return 'full'
  if (width >= PRESET_POSITION.large.w) return 'large'
  if (width >= PRESET_POSITION.medium.w) return 'medium'
  return 'small'
}

export function getWidgetSizeFromPreset(preset: WidgetSizePreset): Pick<WidgetPosition, 'w' | 'h'> {
  return PRESET_POSITION[preset]
}

export function getWidgetGridSpanClass(position?: WidgetPosition): string {
  const preset = getWidgetSizePreset(position)
  if (preset === 'full') return 'lg:col-span-12'
  if (preset === 'large') return 'lg:col-span-8'
  if (preset === 'medium') return 'lg:col-span-6'
  return 'lg:col-span-4'
}

export function getWidgetCardHeightClass(position?: WidgetPosition): string {
  const height = position?.h ?? PRESET_POSITION.medium.h
  if (height >= 7) return 'min-h-[560px]'
  if (height >= 6) return 'min-h-[500px]'
  if (height >= 5) return 'min-h-[440px]'
  if (height >= 4) return 'min-h-[380px]'
  return 'min-h-[340px]'
}

export const WIDGET_SIZE_LABEL: Record<WidgetSizePreset, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  full: 'Full',
}

