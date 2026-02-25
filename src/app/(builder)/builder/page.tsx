// src/app/(builder)/builder/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useDashboardStore } from '@/store/builder-store'
import { SortableWidgetCard } from '@/components/builder/canvas/sortable-widget-card'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import { useKeyboardShortcuts } from '@/lib/hooks/use-keyboard-shortcuts'
import { buildDashboardConfig, slugifyDashboardName } from '@/lib/code-generator/config-builder'
import { generateProjectFromConfig } from '@/lib/code-generator/template-generator'
import { packageProjectAsZip } from '@/lib/code-generator/zip-packager'
import { toast } from 'sonner'
import {
  LayoutGrid, Plus, Settings2, Eye,
  Database, FolderKanban, Download, Keyboard,
} from 'lucide-react'

// ── DND Kit Imports ──
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'

export default function BuilderPage() {
  const router = useRouter()
  const {
    dashboards, currentDashboardId, setCurrentDashboard,
    getWidgetsByDashboard, endpoints, widgets: allWidgets,
    reorderWidgets, // ✅ From Sprint 3 store update
  } = useDashboardStore()

  const [addWidgetOpen, setAddWidgetOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // ── DND Sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (!currentDashboardId && dashboards.length > 0) {
      setCurrentDashboard(dashboards[0].id)
    }
  }, [currentDashboardId, dashboards, setCurrentDashboard])

  const currentDash = dashboards.find(d => d.id === currentDashboardId)
  const widgets = currentDashboardId ? getWidgetsByDashboard(currentDashboardId) : []

  // ── Drag End Handler ──
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !currentDash) return

    const oldIndex = widgets.findIndex(w => w.id === active.id)
    const newIndex = widgets.findIndex(w => w.id === over.id)

    const newOrder = arrayMove(widgets, oldIndex, newIndex)
    reorderWidgets(currentDash.id, newOrder)
  }

  // ── Export ──
  const handleExport = async () => {
    if (!currentDash) { toast.error('No active dashboard'); return }
    if (widgets.length === 0) { toast.error('Add at least one widget first'); return }
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
      toast.success('Export ready!', { id: 'export' })
    } catch (err: any) {
      toast.error('Export failed: ' + err.message, { id: 'export' })
    } finally {
      setExporting(false)
    }
  }

  // ── Keyboard shortcuts ──
  useKeyboardShortcuts({
    onNewWidget: () => endpoints.length > 0 && setAddWidgetOpen(true),
    onExport: handleExport,
    onHelp: () => setShortcutsOpen(true),
  })

  // ── Empty states ──
  if (dashboards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2">No Dashboard Yet</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Create a dashboard first from the Workspaces page.
          </p>
          <Button onClick={() => router.push('/workspaces')}>Go to Workspaces</Button>
        </div>
      </div>
    )
  }

  if (currentDash && endpoints.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">{currentDash.name}</h1>
            <p className="text-sm text-muted-foreground">Connect a data source to start building</p>
          </div>
        </div>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mx-auto mb-4">
              <Database className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">No APIs Connected</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Add at least one API endpoint before creating widgets.
            </p>
            <Link href="/api-config">
              <Button>
                <Settings2 className="w-4 h-4 mr-2" />
                Configure APIs
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Main builder ──
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
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

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="w-4 h-4" />
          </Button>
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
            {exporting ? 'Exporting…' : 'Export Code'}
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

      {/* Widget grid (DND Context) */}
      {widgets.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {widgets.map(widget => (
                <SortableWidgetCard key={widget.id} widget={widget} />
              ))}
              
              {/* Add tile */}
              <button
                onClick={() => setAddWidgetOpen(true)}
                className="min-h-[240px] rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all group"
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
        </DndContext>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">Canvas is Empty</h2>
            <p className="text-sm text-muted-foreground mb-5">
              You have{' '}
              <span className="font-semibold text-foreground">
                {endpoints.length} API{endpoints.length > 1 ? 's' : ''}
              </span>{' '}
              ready. Add a widget to visualize your data.
            </p>
            <Button onClick={() => setAddWidgetOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Widget
            </Button>
          </div>
        </div>
      )}

      {/* Widget config dialog */}
      <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />

      {/* ── Keyboard shortcuts help dialog ── */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-4 h-4" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-sm pt-1">
            {[
              ['Ctrl + N', 'Add new widget'],
              ['Ctrl + E', 'Export dashboard as code'],
              ['Ctrl + K', 'Focus search'],
              ['Ctrl + R', 'Refresh all widgets'],
              ['?',        'Show this shortcuts panel'],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-muted-foreground">{desc}</span>
                <kbd className="px-2 py-0.5 text-xs bg-muted rounded font-mono border border-border">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
