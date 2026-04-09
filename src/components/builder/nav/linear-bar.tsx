'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity, BarChart3, ChevronLeft, ChevronRight, CreditCard, Database,
  Gauge, Globe, Layers, LayoutDashboard, Radio, Signal, TrendingUp, Zap,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type ChartNavTree } from '@/lib/builder/chart-nav-model'

const GROUP_ICONS = [
  LayoutDashboard, Zap, BarChart3, Gauge, Activity, CreditCard, 
  TrendingUp, Layers, Radio, Signal, Globe, Database,
] as const

const GROUP_COLORS = [
  '#2563EB', '#0891B2', '#059669', '#7C3AED', 
  '#EA580C', '#DB2777', '#DC2626', '#4F46E5',
] as const

const SUBGROUP_COLORS = [
  '#3B82F6', '#10B981', '#F97316', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#EAB308', '#EF4444',
] as const

const GROUP_SCROLL_STEP = 200

export interface NavSelection {
  groupId: string
  subgroupId: string
}

interface FrozenChartNavProps {
  tree: ChartNavTree
  activeGroupId: string
  activeSubgroupId: string
  onSelectionChange: (selection: NavSelection) => void
  showUngroupedHint?: boolean
}

interface NavSubgroup {
  id: string
  title: string
  widgetCount: number
}

interface NavGroup {
  id: string
  title: string
  widgetCount: number
  sections: NavSubgroup[]
}

function getCategoryWidgetCount(category: ChartNavTree['categories'][number]): number {
  if (typeof category.widgetCount === 'number') return category.widgetCount
  return category.subgroups.reduce((sum, sub) => {
    return sum + (typeof sub.widgetCount === 'number' ? sub.widgetCount : sub.charts.length)
  }, 0)
}

// 1. Memoized color cache to prevent recalculating on every single render
const rgbaCache = new Map<string, string>()
function hexToRgba(hex: string, alpha: number): string {
  const key = `${hex}-${alpha}`
  if (rgbaCache.has(key)) return rgbaCache.get(key)!
  
  const clean = hex.replace('#', '')
  const parsed = Number.parseInt(clean, 16)
  const red = (parsed >> 16) & 255
  const green = (parsed >> 8) & 255
  const blue = parsed & 255
  
  const result = `rgba(${red}, ${green}, ${blue}, ${alpha})`
  rgbaCache.set(key, result)
  return result
}

function GroupScrollButton({
  direction, disabled, onClick,
}: {
  direction: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-7 w-7 shrink-0 rounded-full border border-border/60 bg-background/95',
        'hover:bg-muted/70 transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
      aria-label={direction === 'left' ? 'View previous groups' : 'View next groups'}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
    </Button>
  )
}

export const FrozenChartNav = memo(function FrozenChartNav({
  tree,
  activeGroupId,
  activeSubgroupId,
  onSelectionChange,
  showUngroupedHint = false,
}: FrozenChartNavProps) {
  const groupScrollRef = useRef<HTMLDivElement>(null)

  const [isScrolled, setIsScrolled] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // 2. Data calculation optimized and stable
  const groups = useMemo<NavGroup[]>(
    () =>
      tree.categories.map((category) => ({
        id: category.id,
        title: category.label,
        widgetCount: getCategoryWidgetCount(category),
        sections: category.subgroups.map((sub) => ({
          id: sub.id,
          title: sub.label,
          widgetCount: typeof sub.widgetCount === 'number' ? sub.widgetCount : sub.charts.length,
        })),
      })),
    [tree.categories],
  )

  // 3. Derived state replacing anti-pattern `useEffect` to prevent double-renders
  const activeGroupIndex = useMemo(() => 
    Math.max(0, groups.findIndex((group) => group.id === activeGroupId)), 
  [groups, activeGroupId])
  
  const activeGroup = groups[activeGroupIndex] ?? null
  const subgroups = activeGroup?.sections ?? []
  
  const activeSubgroupIndex = useMemo(() => 
    Math.max(0, subgroups.findIndex((subgroup) => subgroup.id === activeSubgroupId)),
  [subgroups, activeSubgroupId])

  const syncGroupScrollButtons = useCallback(() => {
    const node = groupScrollRef.current
    if (!node) return
    setCanScrollLeft(node.scrollLeft > 2)
    // Use Math.ceil to prevent sub-pixel rounding issues on zoomed displays
    setCanScrollRight(Math.ceil(node.scrollLeft + node.clientWidth) < node.scrollWidth - 2)
  }, [])

  // 4. requestAnimationFrame throttling for window scroll
  useEffect(() => {
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsScrolled(window.scrollY > 48)
          ticking = false
        })
        ticking = true
      }
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 5. requestAnimationFrame throttling for horizontal container scrolling
  useEffect(() => {
    const node = groupScrollRef.current
    if (!node) return

    syncGroupScrollButtons()

    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          syncGroupScrollButtons()
          ticking = false
        })
        ticking = true
      }
    }

    node.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      node.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [groups.length, syncGroupScrollButtons])

  const selectGroup = useCallback(
    (index: number) => {
      const nextGroup = groups[index]
      if (!nextGroup?.sections[0]) return
      onSelectionChange({ groupId: nextGroup.id, subgroupId: nextGroup.sections[0].id })
    },
    [groups, onSelectionChange],
  )

  const selectSubgroup = useCallback(
    (index: number) => {
      const nextSubgroup = subgroups[index]
      if (!activeGroup || !nextSubgroup) return
      onSelectionChange({ groupId: activeGroup.id, subgroupId: nextSubgroup.id })
    },
    [activeGroup, subgroups, onSelectionChange],
  )

  const scrollGroups = useCallback((direction: 'left' | 'right') => {
    groupScrollRef.current?.scrollBy({
      left: direction === 'left' ? -GROUP_SCROLL_STEP : GROUP_SCROLL_STEP,
      behavior: 'smooth',
    })
  }, [])

  if (!groups.length) return null

  return (
    <div
      className={cn(
        'sticky top-[3.5rem] z-[60] w-full px-4 py-2.5 transition-all duration-300',
        isScrolled ? 'drop-shadow-[0_8px_16px_rgba(15,23,42,0.08)]' : '',
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          'mx-auto w-full max-w-7xl rounded-[20px] border border-border/60 bg-background/80 backdrop-blur-xl transition-all duration-300',
          isScrolled
            ? 'shadow-[0_12px_30px_-18px_rgba(15,23,42,0.4)]'
            : 'shadow-[0_4px_16px_-14px_rgba(15,23,42,0.3)]',
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <GroupScrollButton direction="left" disabled={!canScrollLeft} onClick={() => scrollGroups('left')} />

          <div
            ref={groupScrollRef}
            className="flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="inline-flex min-w-max items-center gap-2.5 px-1">
              {groups.map((group, index) => {
                const Icon = GROUP_ICONS[index % GROUP_ICONS.length] as LucideIcon
                const color = GROUP_COLORS[index % GROUP_COLORS.length]
                const isActive = index === activeGroupIndex

                return (
                  <button
                    key={group.id}
                    onClick={() => selectGroup(index)}
                    className={cn(
                      'group relative flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-200',
                      isActive
                        ? 'text-white shadow-md'
                        : 'border-border/65 bg-background/80 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
                    )}
                    style={
                      isActive
                        ? {
                            borderColor: hexToRgba(color, 0.7),
                            background: `linear-gradient(135deg, ${color} 0%, ${hexToRgba(color, 0.88)} 100%)`,
                          }
                        : undefined
                    }
                  >
                    {!isActive && (
                      <span
                        className="absolute inset-0 rounded-full border"
                        style={{ borderColor: hexToRgba(color, 0.35) }}
                      />
                    )}
                    <Icon className={cn('relative z-10 h-3.5 w-3.5 shrink-0 transition-transform', isActive && 'scale-105')} />
                    <span className="relative z-10">{group.title}</span>
                    <span
                      className={cn(
                        'relative z-10 rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                        isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground group-hover:bg-muted-foreground/20',
                      )}
                    >
                      {group.widgetCount}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <GroupScrollButton direction="right" disabled={!canScrollRight} onClick={() => scrollGroups('right')} />
        </div>

        <div className="border-t border-border/50 px-4 py-3">
          <div className="flex w-full items-center justify-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <motion.div
              key={activeGroup?.id}
              initial={{ opacity: 0, scale: 0.98, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.16 }}
              className="inline-flex min-w-max items-center justify-center gap-2.5 px-1.5"
            >
              {subgroups.map((subgroup, index) => {
                const subgroupColor = SUBGROUP_COLORS[index % SUBGROUP_COLORS.length]
                const isActive = index === activeSubgroupIndex

                return (
                  <button
                    key={subgroup.id}
                    onClick={() => selectSubgroup(index)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-200',
                      isActive
                        ? 'text-white shadow-md scale-105 transition-transform'
                        : 'text-foreground/85 hover:text-foreground',
                    )}
                    style={
                      isActive
                        ? {
                            borderColor: hexToRgba(subgroupColor, 0.7),
                            background: `linear-gradient(135deg, ${subgroupColor} 0%, ${hexToRgba(subgroupColor, 0.86)} 100%)`,
                          }
                        : {
                            borderColor: hexToRgba(subgroupColor, 0.4),
                            backgroundColor: hexToRgba(subgroupColor, 0.12),
                          }
                    }
                  >
                    <span>{subgroup.title}</span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] leading-none"
                      style={{
                        backgroundColor: isActive ? hexToRgba('#FFFFFF', 0.22) : hexToRgba(subgroupColor, 0.2),
                        color: isActive ? '#FFFFFF' : subgroupColor,
                      }}
                    >
                      {subgroup.widgetCount}
                    </span>
                  </button>
                )
              })}
            </motion.div>
          </div>
        </div>
      </div>

      {showUngroupedHint && (
        <div className="pointer-events-none mx-auto mt-1 w-full max-w-7xl px-1">
          <div className="inline-flex items-center rounded-full border border-border/60 bg-background/85 px-2 py-0.5 text-[10px] text-muted-foreground">
            Group widgets from AI Assistant for cleaner navigation
          </div>
        </div>
      )}
    </div>
  )
})