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
import { ChevronDown, Layers3, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CHART_NAV_ALL,
  CHART_NAV_ALL_LABEL,
  type ChartNavCategory,
  type ChartNavTree,
  getSubgroupsForGroup,
} from '@/lib/builder/chart-nav-model'
import { getUppclCategoryAccent } from '@/lib/builder/uppcl-api-taxonomy'

interface FrozenChartNavProps {
  tree: ChartNavTree
  activeGroupId: string
  activeSubgroupId: string
  onSelectionChange: (selection: { groupId: string; subgroupId: string }) => void
  className?: string
}

const FALLBACK_TONES = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#ef4444', '#64748b']

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

function resolveCategoryTone(label: string, index: number): string {
  return getUppclCategoryAccent(label) ?? FALLBACK_TONES[index % FALLBACK_TONES.length]
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
  const activeTone = resolveCategoryTone(activeGroup?.label ?? CHART_NAV_ALL_LABEL, 0)
  const selectedCount = useMemo(
    () => getSelectionCount(categories, activeGroupId, activeSubgroupId),
    [categories, activeGroupId, activeSubgroupId],
  )

  if (categories.length === 0) return null

  const handleSelectGroup = (groupId: string) => {
    onSelectionChange({ groupId, subgroupId: CHART_NAV_ALL })
    setGroupPickerOpen(false)
  }

  return (
    <>
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white via-slate-50/70 to-cyan-50/60 p-2.5 shadow-[0_12px_30px_-24px_rgba(14,116,144,0.7)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/40',
          className,
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/80 to-transparent dark:from-slate-900/60" />

        <div className="relative flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-xl border border-slate-200/80 bg-white/90 px-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            onClick={() => setGroupPickerOpen(true)}
          >
            <Layers3 className="mr-1.5 h-4 w-4" style={{ color: activeTone }} />
            <span className="max-w-[150px] truncate">{activeGroup?.label ?? CHART_NAV_ALL_LABEL}</span>
            <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-slate-500" />
          </Button>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              className={cn(
                'relative h-8 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition',
                activeSubgroupId === CHART_NAV_ALL
                  ? 'border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                  : 'border-transparent text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-slate-900/70',
              )}
              onClick={() => onSelectionChange({ groupId: activeGroupId, subgroupId: CHART_NAV_ALL })}
            >
              {CHART_NAV_ALL_LABEL}
              {activeSubgroupId === CHART_NAV_ALL && (
                <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full" style={{ backgroundColor: activeTone }} />
              )}
            </button>

            {subgroups.map(subgroup => {
              const isActive = activeSubgroupId === subgroup.id
              return (
                <button
                  key={subgroup.id}
                  type="button"
                  className={cn(
                    'relative h-8 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition',
                    isActive
                      ? 'border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                      : 'border-transparent text-slate-600 hover:bg-white/80 dark:text-slate-300 dark:hover:bg-slate-900/70',
                  )}
                  onClick={() => onSelectionChange({ groupId: activeGroupId, subgroupId: subgroup.id })}
                >
                  {subgroup.label}
                  {isActive && (
                    <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full" style={{ backgroundColor: activeTone }} />
                  )}
                </button>
              )
            })}
          </div>

          <Badge
            variant="outline"
            className="ml-auto h-8 rounded-lg border-slate-200 bg-white/80 px-2.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" style={{ color: activeTone }} />
            {selectedCount} charts
          </Badge>
        </div>
      </div>

      <Dialog open={groupPickerOpen} onOpenChange={setGroupPickerOpen}>
        <DialogContent className="max-w-xl overflow-hidden border-slate-200/80 p-0 dark:border-slate-800">
          <DialogHeader className="border-b bg-gradient-to-r from-slate-50 to-cyan-50/60 px-5 py-4 dark:from-slate-900 dark:to-cyan-950/30">
            <DialogTitle className="text-sm">Select Category</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Organized from API group and subgroup mapping.
            </p>
          </DialogHeader>

          <div className="max-h-[62vh] space-y-2 overflow-y-auto p-3">
            <button
              type="button"
              onClick={() => handleSelectGroup(CHART_NAV_ALL)}
              className={cn(
                'w-full rounded-xl border p-3 text-left transition-colors',
                activeGroupId === CHART_NAV_ALL
                  ? 'border-cyan-300 bg-cyan-50/70 dark:border-cyan-800 dark:bg-cyan-950/30'
                  : 'border-slate-200/80 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{CHART_NAV_ALL_LABEL}</p>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {categories.reduce((sum, category) => (
                    sum + category.subgroups.reduce((cSum, subgroup) => cSum + subgroup.charts.length, 0)
                  ), 0)}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Browse all categories and subgroups.
              </p>
            </button>

            {categories.map((category, index) => {
              const categoryCount = category.subgroups.reduce((sum, subgroup) => sum + subgroup.charts.length, 0)
              const isActive = activeGroupId === category.id
              const tone = resolveCategoryTone(category.label, index)

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleSelectGroup(category.id)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition-colors',
                    isActive
                      ? 'border-cyan-300 bg-cyan-50/70 dark:border-cyan-800 dark:bg-cyan-950/30'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone }} />
                      <p className="truncate text-sm font-semibold">{category.label}</p>
                    </div>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {categoryCount}
                    </Badge>
                  </div>

                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {category.subgroups.length} subgroup{category.subgroups.length !== 1 ? 's' : ''}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {category.subgroups.slice(0, 4).map(subgroup => (
                      <span
                        key={subgroup.id}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {subgroup.label}
                      </span>
                    ))}
                    {category.subgroups.length > 4 && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        +{category.subgroups.length - 4}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
