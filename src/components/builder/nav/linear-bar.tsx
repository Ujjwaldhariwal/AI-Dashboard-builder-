'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronDown, Layers3 } from 'lucide-react'
import {
  CHART_NAV_ALL,
  CHART_NAV_ALL_LABEL,
  type ChartNavCategory,
  type ChartNavTree,
  getSubgroupsForGroup,
} from '@/lib/builder/chart-nav-model'

interface FrozenChartNavProps {
  tree: ChartNavTree
  activeGroupId: string
  activeSubgroupId: string
  onSelectionChange: (selection: { groupId: string; subgroupId: string }) => void
  className?: string
}

function getSelectionCount(
  categories: ChartNavCategory[],
  groupId: string,
  subgroupId: string,
): number {
  return categories
    .flatMap(category => category.subgroups.flatMap(subgroup =>
      subgroup.charts.map(chart => ({
        id: chart.id,
        groupId: category.id,
        subgroupId: subgroup.id,
      })),
    ))
    .filter(item => (
      (groupId === CHART_NAV_ALL || item.groupId === groupId) &&
      (subgroupId === CHART_NAV_ALL || item.subgroupId === subgroupId)
    ))
    .length
}

export function FrozenChartNav({
  tree,
  activeGroupId,
  activeSubgroupId,
  onSelectionChange,
  className,
}: FrozenChartNavProps) {
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)

  const categories = tree.categories
  const subgroups = useMemo(
    () => getSubgroupsForGroup(tree, activeGroupId),
    [tree, activeGroupId],
  )
  const activeGroup = categories.find(category => category.id === activeGroupId)
  const selectedCount = useMemo(
    () => getSelectionCount(categories, activeGroupId, activeSubgroupId),
    [categories, activeGroupId, activeSubgroupId],
  )

  if (categories.length === 0) return null

  const handleSelectGroup = (groupId: string) => {
    onSelectionChange({ groupId, subgroupId: CHART_NAV_ALL })
    setGroupPickerOpen(false)
  }

  const barClassName = className
    ? `rounded-xl border bg-card/90 p-1.5 shadow-sm ${className}`
    : 'rounded-xl border bg-card/90 p-1.5 shadow-sm'

  return (
    <>
      <div className={barClassName}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 text-sm font-semibold"
            onClick={() => setGroupPickerOpen(true)}
          >
            <Layers3 className="mr-1.5 h-4 w-4 text-cyan-600" />
            {activeGroup?.label ?? CHART_NAV_ALL_LABEL}
            <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
          </Button>

          <div className="h-5 w-px bg-border" />

          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5">
            <Button
              type="button"
              variant={activeSubgroupId === CHART_NAV_ALL ? 'secondary' : 'ghost'}
              className="h-8 px-3 text-xs font-medium"
              onClick={() => onSelectionChange({ groupId: activeGroupId, subgroupId: CHART_NAV_ALL })}
            >
              {CHART_NAV_ALL_LABEL}
            </Button>
            {subgroups.map(subgroup => (
              <Button
                key={subgroup.id}
                type="button"
                variant={activeSubgroupId === subgroup.id ? 'secondary' : 'ghost'}
                className="h-8 px-3 text-xs font-medium whitespace-nowrap"
                onClick={() => onSelectionChange({ groupId: activeGroupId, subgroupId: subgroup.id })}
              >
                {subgroup.label}
              </Button>
            ))}
          </div>

          <Badge variant="outline" className="ml-auto h-7 rounded-md px-2 text-[11px] font-semibold">
            {selectedCount} charts
          </Badge>
        </div>
      </div>

      <Dialog open={groupPickerOpen} onOpenChange={setGroupPickerOpen}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="text-sm">Select Category</DialogTitle>
          </DialogHeader>

          <div className="max-h-[58vh] space-y-1 overflow-y-auto p-3">
            <button
              type="button"
              onClick={() => handleSelectGroup(CHART_NAV_ALL)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                activeGroupId === CHART_NAV_ALL
                  ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30'
                  : 'border-transparent hover:bg-muted'
              }`}
            >
              <p className="text-sm font-semibold">{CHART_NAV_ALL_LABEL}</p>
              <p className="text-[11px] text-muted-foreground">
                {categories.reduce((sum, category) => (
                  sum + category.subgroups.reduce((cSum, subgroup) => cSum + subgroup.charts.length, 0)
                ), 0)} charts
              </p>
            </button>

            {categories.map(category => {
              const categoryCount = category.subgroups.reduce((sum, subgroup) => sum + subgroup.charts.length, 0)
              const isActive = activeGroupId === category.id

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleSelectGroup(category.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    isActive
                      ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30'
                      : 'border-transparent hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{category.label}</p>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {categoryCount}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {category.subgroups.length} subgroup{category.subgroups.length !== 1 ? 's' : ''}
                  </p>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
