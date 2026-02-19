'use client'

import { useDashboardStore } from '@/store/builder-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WidgetCard } from '@/components/builder/canvas/widget-card'
import Link from 'next/link'
import { FolderKanban, Plus, LayoutGrid, Database } from 'lucide-react'

export default function BuilderPage() {
  const { currentDashboardId, dashboards, getWidgetsByDashboard, endpoints } =
    useDashboardStore()
  const currentDash = dashboards.find(d => d.id === currentDashboardId)
  const widgets = currentDashboardId
    ? getWidgetsByDashboard(currentDashboardId)
    : []

  // No dashboard selected
  if (!currentDash) {
    return (
      <div className="p-8">
        <div className="w-full max-w-2xl mx-auto mt-20">
          <Card>
            <CardContent className="py-12 text-center">
              <FolderKanban className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">No Dashboard Selected</h2>
              <p className="text-muted-foreground mb-6">
                Please select or create a dashboard to start building
              </p>
              <Link href="/workspaces">
                <Button size="lg">
                  <Plus className="w-4 h-4 mr-2" />
                  Go to Dashboards
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="w-full max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-0.5">{currentDash.name}</h1>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {currentDash.description || 'No description'}
              </p>
              <Badge variant="secondary" className="text-[10px]">
                {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {endpoints.length} API{endpoints.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/api-config">
              <Button variant="outline" size="sm">
                <Database className="w-3.5 h-3.5 mr-1.5" />
                Manage APIs
              </Button>
            </Link>
            <Link href="/api-config">
              <Button size="sm">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Widget
              </Button>
            </Link>
          </div>
        </div>

        {/* No APIs connected yet */}
        {endpoints.length === 0 && (
          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
            <CardContent className="py-4 px-4">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    No APIs connected
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Connect a data source first to start creating widgets
                  </p>
                </div>
                <Link href="/api-config">
                  <Button size="sm" variant="outline" className="border-amber-300">
                    Connect API
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Widgets Grid */}
        {widgets.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {widgets.map(widget => (
              <WidgetCard key={widget.id} widget={widget} />
            ))}
          </div>
        )}

        {/* Empty state — APIs exist but no widgets yet */}
        {widgets.length === 0 && endpoints.length > 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <LayoutGrid className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-1">No widgets yet</h3>
              <p className="text-sm text-muted-foreground mb-5">
                Go to API Config, test an endpoint, and click{' '}
                <strong>Add</strong> on a chart suggestion
              </p>
              <Link href="/api-config">
                <Button size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Create first widget
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}
