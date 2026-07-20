"use client"

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

// Module: Drag Drop Canvas
// src/components/builder/canvas/drag-drop-canvas.tsx

import { useState, useCallback, type MouseEvent } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from './widget-card'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import type { Widget } from '@/types/widget'
import {
  LayoutDashboard, Plus, Wand2, Database, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MagicPasteModal } from '@/components/builder/magic-paste-modal'
import { getWidgetGridSpanClass } from '@/lib/builder/widget-size'

interface DragDropCanvasProps {
  viewMode?:         boolean
  selectedWidgetId?: string | null
  onSelectWidget?:   (id: string | null) => void
  widgetsOverride?:  Widget[]
}

function EmptyCanvas({
  onAddWidget, onMagicBuild, hasEndpoints,
}: {
  onAddWidget:  () => void
  onMagicBuild: () => void
  hasEndpoints: boolean
}) {
  return (
    <div className="grid min-h-[30rem] overflow-hidden rounded-md border border-dashed bg-background md:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex flex-col justify-between gap-12 p-6 md:p-8">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
          <LayoutDashboard className="h-4 w-4" />
        </div>
        <div className="max-w-xl">
          <p className="mb-2 text-xs font-medium text-muted-foreground">EMPTY CANVAS</p>
          <h3 className="text-xl font-semibold tracking-tight">Compose the first view</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {hasEndpoints
              ? 'Add a mapped widget or ask the assistant to propose a starting layout from connected data.'
              : 'Connect a data endpoint first, then return here to map fields into charts and tables.'}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button onClick={onAddWidget} disabled={!hasEndpoints} className="gap-2">
              <Plus className="h-4 w-4" />Add widget
            </Button>
            <Button variant="outline" onClick={onMagicBuild} disabled={!hasEndpoints} className="gap-2">
              <Wand2 className="h-4 w-4" />Generate draft
            </Button>
          </div>
        </div>
      </div>
      <aside className="border-t bg-muted/25 p-6 md:border-l md:border-t-0">
        <p className="text-xs font-semibold">Build sequence</p>
        <div className="mt-5 space-y-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-3"><Database className="h-4 w-4" />Choose a data source</p>
          <p className="flex items-center gap-3"><ArrowRight className="h-4 w-4" />Map dimensions and measures</p>
          <p className="flex items-center gap-3"><LayoutDashboard className="h-4 w-4" />Arrange the canvas</p>
        </div>
        {!hasEndpoints && (
          <a href="/api-config" className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">
            Open API configuration <ArrowRight className="h-3.5 w-3.5" />
          </a>
        )}
      </aside>
    </div>
  )
}

function AddWidgetTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex min-h-[260px] flex-col items-start justify-between rounded-lg border border-dashed bg-background p-5 text-left text-muted-foreground hover:border-primary/50 hover:bg-primary/[0.03] hover:text-foreground lg:col-span-4"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted transition-colors group-hover:bg-background">
        <Plus className="h-4 w-4" />
      </div>
      <div>
        <span className="block text-sm font-medium text-foreground">Add another widget</span>
        <span className="mt-1 block text-xs leading-5">Choose a chart, table, or metric and map it to connected data.</span>
      </div>
    </button>
  )
}

export function DragDropCanvas({
  viewMode = false,
  selectedWidgetId = null,
  onSelectWidget,
  widgetsOverride,
}: DragDropCanvasProps) {
  const {
    widgets,
    endpoints,
    currentDashboardId,
    reorderWidgets,
    setActiveWidgetId,
    setDragState,
  } = useDashboardStore()

  const [activeWidget, setActiveWidget]   = useState<Widget | null>(null)
  const [addWidgetOpen, setAddWidgetOpen] = useState(false)
  const [magicOpen, setMagicOpen]         = useState(false)

  const dashboardEndpoints = endpoints.filter(
    endpoint => (endpoint.dashboardId ?? currentDashboardId) === currentDashboardId,
  )
  const dashboardWidgets = widgetsOverride ?? widgets.filter(w => w.dashboardId === currentDashboardId)
  const hasEndpoints     = dashboardEndpoints.length > 0

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const found = dashboardWidgets.find(w => w.id === event.active.id)
    setActiveWidget(found ?? null)
    setActiveWidgetId(found?.id ?? null)
    setDragState({
      isDragging: true,
      activeWidgetId: String(event.active.id),
      overWidgetId: null,
    })
  }, [dashboardWidgets, setActiveWidgetId, setDragState])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveWidget(null)
    setActiveWidgetId(null)
    setDragState({
      isDragging: false,
      activeWidgetId: null,
      overWidgetId: over ? String(over.id) : null,
    })
    if (!over || active.id === over.id || !currentDashboardId) return
    reorderWidgets(currentDashboardId, String(active.id), String(over.id))
  }, [currentDashboardId, reorderWidgets, setActiveWidgetId, setDragState])

  const handleWidgetClick = useCallback((e: MouseEvent, widgetId: string) => {
    e.stopPropagation()
    onSelectWidget?.(selectedWidgetId === widgetId ? null : widgetId)
  }, [onSelectWidget, selectedWidgetId])

  if (dashboardWidgets.length === 0 && !viewMode) {
    return (
      <>
        <EmptyCanvas
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicBuild={() => setMagicOpen(true)}
          hasEndpoints={hasEndpoints}
        />
        <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
        <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
      </>
    )
  }

  if (dashboardWidgets.length === 0 && viewMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <LayoutDashboard className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No widgets on this dashboard yet.</p>
      </div>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={dashboardWidgets.map(w => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {dashboardWidgets.map(widget => (
              <div
                key={widget.id}
                data-widget-id={widget.id}
                onClick={(e) => handleWidgetClick(e, widget.id)}
                className={`rounded-lg ${getWidgetGridSpanClass(widget.position)} ${
                  selectedWidgetId === widget.id
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'ring-0'
                }`}
              >
                <WidgetCard widget={widget} viewMode={viewMode} />
              </div>
            ))}
            {!viewMode && <AddWidgetTile onClick={() => setAddWidgetOpen(true)} />}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeWidget && (
            <div className="rounded-lg border bg-background opacity-95 shadow-lg ring-1 ring-primary/40 lg:w-[680px]">
              <WidgetCard widget={activeWidget} viewMode />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
      <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
    </>
  )
}
