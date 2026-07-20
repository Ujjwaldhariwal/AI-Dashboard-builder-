'use client'

/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity, BarChart3, ChevronLeft, ChevronRight, CreditCard, Database,
  Gauge, Globe, Layers, LayoutDashboard, Radio, Signal, TrendingUp, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type ChartNavTree } from '@/lib/builder/chart-nav-model'

const GROUP_ICONS = [
  LayoutDashboard, Zap, BarChart3, Gauge, Activity, CreditCard, 
  TrendingUp, Layers, Radio, Signal, Globe, Database,
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
        'h-9 w-9 shrink-0 rounded-md border bg-background',
        'transition-colors hover:bg-muted',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
      aria-label={direction === 'left' ? 'View previous groups' : 'View next groups'}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
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
  const subgroups = useMemo(() => activeGroup?.sections ?? [], [activeGroup])
  
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

  // Keep the horizontal controls in sync with their overflow state.
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
    <nav
      className="sticky top-14 z-30 w-full border-b bg-background/95 px-4 py-3 supports-[backdrop-filter]:bg-background/90 supports-[backdrop-filter]:backdrop-blur-sm"
      onClick={(event) => event.stopPropagation()}
      aria-label="Chart categories"
    >
      <div className="mx-auto w-full max-w-[96rem] rounded-lg border bg-background">
        <div className="flex items-center gap-2 px-3 py-2">
          <GroupScrollButton direction="left" disabled={!canScrollLeft} onClick={() => scrollGroups('left')} />

          <div
            ref={groupScrollRef}
            className="flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="inline-flex min-w-max items-center gap-1 px-1">
              {groups.map((group, index) => {
                const Icon = GROUP_ICONS[index % GROUP_ICONS.length] as LucideIcon
                const isActive = index === activeGroupIndex

                return (
                  <button
                    key={group.id}
                    onClick={() => selectGroup(index)}
                    className={cn(
                      'group relative flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium whitespace-nowrap transition-colors',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-transparent bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    )}
                    aria-pressed={isActive}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{group.title}</span>
                    <span
                      className={cn(
                        'min-w-5 rounded px-1.5 py-0.5 text-center font-mono text-[10px] leading-none',
                        isActive ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-muted text-muted-foreground',
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

        <div className="border-t px-3 py-2">
          <div className="flex w-full overflow-x-auto [scrollbar-width:thin]">
            <div className="inline-flex min-w-max items-center gap-1 px-1">
              {subgroups.map((subgroup, index) => {
                const isActive = index === activeSubgroupIndex

                return (
                  <button
                    key={subgroup.id}
                    onClick={() => selectSubgroup(index)}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium whitespace-nowrap transition-colors',
                      isActive
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    aria-pressed={isActive}
                  >
                    <span>{subgroup.title}</span>
                    <span
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground"
                    >
                      {subgroup.widgetCount}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {showUngroupedHint && (
        <div className="pointer-events-none mx-auto mt-1 w-full max-w-7xl px-1">
          <div className="inline-flex items-center rounded-md border bg-background px-2 py-1 text-[10px] text-muted-foreground">
            Organize ungrouped widgets in the assistant to improve navigation.
          </div>
        </div>
      )}
    </nav>
  )
})
