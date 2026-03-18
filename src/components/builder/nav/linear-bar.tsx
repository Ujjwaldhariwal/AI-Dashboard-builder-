'use client'

// src/components/builder/nav/linear-bar.tsx
// ─────────────────────────────────────────────────────────
// Frozen V3 "Linear Bar" — uses real ChartNavTree types
// All counts derived from subgroup.charts.length
// ─────────────────────────────────────────────────────────

import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, X, Layers, LayoutGrid } from 'lucide-react'
import type {
  ChartNavTree,
  ChartNavCategory,
  ChartNavSubgroup,
} from '@/lib/builder/chart-nav-model'

// ── Color palette ────────────────────────────────────────
const COLORS = [
  '#2563eb', '#e11d48', '#7c3aed', '#d97706',
  '#059669', '#0891b2', '#db2777', '#475569',
  '#6d28d9', '#0284c7', '#b91c1c', '#047857',
] as const

// ── Helpers — derive counts from tree ────────────────────

function getCategoryChartCount(cat: ChartNavCategory): number {
  return cat.subgroups.reduce((sum, sub) => sum + sub.charts.length, 0)
}

function getTreeTotalCharts(tree: ChartNavTree): number {
  return tree.categories.reduce((sum, cat) => sum + getCategoryChartCount(cat), 0)
}

// ── Types ────────────────────────────────────────────────

export interface NavSelection {
  groupId: string
  subgroupId: string
}

interface FrozenChartNavProps {
  tree: ChartNavTree
  activeGroupId: string
  activeSubgroupId: string
  onSelectionChange: (sel: NavSelection) => void
}

// ── MAIN COMPONENT ───────────────────────────────────────

export const FrozenChartNav = memo(function FrozenChartNav({
  tree,
  activeGroupId,
  activeSubgroupId,
  onSelectionChange,
}: FrozenChartNavProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeCategory = useMemo(
    () => tree.categories.find(c => c.id === activeGroupId),
    [tree.categories, activeGroupId],
  )

  const activeCategoryIndex = useMemo(
    () => tree.categories.findIndex(c => c.id === activeGroupId),
    [tree.categories, activeGroupId],
  )

  const activeColor =
    activeCategoryIndex >= 0
      ? COLORS[activeCategoryIndex % COLORS.length]
      : '#94a3b8'

  const subgroups = activeCategory?.subgroups ?? []

  const totalCharts = useMemo(() => getTreeTotalCharts(tree), [tree])

  const visibleCount = useMemo(() => {
    if (!activeCategory) return totalCharts
    if (activeSubgroupId === '__all__' || activeSubgroupId === 'all')
      return getCategoryChartCount(activeCategory)
    const sub = subgroups.find(s => s.id === activeSubgroupId)
    return sub?.charts.length ?? getCategoryChartCount(activeCategory)
  }, [activeCategory, activeSubgroupId, subgroups, totalCharts])

  // ── Handlers ───────────────────────────────────────────

  const pickCategory = useCallback(
    (catId: string) => {
      onSelectionChange({ groupId: catId, subgroupId: '__all__' })
      setModalOpen(false)
    },
    [onSelectionChange],
  )

  const pickAll = useCallback(() => {
    onSelectionChange({ groupId: '__all__', subgroupId: '__all__' })
    setModalOpen(false)
  }, [onSelectionChange])

  const pickSubgroup = useCallback(
    (subId: string) => {
      onSelectionChange({ groupId: activeGroupId, subgroupId: subId })
    },
    [activeGroupId, onSelectionChange],
  )

  const isAllSelected = activeGroupId === '__all__' || activeGroupId === 'all'

  // ── No categories — minimal bar ────────────────────────
  if (tree.categories.length === 0) {
    return (
      <div className="flex items-center h-11 rounded-xl border bg-card px-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <LayoutGrid className="w-4 h-4 text-muted-foreground mr-2.5" />
        <span className="text-[13px] font-semibold text-foreground">All Charts</span>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground bg-muted/50 px-2.5 h-[26px] rounded-lg">
          <div className="w-[5px] h-[5px] rounded-full bg-emerald-500" />
          {totalCharts} charts
        </div>
      </div>
    )
  }

  // ── Full bar ───────────────────────────────────────────

  return (
    <>
      {/* ── THE BAR — 44px, never shifts ───────────────── */}
      <div className="flex items-center h-11 rounded-xl border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
        {/* Group trigger pill */}
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-3.5 h-9 rounded-lg mx-0.5 shrink-0 transition-colors hover:bg-muted/60 active:bg-muted group"
        >
          <div
            className="w-[6px] h-[6px] rounded-full shrink-0 transition-colors"
            style={{ backgroundColor: isAllSelected ? '#94a3b8' : activeColor }}
          />
          <span className="text-[13px] font-semibold text-foreground whitespace-nowrap max-w-[120px] sm:max-w-[180px] truncate">
            {isAllSelected ? 'All' : activeCategory?.label ?? 'All'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform group-hover:text-foreground" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-border shrink-0" />

        {/* Subcategory tabs — horizontal scroll */}
        {subgroups.length > 0 && (
          <div className="relative flex-1 min-w-0 overflow-hidden">
            {/* Fade masks */}
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-card to-transparent z-10" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-card to-transparent z-10" />

            <div
              ref={scrollRef}
              className="flex items-center gap-0.5 px-2 overflow-x-auto scrollbar-none scroll-smooth"
            >
              {/* "All" within group */}
              <SubTab
                label="All"
                isActive={activeSubgroupId === '__all__' || activeSubgroupId === 'all'}
                activeColor={activeColor}
                onClick={() => pickSubgroup('__all__')}
              />
              {subgroups.map(sub => (
                <SubTab
                  key={sub.id}
                  label={sub.label}
                  isActive={activeSubgroupId === sub.id}
                  activeColor={activeColor}
                  onClick={() => pickSubgroup(sub.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Spacer when no subgroups */}
        {subgroups.length === 0 && <div className="flex-1" />}

        {/* Chart count badge */}
        <div className="flex items-center gap-1.5 px-2.5 h-[26px] rounded-lg bg-muted/50 text-[11px] font-semibold text-muted-foreground shrink-0 mr-1">
          <div className="w-[5px] h-[5px] rounded-full bg-emerald-500" />
          {visibleCount} chart{visibleCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── MODAL ───────────────────────────────────────── */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] sm:pt-[14vh] px-4"
            onClick={() => setModalOpen(false)}
          >
            <div className="absolute inset-0 bg-black/15 backdrop-blur-[2px]" />

            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="relative w-full max-w-xs bg-card rounded-2xl border shadow-[0_12px_40px_rgba(0,0,0,0.1)] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">
                  Select Category
                </span>
                <button
                  onClick={() => setModalOpen(false)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* "All" option */}
              <div className="px-1.5 pb-1">
                <button
                  onClick={pickAll}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors ${
                    isAllSelected ? 'bg-muted/60' : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="w-[30px] h-[30px] rounded-[9px] bg-muted flex items-center justify-center shrink-0">
                    <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-[12.5px] font-semibold text-foreground">All Charts</div>
                    <div className="text-[10.5px] text-muted-foreground">
                      {totalCharts} widget{totalCharts !== 1 ? 's' : ''} total
                    </div>
                  </div>
                  {isAllSelected && (
                    <div className="w-[6px] h-[6px] rounded-full bg-muted-foreground shrink-0" />
                  )}
                </button>
              </div>

              <div className="h-px bg-border mx-4 my-0.5" />

              {/* Category list */}
              <div className="px-1.5 pt-1 pb-2 max-h-[50vh] overflow-y-auto">
                {tree.categories.map((cat, idx) => {
                  const isActive = activeGroupId === cat.id
                  const color = COLORS[idx % COLORS.length]
                  const chartCount = getCategoryChartCount(cat)

                  return (
                    <button
                      key={cat.id}
                      onClick={() => pickCategory(cat.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all ${
                        isActive ? '' : 'hover:bg-muted/40'
                      }`}
                      style={{
                        backgroundColor: isActive ? `${color}08` : undefined,
                      }}
                    >
                      <div
                        className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: isActive ? `${color}15` : '#f4f5f7',
                        }}
                      >
                        <Layers
                          className="w-4 h-4"
                          style={{ color: isActive ? color : '#94a3b8' }}
                        />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div
                          className="text-[12.5px] font-semibold truncate"
                          style={{ color: isActive ? color : undefined }}
                        >
                          {cat.label}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground">
                          {cat.subgroups.length} sub · {chartCount} chart{chartCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      {isActive && (
                        <div
                          className="w-[6px] h-[6px] rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
})

// ── SubTab — extracted for cleaner JSX ───────────────────

function SubTab({
  label,
  isActive,
  activeColor,
  onClick,
}: {
  label: string
  isActive: boolean
  activeColor: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-3 h-8 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
        isActive
          ? 'text-foreground bg-muted/80'
          : 'text-muted-foreground hover:text-foreground/70 hover:bg-muted/30'
      }`}
    >
      {label}
      {isActive && (
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3.5 h-[2px] rounded-full"
          style={{ backgroundColor: activeColor }}
        />
      )}
    </button>
  )
}