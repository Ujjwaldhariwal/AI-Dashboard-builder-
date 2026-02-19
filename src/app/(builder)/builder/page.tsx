'use client'

import { useDashboardStore } from '@/store/builder-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { FolderKanban, Plus } from 'lucide-react'

export default function BuilderPage() {
  const { currentDashboardId, dashboards } = useDashboardStore()
  const currentDash = dashboards.find(d => d.id === currentDashboardId)

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
    <div className="p-8">
      <div className="w-full max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">{currentDash.name}</h1>
            <p className="text-muted-foreground">{currentDash.description}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/api-config">
              <Button variant="outline">Configure APIs</Button>
            </Link>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Widget
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="py-20 text-center">
            <div className="max-w-md mx-auto">
              <h3 className="text-xl font-semibold mb-2">Visual Builder Coming Soon</h3>
              <p className="text-muted-foreground mb-4">
                Drag-and-drop canvas for charts and widgets will be added in Phase 2
              </p>
              <Link href="/api-config">
                <Button>Configure Data Sources First</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}