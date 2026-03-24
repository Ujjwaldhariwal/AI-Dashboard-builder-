'use client'

// src/app/(viewer)/pdf-export/page.tsx
// ─────────────────────────────────────────────────────────
// Fixed: responsive toolbar, proper spacing, optimized
// ─────────────────────────────────────────────────────────

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from '@/components/builder/canvas/widget-card'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, ArrowLeft, LayoutGrid, FileDown } from 'lucide-react'
import { PdfSelector } from '@/components/viewer/pdf-selector'
import { buildChartNavTree, listChartIds } from '@/lib/builder/chart-nav-model'

function PdfExportContent() {
  const searchParams = useSearchParams()
  const dashboardId = searchParams.get('dashboardId')

  const { dashboards, getWidgetsByDashboard, getGroupsByDashboard, endpoints } = useDashboardStore()

  const [ready, setReady] = useState(false)
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<Set<string>>(new Set())

  const dashboard = useMemo(
    () => dashboards.find(d => d.id === dashboardId),
    [dashboards, dashboardId],
  )
  const widgets = useMemo(
    () => (dashboardId ? getWidgetsByDashboard(dashboardId) : []),
    [dashboardId, getWidgetsByDashboard],
  )
  const chartGroups = useMemo(
    () => (dashboardId ? getGroupsByDashboard(dashboardId) : []),
    [dashboardId, getGroupsByDashboard],
  )
  const useTaxonomyFallback = chartGroups.length === 0
  const navTree = useMemo(
    () =>
      buildChartNavTree(widgets, chartGroups, {
        endpointLookup: Object.fromEntries(
          endpoints.map(ep => [ep.id, { name: ep.name, url: ep.url }]),
        ),
        useTaxonomyFallback,
      }),
    [widgets, chartGroups, endpoints, useTaxonomyFallback],
  )
  const allWidgetIds = useMemo(() => {
    const fromTree = listChartIds(navTree)
    return fromTree.length > 0 ? fromTree : widgets.map(w => w.id)
  }, [navTree, widgets])

  const selectedWidgets = useMemo(
    () => widgets.filter(w => selectedWidgetIds.has(w.id)),
    [widgets, selectedWidgetIds],
  )
  const usedEndpoints = useMemo(
    () => endpoints.filter(ep => selectedWidgets.some(w => w.endpointId === ep.id)),
    [endpoints, selectedWidgets],
  )

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1200)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    setSelectedWidgetIds(new Set(allWidgetIds))
  }, [allWidgetIds])

  if (!dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <LayoutGrid className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Dashboard not found</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => window.close()}>Close</Button>
        </div>
      </div>
    )
  }

  const selectedCount = selectedWidgets.length
  const totalCount = widgets.length
  const canPrint = ready && selectedCount > 0

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .print-page { margin: 0; padding: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .widget-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
          }
          .widget-card { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {/* ── Fixed toolbar — responsive ─────────────────── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 border-b bg-white/95 backdrop-blur shadow-sm">
        {/* Top row */}
        <div className="h-12 flex items-center px-4 sm:px-6 gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => window.close()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{dashboard.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {selectedCount}/{totalCount} charts · {usedEndpoints.length} source{usedEndpoints.length !== 1 ? 's' : ''}
            </p>
          </div>

          {!ready ? (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Preparing...</span>
            </div>
          ) : (
            <Button size="sm" onClick={() => window.print()} disabled={!canPrint} className="shrink-0">
              <Printer className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Print / Save PDF ({selectedCount})</span>
              <span className="sm:hidden">{selectedCount}</span>
            </Button>
          )}
        </div>

        {/* Token bar / selector */}
        {dashboardId && widgets.length > 0 && (
          <div className="px-4 sm:px-6 pb-2.5">
            <PdfSelector
              categories={navTree.categories}
              selectedIds={selectedWidgetIds}
              onSelectionChange={setSelectedWidgetIds}
            />
          </div>
        )}
      </div>

      {/* ── PDF content ────────────────────────────────── */}
      <div className="print-page pt-28 sm:pt-24 print:pt-0 bg-white min-h-screen">
        {/* Report header */}
        <div className="px-4 sm:px-8 py-4 sm:py-6 border-b">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shrink-0">
              <LayoutGrid className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{dashboard.name}</h1>
          </div>
          {dashboard.description && (
            <p className="text-gray-500 text-sm mt-1 ml-11 truncate">{dashboard.description}</p>
          )}
          <div className="flex items-center gap-4 mt-3 ml-11 flex-wrap">
            <p className="text-xs text-gray-400">Generated: {new Date().toLocaleString()}</p>
            <p className="text-xs text-gray-400">
              {selectedCount} chart{selectedCount !== 1 ? 's' : ''} · {usedEndpoints.length} source{usedEndpoints.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Loading */}
        {!ready && (
          <div className="no-print flex items-center justify-center py-16 sm:py-20">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Loading widget data...</p>
            </div>
          </div>
        )}

        {/* No selection */}
        {ready && selectedWidgets.length === 0 && (
          <div className="no-print px-4 sm:px-8 py-10 sm:py-14">
            <div className="rounded-xl border border-dashed p-8 sm:p-10 text-center">
              <FileDown className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No charts selected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Select charts from the bar above to include in your PDF.
              </p>
            </div>
          </div>
        )}

        {/* Widget grid */}
        {ready && selectedWidgets.length > 0 && (
          <div className="px-4 sm:px-8 py-4 sm:py-6">
            <div className="widget-grid grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {selectedWidgets.map(widget => (
                <div key={widget.id} className="widget-card">
                  <WidgetCard widget={widget} viewMode />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 sm:px-8 py-4 border-t mt-6">
          <p className="text-[10px] text-gray-400 text-center">
            Generated by Analytics AI Dashboard Builder · {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
    </>
  )
}

export default function PdfExportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <PdfExportContent />
    </Suspense>
  )
}
