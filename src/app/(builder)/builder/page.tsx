'use client'

// src/app/(builder)/builder/page.tsx

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { DragDropCanvas } from '@/components/builder/canvas/drag-drop-canvas'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import { MagicPasteModal } from '@/components/builder/magic-paste-modal'
import { toast } from 'sonner'
import {
  Plus, Settings2, Eye,
  Database, FolderKanban, Download, Wand2,
} from 'lucide-react'
import Link from 'next/link'
import { buildDashboardConfig, slugifyDashboardName } from '@/lib/code-generator/config-builder'
import { generateProjectFromConfig } from '@/lib/code-generator/template-generator'
import { packageProjectAsZip } from '@/lib/code-generator/zip-packager'

export default function BuilderPage() {
  const router = useRouter()
  const {
    dashboards,
    currentDashboardId,
    setCurrentDashboard,
    getWidgetsByDashboard,
    endpoints,
    widgets: allWidgets,
  } = useDashboardStore()

  const [addWidgetOpen, setAddWidgetOpen] = useState(false)
  const [magicOpen, setMagicOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Auto-select first dashboard
  useEffect(() => {
    if (!currentDashboardId && dashboards.length > 0) {
      setCurrentDashboard(dashboards[0].id)
    }
  }, [currentDashboardId, dashboards, setCurrentDashboard])

  const currentDash = dashboards.find(d => d.id === currentDashboardId)
  const widgets = currentDashboardId ? getWidgetsByDashboard(currentDashboardId) : []

  // ── Export ──────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!currentDash) { toast.error('No active dashboard to export'); return }
    if (widgets.length === 0) { toast.error('Add at least one widget before exporting'); return }

    setExporting(true)
    toast.loading('Generating project...', { id: 'export' })

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

  // ── No Dashboard State ──────────────────────────────────────────────────
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
          <Button onClick={() => router.push('/workspaces')}>
            Go to Workspaces
          </Button>
        </div>
      </div>
    )
  }

  // ── No APIs State ────────────────────────────────────────────────────────
  if (endpoints.length === 0 && widgets.length === 0) {
    return (
      <div className="p-6">
        <BuilderHeader
          currentDash={currentDash}
          widgets={widgets}
          endpoints={endpoints}
          exporting={exporting}
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicOpen={() => setMagicOpen(true)}
          onExport={handleExport}
        />

        <div className="flex items-center justify-center min-h-[50vh] border-2 border-dashed border-muted-foreground/20 rounded-xl mt-2">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mx-auto mb-4">
              <Database className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">No APIs Connected</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Add APIs manually or let AI build your dashboard instantly.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => setMagicOpen(true)}
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

        <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
        <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
      </div>
    )
  }

  // ── Main Builder ─────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <BuilderHeader
        currentDash={currentDash}
        widgets={widgets}
        endpoints={endpoints}
        exporting={exporting}
        onAddWidget={() => setAddWidgetOpen(true)}
        onMagicOpen={() => setMagicOpen(true)}
        onExport={handleExport}
      />

      {/* ✅ DragDropCanvas owns all DnD + widget grid + empty states */}
      <DragDropCanvas />

      {/* Dialogs hoisted here so header buttons also trigger them */}
      <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
      <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
    </div>
  )
}

// ── Builder Header (extracted to avoid repetition) ───────────────────────────
function BuilderHeader({
  currentDash,
  widgets,
  endpoints,
  exporting,
  onAddWidget,
  onMagicOpen,
  onExport,
}: {
  currentDash: any
  widgets: any[]
  endpoints: any[]
  exporting: boolean
  onAddWidget: () => void
  onMagicOpen: () => void
  onExport: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
      {/* Left — title */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold truncate">
            {currentDash?.name ?? 'Builder'}
          </h1>
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

      {/* Right — actions */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
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
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exporting || widgets.length === 0}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {exporting ? 'Exporting...' : 'Export as Code'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onMagicOpen}
          className="border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-900 dark:text-purple-400 dark:hover:bg-purple-900/20"
        >
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
          Magic Auto-Build
        </Button>

        <Button
          size="sm"
          onClick={onAddWidget}
          disabled={endpoints.length === 0}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Widget
        </Button>
      </div>
    </div>
  )
}
