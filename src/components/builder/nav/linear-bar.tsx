'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Database,
  Gauge,
  Globe,
  LayoutDashboard,
  Layers,
  Radio,
  Signal,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CHART_NAV_ALL,
  type ChartNavSelection,
  type ChartNavTree,
} from '@/lib/builder/chart-nav-model'

const GROUP_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#EF4444', '#84CC16',
] as const

const GROUP_ICONS = [
  LayoutDashboard,
  Zap,
  BarChart3,
  Gauge,
  Activity,
  CreditCard,
  TrendingUp,
  Layers,
  Radio,
  Signal,
  Globe,
  Database,
] as const

type GroupIcon = LucideIcon

export interface NavSelection {
  groupId: string
  subgroupId: string
}

interface FrozenChartNavProps {
  tree: ChartNavTree
  activeGroupId: string
  activeSubgroupId: string
  onSelectionChange: (sel: NavSelection) => void
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

interface NavRowSubgroup {
  id: string
  title: string
}

const GROUP_SCROLL_STEP = 180

function getGroupIcon(index: number): GroupIcon {
  return GROUP_ICONS[index % GROUP_ICONS.length]
}

function getGroupColor(index: number): string {
  return GROUP_COLORS[index % GROUP_COLORS.length]
}

function getOpacityByDistance(distance: number): number {
  if (distance <= 0) return 1
  if (distance === 1) return 0.72
  if (distance === 2) return 0.5
  return 0.35
}

function getCategoryWidgetCount(category: ChartNavTree['categories'][number]): number {
  if (typeof category.widgetCount === 'number') {
    return category.widgetCount
  }

  return category.subgroups.reduce((sum, subgroup) => {
    if (typeof subgroup.widgetCount === 'number') {
      return sum + subgroup.widgetCount
    }
    return sum + subgroup.charts.length
  }, 0)
}

export const FrozenChartNav = memo(function FrozenChartNav({
  tree,
  activeGroupId,
  activeSubgroupId,
  onSelectionChange,
  showUngroupedHint = false,
}: FrozenChartNavProps) {
  const groupScrollRef = useRef<HTMLDivElement>(null)
  const groupButtonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const [activeGroupIndex, setActiveGroupIndex] = useState(0)
  const [activeSubgroupIndex, setActiveSubgroupIndex] = useState(0)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const groups = useMemo<NavGroup[]>(() => {
    const mappedGroups: NavGroup[] = tree.categories.map(category => ({
      id: category.id,
      title: category.label,
      widgetCount: getCategoryWidgetCount(category),
      sections: category.subgroups.map(subgroup => ({
        id: subgroup.id,
        title: subgroup.label,
        widgetCount:
          typeof subgroup.widgetCount === 'number'
            ? subgroup.widgetCount
            : subgroup.charts.length,
      })),
    }))

    const totalWidgets = mappedGroups.reduce(
      (sum, category) => sum + category.widgetCount,
      0,
    )

    const allGroup: NavGroup = {
      id: CHART_NAV_ALL,
      title: 'All',
      widgetCount: totalWidgets,
      sections: [],
    }

    return [allGroup, ...mappedGroups]
  }, [tree.categories])

  const showGroupArrows = groups.length > 6
  const hasNavigableGroups = groups.length > 1

  const activeGroup = groups[activeGroupIndex] ?? groups[0]
  const activeGroupColor = getGroupColor(activeGroupIndex)
  const shouldShowSubgroupRow = (activeGroup?.sections.length ?? 0) > 1
  const visibleSubgroups = useMemo<NavRowSubgroup[]>(() => {
    if (!activeGroup || activeGroup.sections.length <= 1) {
      return activeGroup?.sections ?? []
    }

    return [
      { id: CHART_NAV_ALL, title: 'All' },
      ...activeGroup.sections.map(section => ({
        id: section.id,
        title: section.title,
      })),
    ]
  }, [activeGroup])

  const syncScrollButtons = useCallback(() => {
    const node = groupScrollRef.current
    if (!node || !showGroupArrows) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }

    setCanScrollLeft(node.scrollLeft > 2)
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 2)
  }, [showGroupArrows])

  useEffect(() => {
    const node = groupScrollRef.current
    if (!node) return

    syncScrollButtons()

    const handleScroll = () => syncScrollButtons()
    node.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      node.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [groups.length, syncScrollButtons])

  useEffect(() => {
    if (!groups.length) return

    const nextGroupIndex = Math.max(
      0,
      groups.findIndex(group => group.id === activeGroupId),
    )

    const nextGroup = groups[nextGroupIndex] ?? groups[0]
    const nextVisibleSubgroups: NavRowSubgroup[] =
      nextGroup.sections.length > 1
        ? [
          { id: CHART_NAV_ALL, title: 'All' },
          ...nextGroup.sections.map(section => ({
            id: section.id,
            title: section.title,
          })),
        ]
        : nextGroup.sections.map(section => ({
          id: section.id,
          title: section.title,
        }))

    const resolvedSubgroupIndex = nextVisibleSubgroups.findIndex(
      section => section.id === activeSubgroupId,
    )
    const nextSubgroupIndex = resolvedSubgroupIndex >= 0 ? resolvedSubgroupIndex : 0

    setActiveGroupIndex(nextGroupIndex)
    setActiveSubgroupIndex(nextSubgroupIndex)
  }, [activeGroupId, activeSubgroupId, groups])

  useEffect(() => {
    const node = groupButtonRefs.current[activeGroupIndex]
    node?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeGroupIndex])

  const selectGroupByIndex = useCallback(
    (index: number) => {
      const nextGroup = groups[index]
      if (!nextGroup) return

      setActiveGroupIndex(index)
      setActiveSubgroupIndex(0)

      onSelectionChange({
        groupId: nextGroup.id,
        subgroupId: CHART_NAV_ALL,
      })
    },
    [groups, onSelectionChange],
  )

  const handleGroupClick = useCallback(
    (index: number) => {
      selectGroupByIndex(index)
    },
    [selectGroupByIndex],
  )

  const handleSubgroupClick = useCallback(
    (index: number) => {
      const subgroup = visibleSubgroups[index]
      if (!activeGroup || !subgroup) return

      setActiveSubgroupIndex(index)
      onSelectionChange({
        groupId: activeGroup.id,
        subgroupId: subgroup.id === CHART_NAV_ALL ? CHART_NAV_ALL : subgroup.id,
      })
    },
    [activeGroup, onSelectionChange, visibleSubgroups],
  )

  const scrollGroupRow = useCallback((direction: 'left' | 'right') => {
    const node = groupScrollRef.current
    if (!node) return

    node.scrollBy({
      left: direction === 'left' ? -GROUP_SCROLL_STEP : GROUP_SCROLL_STEP,
      behavior: 'smooth',
    })
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const next = Math.max(0, activeGroupIndex - 1)
        if (next !== activeGroupIndex) {
          selectGroupByIndex(next)
        }
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        const next = Math.min(groups.length - 1, activeGroupIndex + 1)
        if (next !== activeGroupIndex) {
          selectGroupByIndex(next)
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeGroupIndex, groups.length, selectGroupByIndex])

  if (showUngroupedHint) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/80 backdrop-blur-md shadow-sm overflow-hidden mb-3">
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
          <Layers className="w-3.5 h-3.5" />
          {'Assign widgets to groups via AI Assistant -> Dashboard -> Groups'}
        </div>
      </div>
    )
  }

  if (!hasNavigableGroups) {
    return null
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background/80 backdrop-blur-md shadow-sm overflow-hidden mb-3">
      <div className="h-14 px-2 py-2 flex items-center gap-1.5">
        {showGroupArrows && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted/50 hover:bg-muted border border-border/40 transition-all duration-150 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            onClick={() => scrollGroupRow('left')}
            disabled={!canScrollLeft}
            aria-label="Scroll groups left"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </Button>
        )}

        <div
          ref={groupScrollRef}
          className="flex-1 flex items-center gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {groups.map((group, index) => {
            const isActive = index === activeGroupIndex
            const groupColor = getGroupColor(index)
            const IconComponent = getGroupIcon(index)
            const distance = Math.abs(index - activeGroupIndex)

            return (
              <button
                key={group.id}
                ref={node => {
                  groupButtonRefs.current[index] = node
                }}
                type="button"
                onClick={() => handleGroupClick(index)}
                className={cn(
                  'flex-shrink-0 flex flex-col items-center justify-center',
                  'h-[46px] min-w-[100px] max-w-[140px] px-3 rounded-lg',
                  'cursor-pointer select-none transition-all duration-200',
                  isActive
                    ? 'border shadow-sm'
                    : 'border border-transparent hover:bg-muted/60',
                )}
                style={{
                  opacity: getOpacityByDistance(distance),
                  borderColor: isActive ? `${groupColor}4D` : undefined,
                  backgroundColor: isActive ? `${groupColor}12` : undefined,
                }}
              >
                <IconComponent
                  size={15}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  className={cn(
                    'transition-colors duration-200',
                    isActive ? '' : 'text-muted-foreground',
                  )}
                  style={isActive ? { color: groupColor } : undefined}
                />
                <div className="flex items-center gap-1 max-w-full mt-1">
                  <span
                    className={cn(
                      'text-[11px] leading-none truncate transition-all duration-200',
                      isActive ? 'font-semibold' : 'font-medium text-muted-foreground',
                    )}
                    style={isActive ? { color: groupColor } : undefined}
                  >
                    {group.title}
                  </span>
                  <span
                    className={cn(
                      'text-[9px] font-mono rounded-full px-1.5 py-px leading-none flex-shrink-0',
                      isActive ? 'text-white' : 'bg-muted text-muted-foreground',
                    )}
                    style={isActive ? { backgroundColor: groupColor } : undefined}
                  >
                    {group.widgetCount}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {showGroupArrows && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted/50 hover:bg-muted border border-border/40 transition-all duration-150 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            onClick={() => scrollGroupRow('right')}
            disabled={!canScrollRight}
            aria-label="Scroll groups right"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {shouldShowSubgroupRow && activeGroup && (
          <>
            <div className="h-px bg-border/40" />
            <motion.div
              key={`subgroup-row-${activeGroupIndex}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 40 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
            <div className="h-10 bg-muted/25 px-3 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeGroupIndex}
                  className="flex items-center gap-1.5"
                >
                  {visibleSubgroups.map((subgroup, index) => {
                    const isActive = index === activeSubgroupIndex
                    return (
                      <motion.button
                        key={subgroup.id}
                        type="button"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{
                          delay: index * 0.04,
                          duration: 0.18,
                          ease: 'easeOut',
                        }}
                        onClick={() => handleSubgroupClick(index)}
                        className={cn(
                          'h-7 px-3.5 rounded-full text-[11px] font-medium',
                          'whitespace-nowrap flex-shrink-0 cursor-pointer',
                          'transition-all duration-150 active:scale-95',
                          isActive
                            ? 'text-white shadow-sm'
                            : 'bg-transparent text-muted-foreground border border-border/50 hover:bg-muted/60 hover:text-foreground',
                        )}
                        style={isActive ? { backgroundColor: activeGroupColor } : undefined}
                      >
                        {subgroup.title}
                      </motion.button>
                    )
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <LayoutGroup id="macos-group-dots">
        <div className="py-1.5 flex items-center justify-center gap-1.5">
          {groups.map((group, index) => {
            const isActive = index === activeGroupIndex
            return isActive ? (
              <motion.span
                key={group.id}
                layoutId="activeDot"
                className="rounded-full w-2 h-2"
                style={{ backgroundColor: getGroupColor(index) }}
              />
            ) : (
              <span
                key={group.id}
                className="rounded-full transition-all duration-300 w-1.5 h-1.5 bg-border"
              />
            )
          })}
        </div>
      </LayoutGroup>
    </div>
  )
})
