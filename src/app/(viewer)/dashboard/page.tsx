'use client'

import { useState } from 'react'
import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from '@/components/builder/canvas/widget-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  LayoutGrid, RefreshCw, Share2, FolderKanban,
  Download, Printer, ArrowLeft, Clock,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { buildDashboardConfig, slugifyDashboardName } from '@/lib/code-generator/config-builder'
import { generateProjectFromConfig } from '@/lib/code-generator/template-generator'
import { packageProjectAsZip } from '@/lib/code-generator/zip-packager'

export default function ViewerPage() {
  const {
    dashboards,
    currentDashboardId,
    getWidgetsByDashboard,
    endpoints,
    widgets: allWidgets,
  } = useDashboardStore()

  const [refreshKey, setRefreshKey] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  const currentDash = dashboards.find(d => d.id === currentDashboardId)
  const widgets = currentDashboardId ? getWidgetsByDashboard(currentDashboardId) : []
  const usedEndpoints = endpoints.filter(e => widgets.some(w => w.endpointId === e.id))

  const handleRefreshAll = () => {
    setRefreshKey(k => k + 1)
    setLastRefreshed(new Date())
    toast.success('All widgets refreshed')
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Link copied to clipboard')
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExport = async () => {
    if (!currentDash || widgets.length === 0) {
      toast.error('No widgets to export')
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
      toast.success('Export ready!', { id: 'export' })
    } catch (err: any) {
      toast.error('Export failed: ' + err.message, { id: 'export' })
    } finally {
      setExporting(false)
    }
  }

  // ── No dashboard selected ────────────────────────────────────────────────
  if (!currentDash) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <FolderKanban className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Dashboard Selected</h2>
            <p className="text-muted-foreground mb-4">
              Please select a dashboard from the builder
            </p>
            <Link href="/workspaces">
              <Button>Go to Dashboards</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Main viewer ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background print:bg-white">

      {/* ── Header (hidden when printing) ─────────────────────────── */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/builder">
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
              <LayoutGrid className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold truncate">{currentDash.name}</h1>
              <p className="text-xs text-muted-foreground truncate">
                {currentDash.description || 'Live Dashboard Preview'}
              </p>
            </div>
            <Badge variant="secondary" className="text-[10px] flex-shrink-0">
              {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Last refreshed time */}
            <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>
                {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <Button variant="outline" size="sm" onClick={handleRefreshAll}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh All
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="w-3.5 h-3.5 mr-1.5" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting || widgets.length === 0}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {exporting ? 'Exporting…' : 'Export Code'}
            </Button>
            <Link href="/builder">
              <Button size="sm">Edit Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Stats bar (hidden when printing) ──────────────────────── */}
      {widgets.length > 0 && (
        <div className="border-b bg-muted/30 print:hidden">
          <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Widgets</span>
              <Badge variant="outline" className="text-[10px] px-1.5">
                {widgets.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Data sources</span>
              <Badge variant="outline" className="text-[10px] px-1.5">
                {usedEndpoints.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Dashboard</span>
              <Badge variant="outline" className="text-[10px] px-1.5">
                {currentDash.name}
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* ── Print-only header ─────────────────────────────────────── */}
      <div className="hidden print:block px-8 py-6 border-b">
        <h1 className="text-2xl font-bold">{currentDash.name}</h1>
        {currentDash.description && (
          <p className="text-gray-500 text-sm mt-1">{currentDash.description}</p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Exported on {new Date().toLocaleString()}
        </p>
      </div>

      {/* ── Widget grid ───────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {widgets.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-2 print:gap-6">
            {widgets.map(widget => (
              <WidgetCard
                key={`${widget.id}-${refreshKey}`}
                widget={widget}
                viewMode
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No widgets yet</h2>
            <p className="text-muted-foreground mb-4">
              Add widgets in the builder to see them here
            </p>
            <Link href="/builder">
              <Button>Open Builder</Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
