'use client'

// Component: ChartWrapper
// src/components/charts/chart-wrapper.tsx

import type { ReactNode } from 'react'  // ← Fix #2 — proper ReactNode import
import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ChartWrapperProps {
  title:      string
  children:   ReactNode        // ← Fix #2
  onRefresh?: () => void
  isLoading?: boolean
  className?: string
}

export function ChartWrapper({
  title,
  children,
  onRefresh,
  isLoading = false,
  className,
}: ChartWrapperProps) {
  return (
    <div className={cn('h-full flex flex-col', className)}>
      <div className="flex items-center justify-between pb-2">
        <h3 className="text-sm font-semibold truncate">{title}</h3>
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
          </Button>
        )}
      </div>
      <div className="flex-1 relative">
        {/* ── Fix #5 — pointer-events-none on children while loading ── */}
        <div className={cn('h-full', isLoading && 'pointer-events-none select-none')}>
          {children}
        </div>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 rounded">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  )
}
