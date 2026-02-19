'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Settings</h1>
        <Card>
          <CardHeader>
            <CardTitle>Coming Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Settings page will be added in Phase 3</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
