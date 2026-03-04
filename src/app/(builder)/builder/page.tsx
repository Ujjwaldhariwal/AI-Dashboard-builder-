//src/app/(builder)/builder/page.tsx
'use client'

import { useEffect, useState } from 'react'
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
import { toast } from 'sonner'
import {
  Plus, Settings2, Eye, Database, FolderKanban,
  Download, Wand2, Sparkles, X, Bot,
  LayoutGrid, Circle, Minimize2, Maximize2,
} from 'lucide-react'
import Link from 'next/link'
import { buildDashboardConfig, slugifyDashboardName } from '@/lib/code-generator/config-builder'
import { generateProjectFromConfig } from '@/lib/code-generator/template-generator'
import { packageProjectAsZip } from '@/lib/code-generator/zip-packager'
import { motion, AnimatePresence } from 'framer-motion'
import { WidgetStylePanel } from '@/components/builder/style-panel/widget-style-panel'
import { Palette } from 'lucide-react'


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

  const [addWidgetOpen, setAddWidgetOpen]       = useState(false)
  const [magicOpen, setMagicOpen]               = useState(false)
  const [exporting, setExporting]               = useState(false)
  const [aiOpen, setAiOpen]                     = useState(false)
  const [aiMinimized, setAiMinimized]           = useState(false)
  const [lastSavedCount, setLastSavedCount]     = useState(0)
  const [unsaved, setUnsaved]                   = useState(false)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)

  useEffect(() => {
    if (!currentDashboardId && dashboards.length > 0) {
      setCurrentDashboard(dashboards[0].id)
    }
  }, [currentDashboardId, dashboards, setCurrentDashboard])

  const currentDash = dashboards.find(d => d.id === currentDashboardId)
  const widgets     = currentDashboardId ? getWidgetsByDashboard(currentDashboardId) : []

  // ✅ FIX: added lastSavedCount to deps to avoid stale closure
  useEffect(() => {
    if (widgets.length !== lastSavedCount) setUnsaved(true)
  }, [widgets.length, lastSavedCount])

  const handleCanvasClick = () => setSelectedWidgetId(null)

  const handleExport = async () => {
    if (!currentDash)    { toast.error('No active dashboard'); return }
    if (!widgets.length) { toast.error('Add at least one widget first'); return }
    setExporting(true)
    toast.loading('Generating project…', { id: 'export' })
    try {
      const config = buildDashboardConfig(currentDash, endpoints, allWidgets)
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
      setLastSavedCount(widgets.length)
      setUnsaved(false)
    } catch (err: any) {
      toast.error('Export failed: ' + err.message, { id: 'export' })
    } finally {
      setExporting(false)
    }
  }

  // ── No dashboard ──────────────────────────────────────────────
  if (dashboards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2">No Dashboard Yet</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Create one from Workspaces first.
          </p>
          <Button onClick={() => router.push('/workspaces')}>Go to Workspaces</Button>
        </div>
      </div>
    )
  }

  // ── No APIs ───────────────────────────────────────────────────
  if (endpoints.length === 0 && widgets.length === 0) {
    return (
      <div className="p-6">
        {/* ✅ FIX: removed aiOpen + onToggleAI from BuilderHeader */}
        <BuilderHeader
          currentDash={currentDash}
          widgets={widgets}
          endpoints={endpoints}
          exporting={exporting}
          unsaved={false}
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicOpen={() => setMagicOpen(true)}
          onExport={handleExport}
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
                <Wand2 className="w-4 h-4 mr-2" />
                Magic Auto-Build
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

  // ── Main Builder ──────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* Header — ✅ FIX: removed aiOpen + onToggleAI */}
      <div className="px-6 pt-5 pb-3 border-b bg-card/80 backdrop-blur flex-shrink-0">
        <BuilderHeader
          currentDash={currentDash}
          widgets={widgets}
          endpoints={endpoints}
          exporting={exporting}
          unsaved={unsaved}
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicOpen={() => setMagicOpen(true)}
          onExport={handleExport}
        />
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-y-auto p-6"
        onClick={handleCanvasClick}
      >
        <DragDropCanvas
          selectedWidgetId={selectedWidgetId}
          onSelectWidget={setSelectedWidgetId}
        />
      </div>

{/* ── Floating AI Overlay ─────────────────────────────────
    Style tab added as 3rd tab — visual alternative to AI chat
─────────────────────────────────────────────────────────── */}
<AnimatePresence>
  {aiOpen && (
    <motion.div
      key="ai-overlay"
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="fixed bottom-5 right-5 z-50 shadow-2xl rounded-2xl overflow-hidden border bg-card"
      style={{ width: 380, height: aiMinimized ? 'auto' : 580 }}
    >
      <Tabs defaultValue="chat" className="flex flex-col h-full">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gradient-to-r from-blue-600/10 to-purple-600/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold">AI Assistant</span>
            {selectedWidgetId && !aiMinimized && (
              <Badge variant="secondary" className="text-[10px]">Styling widget</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <TabsList className="h-6">
              <TabsTrigger value="chat" className="text-[10px] h-5 px-2 gap-1">
                <Bot className="w-2.5 h-2.5" />Chat
              </TabsTrigger>
              <TabsTrigger value="suggest" className="text-[10px] h-5 px-2 gap-1">
                <LayoutGrid className="w-2.5 h-2.5" />Suggest
              </TabsTrigger>
              <TabsTrigger value="style" className="text-[10px] h-5 px-2 gap-1">
                <Palette className="w-2.5 h-2.5" />Style
              </TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => setAiMinimized(v => !v)}>
              {aiMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => { setAiOpen(false); setAiMinimized(false) }}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Body */}
        {!aiMinimized && (
          <div className="flex-1 overflow-hidden min-h-0">
            <TabsContent value="chat"
              className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              <ConfigChatbot selectedWidgetId={selectedWidgetId}
                onClose={() => { setAiOpen(false); setAiMinimized(false) }} />
            </TabsContent>
            <TabsContent value="suggest" className="mt-0 h-full overflow-y-auto p-4">
              <ChartSuggester />
            </TabsContent>
            <TabsContent value="style"
              className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              <WidgetStylePanel selectedWidgetId={selectedWidgetId} />
            </TabsContent>
          </div>
        )}
      </Tabs>
    </motion.div>
  )}
</AnimatePresence>


      {/* Floating trigger button — only source of truth for opening AI */}
      {!aiOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => { setAiOpen(true); setAiMinimized(false) }}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-lg transition-all"
        >
          <Sparkles className="w-4 h-4" />
          AI Assistant
        </motion.button>
      )}

      <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
      <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
    </div>
  )
}

// ── Builder Header ─────────────────────────────────────────────
// ✅ FIX: Removed aiOpen + onToggleAI — AI is only in floating button
interface BuilderHeaderProps {
  currentDash: any
  widgets:     any[]
  endpoints:   any[]
  exporting:   boolean
  unsaved:     boolean
  onAddWidget: () => void
  onMagicOpen: () => void
  onExport:    () => void
}

function BuilderHeader({
  currentDash,
  widgets,
  endpoints,
  exporting,
  unsaved,
  onAddWidget,
  onMagicOpen,
  onExport,
}: BuilderHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
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
          {exporting ? 'Exporting…' : 'Export'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onMagicOpen}
          className="border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-900 dark:text-purple-400"
        >
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
          Magic
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
