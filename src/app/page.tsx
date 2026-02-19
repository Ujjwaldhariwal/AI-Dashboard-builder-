'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'

export default function HomePage() {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/workspaces')
    } else {
      router.replace('/login')
    }
  }, [isAuthenticated, router])

  return null
}
