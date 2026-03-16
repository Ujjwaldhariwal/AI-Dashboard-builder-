'use client'

// src/app/(builder)/builder/page.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useDashboardStore } from '@/store/builder-store'
import { DragDropCanvas } from '@/components/builder/canvas/drag-drop-canvas'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import { MagicPasteModal } from '@/components/builder/magic-paste-modal'
import { ConfigChatbot } from '@/components/builder/ai-assistant/config-chatbot'
import { ChartSuggester } from '@/components/builder/ai-assistant/chart-suggester'
import { WidgetStylePanel } from '@/components/builder/style-panel/widget-style-panel'
import { ProjectConfigPanel } from '@/components/builder/project-config/project-config-panel'
import { GlobalFiltersPanel } from '@/components/builder/filters/global-filters-panel'
import { toast } from 'sonner'
import {
  Plus, Settings2, Eye, Database, FolderKanban,
  Download, Wand2, Sparkles, X, Bot,
  LayoutGrid, Circle, Minimize2, Maximize2,
  Palette, SlidersHorizontal, Loader2, Radar,
} from 'lucide-react'
import Link from 'next/link'
import { buildDashboardConfig, slugifyDashboardName } from '@/lib/code-generator/config-builder'
import { generateProjectFromConfig } from '@/lib/code-generator/template-generator'
import { packageProjectAsZip } from '@/lib/code-generator/zip-packager'
import { motion, AnimatePresence } from 'framer-motion'
import type { Widget } from '@/types/widget'
import { useDashboardEndpointPrefetch } from '@/hooks/use-dashboard-endpoint-prefetch'
import {
  probeDashboardEndpoints,
  type DashboardEndpointProbeSummary,
} from '@/lib/api/endpoint-runtime-cache'

// ── Fix #1 — inline the shape we need, no cross-file type dep ─
interface EndpointSummary {
  id:   string
  name: string
}

export default function BuilderPage() {
  const router = useRouter()
  const {
    dashboards,
    currentDashboardId,
    setCurrentDashboard,
    endpoints,
    widgets: allWidgets,
    getFiltersByDashboard,
  } = useDashboardStore()

  const [addWidgetOpen, setAddWidgetOpen]       = useState(false)
  const [magicOpen, setMagicOpen]               = useState(false)
  const [exporting, setExporting]               = useState(false)
  const [aiOpen, setAiOpen]                     = useState(false)
  const [aiMinimized, setAiMinimized]           = useState(false)
  const [unsaved, setUnsaved]                   = useState(false)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [scanSummary, setScanSummary]           = useState<DashboardEndpointProbeSummary | null>(null)
  const [isScanningApis, setIsScanningApis]     = useState(false)

  const hasMounted        = useRef(false)
  const lastSavedCountRef = useRef(0)

  useEffect(() => {
    if (!currentDashboardId && dashboards.length > 0) {
      setCurrentDashboard(dashboards[0].id)
    }
  }, [currentDashboardId, dashboards, setCurrentDashboard])

  const currentDash = dashboards.find(d => d.id === currentDashboardId)

  // ── Fix #5 — derive widgets directly from store slice ────────
  const widgets = useMemo(
    () => allWidgets.filter(w => w.dashboardId === currentDashboardId),
    [allWidgets, currentDashboardId],
  )
  const dashboardEndpoints = useMemo(
    () => endpoints.filter(
      endpoint => (endpoint.dashboardId ?? currentDashboardId) === currentDashboardId,
    ),
    [endpoints, currentDashboardId],
  )
  const activeDashboardEndpoints = useMemo(
    () => dashboardEndpoints.filter(endpoint => (
      endpoint.status !== 'inactive' &&
      typeof endpoint.url === 'string' &&
      endpoint.url.trim().length > 0
    )),
    [dashboardEndpoints],
  )
  useDashboardEndpointPrefetch(activeDashboardEndpoints)
  const dashboardFilters = currentDashboardId
    ? getFiltersByDashboard(currentDashboardId)
    : []
  const activeFilterCount = dashboardFilters.filter(
    f => f.active && f.field.trim() && f.value.trim(),
  ).length

  useEffect(() => {
    if (!hasMounted.current) {
      lastSavedCountRef.current = widgets.length
      hasMounted.current = true
      return
    }
    if (widgets.length !== lastSavedCountRef.current) {
      setUnsaved(true)
    }
  }, [widgets.length])

  const runApiScan = useCallback(async (
    options: { force?: boolean; silent?: boolean } = {},
  ) => {
    if (activeDashboardEndpoints.length === 0) {
      setScanSummary(null)
      if (!options.silent) {
        toast.info('No active APIs available for scan.')
      }
      return null
    }

    setIsScanningApis(true)
    if (!options.silent) {
      toast.loading('Scanning API health...', { id: 'builder-api-scan' })
    }

    try {
      const summary = await probeDashboardEndpoints(activeDashboardEndpoints, {
        force: options.force,
      })
      setScanSummary(summary)
      if (!options.silent) {
        toast.success(
          `Scan done: ${summary.healthy} healthy, ${summary.unauthorized + summary.empty} attention, ${summary.failed} failed.`,
          { id: 'builder-api-scan' },
        )
      }
      return summary
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!options.silent) {
        toast.error(`API scan failed: ${message}`, { id: 'builder-api-scan' })
      }
      return null
    } finally {
      setIsScanningApis(false)
    }
  }, [activeDashboardEndpoints])

  useEffect(() => {
    void runApiScan({ silent: true })
  }, [runApiScan])

  const handleScanApis = useCallback(() => {
    void runApiScan({ force: true })
  }, [runApiScan])

  const handleCanvasClick = () => setSelectedWidgetId(null)

  const handleExport = async () => {
    if (!currentDash)    { toast.error('No active dashboard'); return }
    if (!widgets.length) { toast.error('Add at least one widget first'); return }

    setExporting(true)
    toast.loading('Generating project…', { id: 'export' })

    try {
      const projectConfig = useDashboardStore.getState().getProjectConfig(currentDash.id)
      const chartGroups   = useDashboardStore.getState().getGroupsByDashboard(currentDash.id)
      const config        = buildDashboardConfig(currentDash, endpoints, allWidgets, projectConfig, chartGroups)
      const files         = generateProjectFromConfig(config)
      const blob          = await packageProjectAsZip(files)
      const url           = URL.createObjectURL(blob)
      const a             = document.createElement('a')
      a.href              = url
      a.download          = `${slugifyDashboardName(currentDash.name)}-dashboard.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Export ready!', { id: 'export' })
      lastSavedCountRef.current = widgets.length
      setUnsaved(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Export failed: ${message}`, { id: 'export' })
    } finally {
      setExporting(false)
    }
  }

  if (dashboards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2">No Dashboard Yet</h2>
          <p className="text-sm text-muted-foreground mb-5">Create one from Workspaces first.</p>
          <Button onClick={() => router.push('/workspaces')}>Go to Workspaces</Button>
        </div>
      </div>
    )
  }

  if (dashboardEndpoints.length === 0 && widgets.length === 0) {
    return (
      <div className="p-6">
        <BuilderHeader
          currentDash={currentDash}
          widgets={widgets}
          endpoints={dashboardEndpoints}
          activeFilterCount={activeFilterCount}
          exporting={exporting}
          unsaved={false}
          scanSummary={scanSummary}
          isScanningApis={isScanningApis}
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicOpen={() => setMagicOpen(true)}
          onExport={handleExport}
          onScanApis={handleScanApis}
        />
        <div className="flex items-center justify-center min-h-[50vh] border-2 border-dashed border-muted-foreground/20 rounded-xl mt-4">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mx-auto mb-4">
              <Database className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">No APIs Connected</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Add APIs or let AI build your dashboard instantly.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => setMagicOpen(true)}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white"
              >
                <Wand2 className="w-4 h-4 mr-2" />Magic Auto-Build
              </Button>
              <Link href="/api-config">
                <Button variant="outline" className="w-full">
                  <Settings2 className="w-4 h-4 mr-2" />Configure APIs Manually
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

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">

      <div className="px-6 pt-5 pb-3 border-b bg-card/80 backdrop-blur flex-shrink-0">
        <BuilderHeader
          currentDash={currentDash}
          widgets={widgets}
          endpoints={dashboardEndpoints}
          activeFilterCount={activeFilterCount}
          exporting={exporting}
          unsaved={unsaved}
          scanSummary={scanSummary}
          isScanningApis={isScanningApis}
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicOpen={() => setMagicOpen(true)}
          onExport={handleExport}
          onScanApis={handleScanApis}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6" onClick={handleCanvasClick}>
        {currentDashboardId && (
          <div className="mb-4">
            <GlobalFiltersPanel dashboardId={currentDashboardId} />
          </div>
        )}
        <DragDropCanvas
          selectedWidgetId={selectedWidgetId}
          onSelectWidget={setSelectedWidgetId}
        />
      </div>

      <AnimatePresence>
        {aiOpen && (
          <motion.div
            key="ai-overlay"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-5 right-5 z-50 shadow-2xl rounded-2xl overflow-hidden border bg-card"
            style={{ width: 400, height: aiMinimized ? 'auto' : 600 }}
          >
            <Tabs defaultValue="chat" className="flex flex-col h-full">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gradient-to-r from-blue-600/10 to-purple-600/10 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm font-semibold">AI Assistant</span>
                  {selectedWidgetId && !aiMinimized && (
                    <Badge variant="secondary" className="text-[10px]">Widget selected</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <TabsList className="h-6">
                    <TabsTrigger value="chat"    className="text-[10px] h-5 px-2 gap-1"><Bot className="w-2.5 h-2.5" />Chat</TabsTrigger>
                    <TabsTrigger value="suggest" className="text-[10px] h-5 px-2 gap-1"><LayoutGrid className="w-2.5 h-2.5" />Suggest</TabsTrigger>
                    <TabsTrigger value="style"   className="text-[10px] h-5 px-2 gap-1"><Palette className="w-2.5 h-2.5" />Style</TabsTrigger>
                    <TabsTrigger value="config"  className="text-[10px] h-5 px-2 gap-1"><SlidersHorizontal className="w-2.5 h-2.5" />Config</TabsTrigger>
                  </TabsList>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAiMinimized(v => !v)}>
                    {aiMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setAiOpen(false); setAiMinimized(false) }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {!aiMinimized && (
                <div className="flex-1 overflow-hidden min-h-0">
                  <TabsContent value="chat"    className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                    <ConfigChatbot selectedWidgetId={selectedWidgetId} onClose={() => { setAiOpen(false); setAiMinimized(false) }} />
                  </TabsContent>
                  <TabsContent value="suggest" className="mt-0 h-full overflow-y-auto p-4">
                    <ChartSuggester />
                  </TabsContent>
                  <TabsContent value="style"   className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                    <WidgetStylePanel selectedWidgetId={selectedWidgetId} />
                  </TabsContent>
                  <TabsContent value="config"  className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                    {currentDashboardId
                      ? <ProjectConfigPanel dashboardId={currentDashboardId} />
                      : (
                        <div className="flex items-center justify-center h-full p-6 text-center">
                          <div>
                            <SlidersHorizontal className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground">Select a dashboard to configure project settings</p>
                          </div>
                        </div>
                      )
                    }
                  </TabsContent>
                </div>
              )}
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>

      {!aiOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => { setAiOpen(true); setAiMinimized(false) }}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-lg transition-all"
        >
          <Sparkles className="w-4 h-4" />AI Assistant
        </motion.button>
      )}

      <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
      <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
    </div>
  )
}

// ── Fix #1 — use EndpointSummary, not ApiEndpoint from @/types ─
interface BuilderHeaderProps {
  currentDash: { id: string; name: string; description?: string } | undefined
  widgets:     Widget[]
  endpoints:   EndpointSummary[]
  activeFilterCount: number
  exporting:   boolean
  unsaved:     boolean
  scanSummary: DashboardEndpointProbeSummary | null
  isScanningApis: boolean
  onAddWidget: () => void
  onMagicOpen: () => void
  onExport:    () => void
  onScanApis:  () => void
}

function BuilderHeader({
  currentDash, widgets, endpoints,
  activeFilterCount,
  exporting, unsaved,
  scanSummary, isScanningApis,
  onAddWidget, onMagicOpen, onExport, onScanApis,
}: BuilderHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold truncate">{currentDash?.name ?? 'Builder'}</h1>
          <Badge variant="secondary" className="text-[10px]">
            {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {endpoints.length} API{endpoints.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
          </Badge>
          {scanSummary && (
            <>
              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
                {scanSummary.healthy} healthy
              </Badge>
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                {scanSummary.unauthorized + scanSummary.empty} attention
              </Badge>
              <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">
                {scanSummary.failed} failed
              </Badge>
            </>
          )}
          {unsaved && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <Circle className="w-2 h-2 fill-amber-500 text-amber-500" />
              Unsaved changes
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 truncate">
          {currentDash?.description || 'Add widgets from your connected APIs'}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <Link href="/api-config">
          <Button variant="outline" size="sm"><Settings2 className="w-3.5 h-3.5 mr-1.5" />APIs</Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="outline" size="sm"><Eye className="w-3.5 h-3.5 mr-1.5" />Preview</Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={onScanApis}
          disabled={isScanningApis || endpoints.length === 0}
        >
          {isScanningApis
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <Radar className="w-3.5 h-3.5 mr-1.5" />
          }
          {isScanningApis ? 'Scanning...' : 'Scan APIs'}
        </Button>
        <Button variant="outline" size="sm" onClick={onExport} disabled={exporting || widgets.length === 0}>
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {exporting ? 'Exporting…' : 'Export ZIP'}
        </Button>
        <Button
          variant="outline" size="sm" onClick={onMagicOpen}
          className="border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-900 dark:text-purple-400"
        >
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />Magic
        </Button>
        <Button size="sm" onClick={onAddWidget} disabled={endpoints.length === 0}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />Add Widget
        </Button>
      </div>
    </div>
  )
}
