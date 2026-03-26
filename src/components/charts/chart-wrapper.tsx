// src/components/charts/chart-wrapper.tsx
// ─────────────────────────────────────────
// Intentionally minimal — enforces the h-full + min-h-0 chain
// so ResponsiveContainer inside Recharts charts can measure correctly.
// Title/refresh are handled by WidgetCard header, NOT here.
'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ChartWrapperProps {
  children:   ReactNode
  className?: string
}

export function ChartWrapper({ children, className }: ChartWrapperProps) {
  return (
    <div
      className={cn(
        'w-full h-full min-h-0', // min-h-0 is critical for flex shrink to work
        className,
      )}
    >
      {children}
    </div>
  )
}