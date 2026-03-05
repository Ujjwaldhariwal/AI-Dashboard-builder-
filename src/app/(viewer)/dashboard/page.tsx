'use client'

// src/app/(viewer)/dashboard/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from '@/components/builder/canvas/widget-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  LayoutGrid, RefreshCw, Share2, FolderKanban,
  Download, Printer, ArrowLeft, Clock,
  CheckCircle2, Link2, FileDown,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { buildDashboardConfig, slugifyDashboardName } from '@/lib/code-generator/config-builder'
import { generateProjectFromConfig } from '@/lib/code-generator/template-generator'
import { packageProjectAsZip } from '@/lib/code-generator/zip-packager'
import { encodeShareToken, buildShareUrl } from '@/lib/share-utils'
import { motion, AnimatePresence } from 'framer-motion'

export default function ViewerPage() {
  const {
    dashboards, currentDashboardId,
    endpoints, widgets: allWidgets,
    getProjectConfig, getGroupsByDashboard,
  } = useDashboardStore()

  const [refreshKey, setRefreshKey]   = useState(0)
  const [exporting, setExporting]     = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [countdown, setCountdown]     = useState<number | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  const currentDash   = dashboards.find(d => d.id === currentDashboardId)
const widgets = allWidgets.filter(w => w.dashboardId === currentDashboardId)
  const usedEndpoints = endpoints.filter(e => widgets.some(w => w.endpointId === e.id))

  // ── Auto-refresh countdown ──────────────────────────────────────────────
  const minInterval = usedEndpoints.reduce((min, e) => {
    const iv = e.refreshInterval
    return iv && iv > 0 ? Math.min(min, iv) : min
  }, Infinity)

  useEffect(() => {
    if (!isFinite(minInterval) || minInterval <= 0) return
    setCountdown(minInterval)
    const tick = setInterval(() => {
      setCountdown(c => {
        if (c === null || c <= 1) {
          setRefreshKey(k => k + 1)
          setLastRefreshed(new Date())
          return minInterval
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [minInterval])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleRefreshAll = () => {
    setRefreshKey(k => k + 1)
    setLastRefreshed(new Date())
    setCountdown(isFinite(minInterval) ? minInterval : null)
    toast.success('All widgets refreshed')
  }

  const handleShare = useCallback(() => {
    if (!currentDash) return
    const payload = {
      dashboardId:   currentDash.id,
      dashboardName: currentDash.name,
      exportedAt:    new Date().toISOString(),
      widgets: widgets.map(w => {
        const ep = endpoints.find(e => e.id === w.endpointId)
        return {
          id:          w.id,
          title:       w.title,
          type:        w.type,
          endpointUrl: ep?.url ?? '',
          method:      ep?.method ?? 'GET',
          xAxis:       w.dataMapping.xAxis,
          yAxis:       w.dataMapping.yAxis ?? '',
        }
      }),
    }
    const token = encodeShareToken(payload)
    const url   = buildShareUrl(token)
    navigator.clipboard.writeText(url)
    setShareCopied(true)
    toast.success('Share link copied!', {
      description: 'Anyone with this link can view the dashboard read-only',
    })
    setTimeout(() => setShareCopied(false), 3000)
  }, [currentDash, widgets, endpoints])

  const handleExport = async () => {
    if (!currentDash || widgets.length === 0) {
      toast.error('No widgets to export')
      return
    }
    setExporting(true)
    toast.loading('Generating project...', { id: 'export' })
    try {
      const projectConfig = getProjectConfig(currentDash.id)
      const chartGroups = getGroupsByDashboard(currentDash.id)
      const config = buildDashboardConfig(
        currentDash,
        endpoints,
        allWidgets,
        projectConfig,
        chartGroups,
      )
      const files  = generateProjectFromConfig(config)
      const blob   = await packageProjectAsZip(files)
      const url    = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = url
      a.download   = `${slugifyDashboardName(currentDash.name)}-dashboard.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Export ready!', { id: 'export' })
    } catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  toast.error(`Export failed: ${message}`, { id: 'export' })
    } finally {
      setExporting(false)
    }
  }

  const handlePdfExport = () => {
    window.open(
      `/pdf-export?dashboardId=${currentDashboardId}`,
      '_blank',
    )
  }

  // ── No dashboard ─────────────────────────────────────────────────────────
  if (!currentDash) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <FolderKanban className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Dashboard Selected</h2>
            <p className="text-muted-foreground mb-4 text-sm">
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

      {/* Sticky header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">

          {/* Left */}
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

          {/* Right */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {/* Last refreshed + countdown */}
            <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <AnimatePresence>
                {countdown !== null && (
                  <motion.span
                    key={countdown}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]"
                  >
                    auto {countdown}s
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <Button variant="outline" size="sm" onClick={handleRefreshAll}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh All
            </Button>

            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print
            </Button>

            <Button variant="outline" size="sm" onClick={handlePdfExport}>
              <FileDown className="w-3.5 h-3.5 mr-1.5" />
              PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className={shareCopied
                ? 'border-green-400 text-green-600 dark:border-green-700 dark:text-green-400'
                : ''
              }
            >
              {shareCopied
                ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Copied!</>
                : <><Share2 className="w-3.5 h-3.5 mr-1.5" />Share</>
              }
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting || widgets.length === 0}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {exporting ? 'Exporting...' : 'Export Code'}
            </Button>

            <Link href="/builder">
              <Button size="sm">Edit Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      {widgets.length > 0 && (
        <div className="border-b bg-muted/30 print:hidden">
          <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-6 flex-wrap">
            {[
              { label: 'Widgets',      value: widgets.length },
              { label: 'Data sources', value: usedEndpoints.length },
              { label: 'Dashboard',    value: currentDash.name },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <Badge variant="outline" className="text-[10px] px-1.5">{s.value}</Badge>
              </div>
            ))}
            {/* Share link preview */}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 transition-colors ml-auto"
            >
              <Link2 className="w-3 h-3" />
              Copy share link
            </button>
          </div>
        </div>
      )}

      {/* Print-only header */}
      <div className="hidden print:block px-8 py-6 border-b">
        <h1 className="text-2xl font-bold">{currentDash.name}</h1>
        {currentDash.description && (
          <p className="text-gray-500 text-sm mt-1">{currentDash.description}</p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Exported on {new Date().toLocaleString()}
        </p>
      </div>

      {/* Widget grid */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {widgets.length > 0 ? (
          <div className="grid gap-5 grid-cols-1 lg:grid-cols-2 print:grid-cols-2">
            {widgets.map(widget => (
              <motion.div
                key={`${widget.id}-${refreshKey}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <WidgetCard
                  widget={widget}
                  viewMode
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No widgets yet</h2>
            <p className="text-muted-foreground mb-4 text-sm">
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
