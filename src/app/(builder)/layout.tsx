// Component: Layout
// src/app/(builder)/layout.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import { AppLayout } from '@/components/layout/app-layout'
import { Loader2 } from 'lucide-react'
import { SessionExpiredModal } from '@/components/layout/session-expired-modal'
import {
  consumeSessionExpiredSignalCookie,
} from '@/lib/auth/session-expired-signal'

export default function BuilderGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const isLoading = useAuthStore(s => s.isLoading)
  const authIssue = useAuthStore(s => s.authIssue)
  const markExpired = useAuthStore(s => s.markExpired)
  const [expiredSignalChecked, setExpiredSignalChecked] = useState(false)
  const [expiredSignalDetected, setExpiredSignalDetected] = useState(false)
  const isBuilderCanvasRoute = pathname.startsWith('/builder')
  const allowExpiredOverlay = isBuilderCanvasRoute && (authIssue === 'expired' || expiredSignalDetected)
  const canRedirect = !isBuilderCanvasRoute || expiredSignalChecked

  useEffect(() => {
    if (!isBuilderCanvasRoute) {
      setExpiredSignalDetected(false)
      setExpiredSignalChecked(true)
      return
    }

    const detected = consumeSessionExpiredSignalCookie()
    if (detected) {
      setExpiredSignalDetected(true)
      markExpired()
    } else {
      setExpiredSignalDetected(false)
    }

    setExpiredSignalChecked(true)
  }, [isBuilderCanvasRoute, markExpired])

  useEffect(() => {
    if (!canRedirect) return
    if (!isLoading && !isAuthenticated && !allowExpiredOverlay) {
      router.replace('/login')
    }
  }, [allowExpiredOverlay, canRedirect, isAuthenticated, isLoading, router])

  if ((!canRedirect || isLoading) && !allowExpiredOverlay) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated && !allowExpiredOverlay) return null

  return (
    <>
      <AppLayout>{children}</AppLayout>
      {isBuilderCanvasRoute ? <SessionExpiredModal /> : null}
    </>
  )
}
