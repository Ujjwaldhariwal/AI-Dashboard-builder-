// src/app/view/[token]/page.tsx
// ⚠️ This is a SERVER component — no 'use client'
// The token is decoded server-side, data fetched client-side via WidgetCard

import { decodeShareToken } from '@/lib/share-utils'
import { SharedDashboardViewer } from '@/components/viewer/shared-dashboard-viewer'

interface Props {
  params: Promise<{ token: string }>
}

export default async function SharedViewPage({ params }: Props) {
  const { token } = await params
  const payload = decodeShareToken(token)

  if (!payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔗</span>
          </div>
          <h1 className="text-xl font-bold mb-2">Invalid Share Link</h1>
          <p className="text-sm text-muted-foreground">
            This link is broken or has expired. Ask the dashboard owner for a new link.
          </p>
        </div>
      </div>
    )
  }

  return <SharedDashboardViewer payload={payload} />
}
