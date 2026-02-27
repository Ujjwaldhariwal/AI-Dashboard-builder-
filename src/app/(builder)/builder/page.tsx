//src/app/%28builder%29/builder/page.tsx
'use client'

// Component: Page

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from '@/components/builder/canvas/widget-card'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import { MagicPasteModal } from '@/components/builder/magic-paste-modal'
import { toast } from 'sonner'
import {
  LayoutGrid, Plus, Settings2, Eye,
  Database, FolderKanban, Download, Wand2
} from 'lucide-react'
import Link from 'next/link'
import { buildDashboardConfig, slugifyDashboardName } from '@/lib/code-generator/config-builder'
import { generateProjectFromConfig } from '@/lib/code-generator/template-generator'
import { packageProjectAsZip } from '@/lib/code-generator/zip-packager'

// ── DnD Imports ────────────────────────────────────────────────────────────────
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { Widget } from '@/types/widget'

export default function BuilderPage() {
  const router = useRouter()
  const {
    dashboards,
    currentDashboardId,
    setCurrentDashboard,
    getWidgetsByDashboard,
    endpoints,
    widgets: allWidgets,
    reorderWidgets,
  } = useDashboardStore()

  const [addWidgetOpen, setAddWidgetOpen] = useState(false)
  const [isMagicModalOpen, setIsMagicModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeWidget, setActiveWidget] = useState<Widget | null>(null)

  // ── DnD Sensors (8px threshold prevents accidental drags on click) ──
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  useEffect(() => {
    if (!currentDashboardId && dashboards.length > 0) {
      setCurrentDashboard(dashboards[0].id)
    }
  }, [currentDashboardId, dashboards, setCurrentDashboard])

  const currentDash = dashboards.find((d) => d.id === currentDashboardId)
  const widgets = currentDashboardId ? getWidgetsByDashboard(currentDashboardId) : []

  // ── DnD Handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const dragged = widgets.find(w => w.id === String(event.active.id))
    setActiveWidget(dragged ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveWidget(null)
    if (!over || active.id === over.id || !currentDashboardId) return
    reorderWidgets(currentDashboardId, String(active.id), String(over.id))
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!currentDash) { toast.error('No active dashboard to export'); return }
    if (widgets.length === 0) { toast.error('Add at least one widget before exporting'); return }

    setExporting(true)
    toast.loading('Generating project…', { id: 'export' })

    try {
      const config = buildDashboardConfig(currentDash, endpoints, allWidgets)
      const files = generateProjectFromConfig(config)
      const blob = await packageProjectAsZip(files)

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slugifyDashboardName(currentDash.name)}-dashboard.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Export ready — download started!', { id: 'export' })
    } catch (err: any) {
      console.error('[export]', err)
      toast.error('Export failed: ' + err.message, { id: 'export' })
    } finally {
      setExporting(false)
    }
  }

  // ── Empty States ──────────────────────────────────────────────────────────

  if (dashboards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2">No Dashboard Yet</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Create a dashboard first from the Workspaces page
          </p>
          <Button onClick={() => router.push('/workspaces')}>Go to Workspaces</Button>
        </div>
      </div>
    )
  }

  // ── Main Canvas ───────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate">{currentDash?.name ?? 'Builder'}</h1>
            <Badge variant="secondary" className="text-[10px]">
              {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {endpoints.length} API{endpoints.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {currentDash?.description || 'Add widgets from your connected APIs'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/api-config">
            <Button variant="outline" size="sm">
              <Settings2 className="w-3.5 h-3.5 mr-1.5" />
              APIs
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Preview
            </Button>
          </Link>
          <Button
            variant="outline" size="sm"
            onClick={handleExport}
            disabled={exporting || widgets.length === 0}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {exporting ? 'Exporting…' : 'Export as Code'}
          </Button>
          <Button
            onClick={() => setIsMagicModalOpen(true)}
            variant="outline" size="sm"
            className="border-purple-200 hover:bg-purple-50 dark:border-purple-900 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400"
          >
            <Wand2 className="w-4 h-4 mr-1.5" />
            Magic Auto-Build
          </Button>
          <Button
            size="sm"
            onClick={() => setAddWidgetOpen(true)}
            disabled={endpoints.length === 0}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Widget
          </Button>
        </div>
      </div>

      {/* No APIs state */}
      {endpoints.length === 0 && widgets.length === 0 ? (
        <div className="flex items-center justify-center min-h-[50vh] border-2 border-dashed border-muted-foreground/20 rounded-xl">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mx-auto mb-4">
              <Database className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">No APIs Connected</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Add APIs manually, or let AI build your dashboard instantly.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => setIsMagicModalOpen(true)}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Magic Auto-Build Dashboard
              </Button>
              <Link href="/api-config">
                <Button variant="outline" className="w-full">
                  <Settings2 className="w-4 h-4 mr-2" />
                  Configure APIs Manually
                </Button>
              </Link>
            </div>
          </div>
        </div>

      ) : widgets.length > 0 ? (
        /* ✨ DnD Sortable Widget Canvas */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={widgets.map(w => w.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {widgets.map((widget) => (
                <WidgetCard key={widget.id} widget={widget} />
              ))}

              {/* Add widget tile */}
              <button
                onClick={() => setAddWidgetOpen(true)}
                className="h-full min-h-[240px] rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors">
                  <Plus className="w-5 h-5 text-muted-foreground group-hover:text-blue-600" />
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-blue-600">
                  Add widget
                </span>
              </button>
            </div>
          </SortableContext>

          {/* Ghost card while dragging */}
          <DragOverlay>
            {activeWidget && (
              <div className="opacity-90 scale-105 shadow-2xl rounded-xl pointer-events-none">
                <WidgetCard widget={activeWidget} />
              </div>
            )}
          </DragOverlay>
        </DndContext>

      ) : (
        /* Empty canvas but has APIs */
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">Canvas is Empty</h2>
            <p className="text-sm text-muted-foreground mb-2">
              You have{' '}
              <span className="font-semibold text-foreground">
                {endpoints.length} API{endpoints.length > 1 ? 's' : ''}
              </span>{' '}
              ready. Add a widget to visualize your data.
            </p>
            <div className="flex gap-2 justify-center mt-5">
              <Button onClick={() => setAddWidgetOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Widget
              </Button>
              <Button
                onClick={() => setIsMagicModalOpen(true)}
                variant="outline"
                className="border-purple-200 text-purple-600 dark:border-purple-900 dark:text-purple-400"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Magic Auto-Build
              </Button>
            </div>
          </div>
        </div>
      )}

      <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
      <MagicPasteModal isOpen={isMagicModalOpen} onClose={() => setIsMagicModalOpen(false)} />
    </div>
  )
}
