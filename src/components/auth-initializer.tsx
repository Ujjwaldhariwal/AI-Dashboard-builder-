// Component: AuthInitializer
// src/components/auth-initializer.tsx
'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/auth-store'

export function AuthInitializer() {
  const { checkSession } = useAuthStore()
  const initialized = useRef(false)

  useEffect(() => {
    // Prevent double-firing in React 18 Strict Mode
    if (!initialized.current) {
      initialized.current = true
      checkSession()
    }
  }, [checkSession])

  return null
}
