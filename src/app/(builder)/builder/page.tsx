'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from '@/components/builder/canvas/widget-card'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import { toast } from 'sonner'
import {
  LayoutGrid, Plus, Settings2, Eye,
  Database, FolderKanban, Download,
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
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!currentDashboardId && dashboards.length > 0) {
      setCurrentDashboard(dashboards[0].id)
    }
  }, [currentDashboardId, dashboards, setCurrentDashboard])

  const currentDash = dashboards.find((d) => d.id === currentDashboardId)
  const widgets = currentDashboardId ? getWidgetsByDashboard(currentDashboardId) : []

  // ── Export handler ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!currentDash) {
      toast.error('No active dashboard to export')
      return
    }
    if (widgets.length === 0) {
      toast.error('Add at least one widget before exporting')
      return
    }

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

  // ── Empty states ────────────────────────────────────────────────────────────
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
              Add at least one API endpoint before creating widgets
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

  // ── Main canvas ─────────────────────────────────────────────────────────────
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

          {/* ── NEW: Export as Code button ── */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || widgets.length === 0}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {exporting ? 'Exporting…' : 'Export as Code'}
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

      {/* Widget Canvas */}
      {widgets.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {widgets.map((widget) => (
            <WidgetCard key={widget.id} widget={widget} />
          ))}
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
      ) : (
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
            <p className="text-xs text-muted-foreground mb-5">
              Tip: Go to{' '}
              <Link href="/api-config" className="text-blue-500 hover:underline">
                API Config
              </Link>
              , test an endpoint, and click "Add Widget" directly.
            </p>
            <Button onClick={() => setAddWidgetOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Widget
            </Button>
          </div>
        </div>
      )}

      {/* Widget Config Dialog */}
      <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
    </div>
  )
}
