'use client'

import { useDashboardStore } from '@/store/builder-store'
import { WidgetCard } from '@/components/builder/canvas/widget-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LayoutGrid, RefreshCw, Download, Share2, FolderKanban } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

export default function ViewerPage() {
  const { dashboards, currentDashboardId, getWidgetsByDashboard, endpoints } =
    useDashboardStore()
  const [refreshKey, setRefreshKey] = useState(0)

  const currentDash = dashboards.find(d => d.id === currentDashboardId)
  const widgets = currentDashboardId
    ? getWidgetsByDashboard(currentDashboardId)
    : []

  const handleRefreshAll = () => {
    setRefreshKey(k => k + 1)
    toast.success('All widgets refreshed')
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Link copied to clipboard')
  }

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

  return (
    <div className="min-h-screen bg-background">
      {/* Viewer Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <LayoutGrid className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold">{currentDash.name}</h1>
              <p className="text-xs text-muted-foreground">
                {currentDash.description || 'AI Dashboard'}
              </p>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefreshAll}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh All
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="w-3.5 h-3.5 mr-1.5" />
              Share
            </Button>
            <Link href="/builder">
              <Button size="sm">
                Edit Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Widgets */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {widgets.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" key={refreshKey}>
            {widgets.map(widget => (
              <WidgetCard key={widget.id} widget={widget} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24">
            <LayoutGrid className="w-16 h-16 text-muted-foreground mb-4" />
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
