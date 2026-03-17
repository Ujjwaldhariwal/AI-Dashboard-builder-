'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ChartNavCategory } from '@/lib/builder/chart-nav-model'

interface PdfSelectorProps {
  categories: ChartNavCategory[]
  selectedIds: Set<string>
  onSelectionChange: (next: Set<string>) => void
}

type FlatChart = {
  id: string
  label: string
  groupId: string
  groupLabel: string
  subgroupId: string
  subgroupLabel: string
}

function flattenCharts(categories: ChartNavCategory[]): FlatChart[] {
  return categories.flatMap(category =>
    category.subgroups.flatMap(subgroup =>
      subgroup.charts.map(chart => ({
        id: chart.id,
        label: chart.label,
        groupId: category.id,
        groupLabel: category.label,
        subgroupId: subgroup.id,
        subgroupLabel: subgroup.label,
      })),
    ),
  )
}

export function PdfSelector({
  categories,
  selectedIds,
  onSelectionChange,
}: PdfSelectorProps) {
  const [open, setOpen] = useState(false)
  const [activeCategoryId, setActiveCategoryId] = useState<string>('')

  const allCharts = useMemo(() => flattenCharts(categories), [categories])
  const selectedCharts = useMemo(
    () => allCharts.filter(chart => selectedIds.has(chart.id)),
    [allCharts, selectedIds],
  )
  const activeCategory = categories.find(category => category.id === activeCategoryId) ?? categories[0]

  useEffect(() => {
    if (!activeCategoryId || !categories.some(category => category.id === activeCategoryId)) {
      setActiveCategoryId(categories[0]?.id ?? '')
    }
  }, [activeCategoryId, categories])

  const setAll = () => {
    onSelectionChange(new Set(allCharts.map(chart => chart.id)))
  }

  const clearAll = () => {
    onSelectionChange(new Set())
  }

  const toggleChart = (chartId: string) => {
    const next = new Set(selectedIds)
    if (next.has(chartId)) {
      next.delete(chartId)
    } else {
      next.add(chartId)
    }
    onSelectionChange(next)
  }

  return (
    <>
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-xl border bg-card/90 px-3 py-2 shadow-sm">
        <span className="text-xs font-semibold text-foreground">Report</span>

        {selectedCharts.length === 0 ? (
          <span className="text-xs text-muted-foreground">No charts selected</span>
        ) : (
          <>
            {selectedCharts.slice(0, 4).map(chart => (
              <Badge key={chart.id} variant="secondary" className="max-w-[170px] truncate text-[10px]">
                {chart.label}
              </Badge>
            ))}
            {selectedCharts.length > 4 && (
              <Badge variant="outline" className="text-[10px]">
                +{selectedCharts.length - 4}
              </Badge>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {selectedIds.size}
          </Badge>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(true)}>
            Edit
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="text-sm">Select Charts for PDF</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="border-b bg-muted/30 p-3 md:border-b-0 md:border-r">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground">Categories</p>
                <Badge variant="outline" className="text-[10px]">
                  {selectedIds.size}/{allCharts.length}
                </Badge>
              </div>

              <div className="max-h-[48vh] space-y-1 overflow-y-auto pr-1">
                {categories.map(category => {
                  const categoryCount = category.subgroups.reduce((sum, subgroup) => sum + subgroup.charts.length, 0)
                  const selectedCount = category.subgroups.reduce(
                    (sum, subgroup) => sum + subgroup.charts.filter(chart => selectedIds.has(chart.id)).length,
                    0,
                  )
                  const isActive = category.id === activeCategory?.id

                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setActiveCategoryId(category.id)}
                      className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        isActive
                          ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30'
                          : 'border-transparent hover:bg-muted'
                      }`}
                    >
                      <p className="truncate text-xs font-semibold">{category.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedCount}/{categoryCount} selected
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {activeCategory?.label ?? 'Charts'}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={setAll}>
                    Select All
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={clearAll}>
                    Clear
                  </Button>
                </div>
              </div>

              <div className="max-h-[48vh] space-y-4 overflow-y-auto pr-1">
                {(activeCategory?.subgroups ?? []).map(subgroup => (
                  <section key={subgroup.id} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {subgroup.label}
                    </p>
                    <div className="space-y-1.5">
                      {subgroup.charts.map(chart => {
                        const isSelected = selectedIds.has(chart.id)
                        return (
                          <button
                            key={chart.id}
                            type="button"
                            onClick={() => toggleChart(chart.id)}
                            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30'
                                : 'border-border hover:bg-muted/50'
                            }`}
                          >
                            <div
                              className={`h-4 w-4 rounded-sm border ${
                                isSelected
                                  ? 'border-cyan-600 bg-cyan-600'
                                  : 'border-muted-foreground/40'
                              }`}
                            />
                            <span className="truncate text-xs font-medium">{chart.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t px-5 py-3">
            <p className="text-xs text-muted-foreground">
              {selectedIds.size} chart{selectedIds.size !== 1 ? 's' : ''} selected
            </p>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
