'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlignLeft,
  AreaChart,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Circle,
  Gauge,
  LineChart,
  PieChart,
  Table2,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CHART_NAV_ALL, type ChartNavTree } from '@/lib/builder/chart-nav-model'
import { cn } from '@/lib/utils'
import type { ChartType } from '@/types/widget'

export interface NavSelection {
  groupId: string
  subgroupId: string
}

export interface WidgetTabItem {
  id: string
  title: string
  type?: ChartType | string
}

interface FrozenChartNavProps {
  items?: WidgetTabItem[]
  activeWidgetId?: string | null
  onWidgetSelect?: (widgetId: string) => void

  // Legacy props kept for compatibility with existing viewer usage.
  tree?: ChartNavTree
  activeGroupId?: string
  activeSubgroupId?: string
  onSelectionChange?: (sel: NavSelection) => void
}

type InternalTab = {
  id: string
  label: string
  type?: ChartType | string
  groupId?: string
  subgroupId?: string
}

const MAX_LABEL_LENGTH = 16
const SCROLL_STEP_PX = 240

const chartTypeIcon: Record<string, LucideIcon> = {
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  donut: Circle,
  'horizontal-bar': AlignLeft,
  'horizontal-stacked-bar': AlignLeft,
  'grouped-bar': BarChart3,
  'drilldown-bar': BarChart3,
  gauge: Gauge,
  'ring-gauge': Gauge,
  'status-card': TrendingUp,
  table: Table2,
}

function truncateLabel(label: string): string {
  if (label.length <= MAX_LABEL_LENGTH) return label
  return `${label.slice(0, MAX_LABEL_LENGTH)}...`
}

export const FrozenChartNav = memo(function FrozenChartNav({
  items,
  activeWidgetId,
  onWidgetSelect,
  tree,
  activeGroupId,
  activeSubgroupId,
  onSelectionChange,
}: FrozenChartNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const isWidgetMode = Boolean(items && onWidgetSelect)

  const tabs = useMemo<InternalTab[]>(() => {
    if (isWidgetMode) {
      return (items ?? []).map(item => ({
        id: item.id,
        label: item.title,
        type: item.type,
      }))
    }

    if (!tree) return []

    return tree.categories.flatMap(category =>
      category.subgroups.flatMap(subgroup =>
        subgroup.charts.map(chart => ({
          id: chart.id,
          label: chart.label,
          groupId: chart.groupId,
          subgroupId: chart.subgroupId,
        })),
      ),
    )
  }, [isWidgetMode, items, tree])

  const activeTabId = useMemo(() => {
    if (isWidgetMode) return activeWidgetId ?? null

    if (!activeGroupId || !activeSubgroupId) return null
    if (activeGroupId === CHART_NAV_ALL && activeSubgroupId === CHART_NAV_ALL) {
      return null
    }

    return (
      tabs.find(
        tab =>
          tab.groupId === activeGroupId &&
          tab.subgroupId === activeSubgroupId,
      )?.id ?? null
    )
  }, [activeGroupId, activeSubgroupId, activeWidgetId, isWidgetMode, tabs])

  const showDesktopArrows = tabs.length > 8

  const updateScrollState = useCallback(() => {
    const node = scrollRef.current
    if (!node || !showDesktopArrows) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }

    const nextCanScrollLeft = node.scrollLeft > 2
    const nextCanScrollRight = node.scrollLeft + node.clientWidth < node.scrollWidth - 2

    setCanScrollLeft(nextCanScrollLeft)
    setCanScrollRight(nextCanScrollRight)
  }, [showDesktopArrows])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return

    updateScrollState()

    const handleScroll = () => updateScrollState()
    node.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      node.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [tabs.length, updateScrollState])

  useEffect(() => {
    if (!activeTabId || !scrollRef.current) return

    const escapedId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(activeTabId)
        : activeTabId

    const activeNode = scrollRef.current.querySelector<HTMLElement>(
      `[data-nav-item-id="${escapedId}"]`,
    )
    activeNode?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeTabId])

  const handleTabClick = useCallback(
    (tab: InternalTab) => {
      if (isWidgetMode) {
        onWidgetSelect?.(tab.id)
        return
      }

      if (!tab.groupId || !tab.subgroupId) return
      onSelectionChange?.({ groupId: tab.groupId, subgroupId: tab.subgroupId })
    },
    [isWidgetMode, onSelectionChange, onWidgetSelect],
  )

  const scrollTabs = useCallback((direction: 'left' | 'right') => {
    const node = scrollRef.current
    if (!node) return

    node.scrollBy({
      left: direction === 'left' ? -SCROLL_STEP_PX : SCROLL_STEP_PX,
      behavior: 'smooth',
    })
  }, [])

  if (tabs.length === 0) return null

  return (
    <div className="relative h-10 border-b border-border/80 bg-card">
      {showDesktopArrows && (
        <div
          className={cn(
            'hidden md:flex absolute left-1 top-1/2 z-10 -translate-y-1/2 transition-opacity',
            !canScrollLeft && 'pointer-events-none opacity-0',
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollTabs('left')}
            aria-label="Scroll chart tabs left"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn(
          'flex h-full items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          showDesktopArrows && 'md:px-10',
        )}
      >
        {tabs.map(tab => {
          const Icon = chartTypeIcon[tab.type ?? 'bar'] ?? BarChart3
          const isActive = activeTabId === tab.id

          return (
            <Button
              key={tab.id}
              type="button"
              variant="ghost"
              size="sm"
              data-nav-item-id={tab.id}
              onClick={event => {
                event.stopPropagation()
                handleTabClick(tab)
              }}
              className={cn(
                'h-8 shrink-0 gap-1.5 rounded-md border-b-2 border-transparent px-2.5 text-xs font-medium',
                'hover:bg-muted/70',
                isActive ? 'border-primary bg-muted text-foreground' : 'text-muted-foreground',
              )}
              title={tab.label}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{truncateLabel(tab.label)}</span>
            </Button>
          )
        })}
      </div>

      {showDesktopArrows && (
        <div
          className={cn(
            'hidden md:flex absolute right-1 top-1/2 z-10 -translate-y-1/2 transition-opacity',
            !canScrollRight && 'pointer-events-none opacity-0',
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollTabs('right')}
            aria-label="Scroll chart tabs right"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
})
