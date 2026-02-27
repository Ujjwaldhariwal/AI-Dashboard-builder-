'use client'

// Component: DragDropCanvas
// src/components/builder/canvas/drag-drop-canvas.tsx

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from './widget-card'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import { Widget } from '@/types/widget'
import {
  LayoutDashboard,
  Plus,
  Wand2,
  BarChart3,
  TrendingUp,
  PieChart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MagicPasteModal } from '@/components/builder/magic-paste-modal'

interface DragDropCanvasProps {
  viewMode?: boolean
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyCanvas({
  onAddWidget,
  onMagicBuild,
  hasEndpoints,
}: {
  onAddWidget: () => void
  onMagicBuild: () => void
  hasEndpoints: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      {/* Icon cluster */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/20 flex items-center justify-center">
          <LayoutDashboard className="w-9 h-9 text-blue-500" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-500/20 flex items-center justify-center">
          <BarChart3 className="w-4 h-4 text-purple-500" />
        </div>
        <div className="absolute -bottom-1 -left-3 w-7 h-7 rounded-lg bg-gradient-to-br from-green-600/20 to-teal-600/20 border border-green-500/20 flex items-center justify-center">
          <TrendingUp className="w-3.5 h-3.5 text-green-500" />
        </div>
        <div className="absolute top-1 -left-4 w-6 h-6 rounded-lg bg-gradient-to-br from-orange-600/20 to-amber-600/20 border border-orange-500/20 flex items-center justify-center">
          <PieChart className="w-3 h-3 text-orange-500" />
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-1.5">Your canvas is empty</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        {hasEndpoints
          ? 'Add a widget manually or use Magic Auto-Build to instantly generate charts from your API.'
          : 'Connect an API first from API Config, then come back to add widgets.'}
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button
          onClick={onAddWidget}
          disabled={!hasEndpoints}
          className="gap-2 min-w-[160px]"
        >
          <Plus className="w-4 h-4" />
          Add Widget
        </Button>
        <Button
          variant="outline"
          onClick={onMagicBuild}
          disabled={!hasEndpoints}
          className="gap-2 min-w-[160px] border-purple-500/40 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30"
        >
          <Wand2 className="w-4 h-4" />
          Magic Auto-Build
        </Button>
      </div>

      {!hasEndpoints && (
        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
          No APIs connected yet — go to{' '}
          <a href="/api-config" className="underline text-primary">
            API Config
          </a>{' '}
          to add one.
        </p>
      )}
    </div>
  )
}

// ── Add Widget Tile ───────────────────────────────────────────────────────────
function AddWidgetTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center justify-center min-h-[220px] rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 text-muted-foreground hover:text-primary"
    >
      <div className="w-10 h-10 rounded-xl bg-muted group-hover:bg-primary/10 flex items-center justify-center mb-2 transition-colors">
        <Plus className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium">Add widget</span>
    </button>
  )
}

// ── Main Canvas ───────────────────────────────────────────────────────────────
export function DragDropCanvas({ viewMode = false }: DragDropCanvasProps) {
  const { widgets, endpoints, currentDashboardId, reorderWidgets } =
    useDashboardStore()

  const [activeWidget, setActiveWidget] = useState<Widget | null>(null)
  const [addWidgetOpen, setAddWidgetOpen] = useState(false)
  const [magicOpen, setMagicOpen] = useState(false)

  // Filter widgets for current dashboard
  const dashboardWidgets = widgets.filter(
    w => w.dashboardId === currentDashboardId,
  )
  const hasEndpoints = endpoints.length > 0

  // ── DnD Sensors ──────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // prevents mis-fires on click
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const found = dashboardWidgets.find(w => w.id === event.active.id)
      setActiveWidget(found ?? null)
    },
    [dashboardWidgets],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveWidget(null)
      if (!over || active.id === over.id || !currentDashboardId) return
      reorderWidgets(currentDashboardId, String(active.id), String(over.id))
    },
    [currentDashboardId, reorderWidgets],
  )

  // ── Empty state ───────────────────────────────────────────────────────────
  if (dashboardWidgets.length === 0 && !viewMode) {
    return (
      <>
        <EmptyCanvas
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicBuild={() => setMagicOpen(true)}
          hasEndpoints={hasEndpoints}
        />
        <WidgetConfigDialog
          open={addWidgetOpen}
          onOpenChange={setAddWidgetOpen}
        />
        <MagicPasteModal
          isOpen={magicOpen}
          onClose={() => setMagicOpen(false)}
        />
      </>
    )
  }

  // ── Viewer empty state ────────────────────────────────────────────────────
  if (dashboardWidgets.length === 0 && viewMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <LayoutDashboard className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No widgets on this dashboard yet.</p>
      </div>
    )
  }

  // ── Canvas with widgets ───────────────────────────────────────────────────
  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={dashboardWidgets.map(w => w.id)}
          strategy={rectSortingStrategy}
        >
          {/* ✅ Responsive grid — auto-fits based on widget count */}
          <div
            className={`grid gap-4 ${
              dashboardWidgets.length === 1
                ? 'grid-cols-1 max-w-2xl'
                : dashboardWidgets.length === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            }`}
          >
            {dashboardWidgets.map(widget => (
              <WidgetCard
                key={widget.id}
                widget={widget}
                viewMode={viewMode}
              />
            ))}

            {/* Add tile — only in builder mode */}
            {!viewMode && (
              <AddWidgetTile onClick={() => setAddWidgetOpen(true)} />
            )}
          </div>
        </SortableContext>

        {/* Drag overlay — ghost card while dragging */}
        <DragOverlay>
          {activeWidget && (
            <div className="opacity-90 rotate-1 scale-105 shadow-2xl rounded-xl ring-2 ring-blue-500/40">
              <WidgetCard widget={activeWidget} viewMode />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Dialogs */}
      <WidgetConfigDialog
        open={addWidgetOpen}
        onOpenChange={setAddWidgetOpen}
      />
      <MagicPasteModal
        isOpen={magicOpen}
        onClose={() => setMagicOpen(false)}
      />
    </>
  )
}
