// Component: Layout
// src/app/(builder)/layout.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import { AppLayout } from '@/components/layout/app-layout'
import { Loader2 } from 'lucide-react'

export default function BuilderGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isAuthenticated, isLoading, checkSession } = useAuthStore()

  // ✅ On every fresh page load, re-hydrate auth from Supabase cookie
  useEffect(() => {
    checkSession()
  }, [])

  // ✅ Only redirect AFTER session check is complete
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, isLoading, router])

  // ✅ Show spinner while session is being verified — never redirect prematurely
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  return <AppLayout>{children}</AppLayout>
}
