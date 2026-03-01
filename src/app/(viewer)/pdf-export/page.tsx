'use client'

// src/app/(viewer)/pdf-export/page.tsx

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from '@/components/builder/canvas/widget-card'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, ArrowLeft, LayoutGrid } from 'lucide-react'

export default function PdfExportPage() {
  const searchParams      = useSearchParams()
  const dashboardId       = searchParams.get('dashboardId')
  const { dashboards, getWidgetsByDashboard, endpoints } = useDashboardStore()
  const [ready, setReady] = useState(false)

  const dashboard = dashboards.find(d => d.id === dashboardId)
  const widgets   = dashboardId ? getWidgetsByDashboard(dashboardId) : []
  const usedEps   = endpoints.filter(e => widgets.some(w => w.endpointId === e.id))

  // Wait for widgets to load data then trigger print
  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true)
    }, 2000) // 2s for all widgets to fetch data
    return () => clearTimeout(timer)
  }, [])

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

  return (
    <>
      {/* Print styles injected inline */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .print-page {
            margin: 0;
            padding: 0;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .widget-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
            page-break-inside: avoid;
          }
          .widget-card {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      {/* Toolbar — hidden on print */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 h-12 border-b bg-white/95 backdrop-blur flex items-center px-6 gap-3 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => window.close()}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <p className="text-sm font-semibold">{dashboard.name} — PDF Export</p>
          <p className="text-[11px] text-muted-foreground">
            {widgets.length} widget{widgets.length !== 1 ? 's' : ''} ·{' '}
            {usedEps.length} data source{usedEps.length !== 1 ? 's' : ''}
          </p>
        </div>
        {!ready ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading widget data...
          </div>
        ) : (
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print / Save as PDF
          </Button>
        )}
      </div>

      {/* PDF Content */}
      <div className="print-page pt-12 print:pt-0 bg-white min-h-screen">

        {/* Page header */}
        <div className="px-8 py-6 border-b">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <LayoutGrid className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{dashboard.name}</h1>
          </div>
          {dashboard.description && (
            <p className="text-gray-500 text-sm mt-1 ml-11">{dashboard.description}</p>
          )}
          <div className="flex items-center gap-4 mt-3 ml-11">
            <p className="text-xs text-gray-400">
              Generated: {new Date().toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">
              {widgets.length} widgets · {usedEps.length} data sources
            </p>
          </div>
        </div>

        {/* Loading state */}
        {!ready && (
          <div className="no-print flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Loading all widget data before PDF generation...
              </p>
            </div>
          </div>
        )}

        {/* Widget grid */}
        {ready && (
          <div className="px-8 py-6">
            <div className="widget-grid grid grid-cols-1 md:grid-cols-2 gap-5">
              {widgets.map(widget => (
                <div key={widget.id} className="widget-card">
                  <WidgetCard widget={widget} viewMode />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-4 border-t mt-6">
          <p className="text-[10px] text-gray-400 text-center">
            Generated by Analytics AI Dashboard Builder · {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
    </>
  )
}
