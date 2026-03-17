'use client'

// src/app/(viewer)/pdf-export/page.tsx

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from '@/components/builder/canvas/widget-card'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, ArrowLeft, LayoutGrid } from 'lucide-react'
import { PdfSelector } from '@/components/viewer/pdf-selector'
import {
  buildChartNavTree,
  listChartIds,
} from '@/lib/builder/chart-nav-model'

function PdfExportContent() {
  const searchParams = useSearchParams()
  const dashboardId = searchParams.get('dashboardId')

  const {
    dashboards,
    getWidgetsByDashboard,
    getGroupsByDashboard,
    endpoints,
  } = useDashboardStore()

  const [ready, setReady] = useState(false)
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<Set<string>>(new Set())

  const dashboard = dashboards.find(item => item.id === dashboardId)
  const widgets = useMemo(
    () => (dashboardId ? getWidgetsByDashboard(dashboardId) : []),
    [dashboardId, getWidgetsByDashboard],
  )
  const chartGroups = useMemo(
    () => (dashboardId ? getGroupsByDashboard(dashboardId) : []),
    [dashboardId, getGroupsByDashboard],
  )
  const navTree = useMemo(
    () => buildChartNavTree(widgets, chartGroups),
    [widgets, chartGroups],
  )
  const allWidgetIds = useMemo(() => {
    const fromTree = listChartIds(navTree)
    return fromTree.length > 0 ? fromTree : widgets.map(widget => widget.id)
  }, [navTree, widgets])

  const selectedWidgets = useMemo(
    () => widgets.filter(widget => selectedWidgetIds.has(widget.id)),
    [widgets, selectedWidgetIds],
  )
  const usedEndpoints = useMemo(
    () => endpoints.filter(endpoint => selectedWidgets.some(widget => widget.endpointId === endpoint.id)),
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LayoutGrid className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Dashboard not found</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => window.close()}
          >
            Close
          </Button>
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
            page-break-inside: avoid;
          }
          .widget-card { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      <div className="no-print fixed top-0 left-0 right-0 z-50 h-12 border-b bg-white/95 backdrop-blur flex items-center px-6 gap-3 shadow-sm">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.close()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{dashboard.name} - PDF Export</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {selectedCount}/{totalCount} widgets - {usedEndpoints.length} data source{usedEndpoints.length !== 1 ? 's' : ''}
          </p>
        </div>

        {!ready ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Preparing print view...
          </div>
        ) : (
          <Button size="sm" onClick={() => window.print()} disabled={!canPrint}>
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print / Save as PDF ({selectedCount})
          </Button>
        )}
      </div>

      <div className="print-page pt-12 print:pt-0 bg-white min-h-screen">
        <div className="no-print px-8 pt-5">
          <PdfSelector
            categories={navTree.categories}
            selectedIds={selectedWidgetIds}
            onSelectionChange={setSelectedWidgetIds}
          />
        </div>

        <div className="px-8 py-6 border-b">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center">
              <LayoutGrid className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{dashboard.name}</h1>
          </div>

          {dashboard.description && (
            <p className="text-gray-500 text-sm mt-1 ml-11">{dashboard.description}</p>
          )}

          <div className="flex items-center gap-4 mt-3 ml-11">
            <p className="text-xs text-gray-400">Generated: {new Date().toLocaleString()}</p>
            <p className="text-xs text-gray-400">
              Included: {selectedCount} widget{selectedCount !== 1 ? 's' : ''} - {usedEndpoints.length} data source{usedEndpoints.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {!ready && (
          <div className="no-print flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Loading widget data before PDF generation...
              </p>
            </div>
          </div>
        )}

        {ready && selectedWidgets.length === 0 && (
          <div className="no-print px-8 py-14">
            <div className="rounded-xl border border-dashed p-10 text-center">
              <p className="text-sm font-medium text-foreground">No charts selected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Select at least one chart from the token bar to generate PDF output.
              </p>
            </div>
          </div>
        )}

        {ready && selectedWidgets.length > 0 && (
          <div className="px-8 py-6">
            <div className="widget-grid grid grid-cols-1 md:grid-cols-2 gap-5">
              {selectedWidgets.map(widget => (
                <div key={widget.id} className="widget-card">
                  <WidgetCard widget={widget} viewMode />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-8 py-4 border-t mt-6">
          <p className="text-[10px] text-gray-400 text-center">
            Generated by Analytics AI Dashboard Builder - {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
    </>
  )
}

export default function PdfExportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PdfExportContent />
    </Suspense>
  )
}
