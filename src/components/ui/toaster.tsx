// Component: Toaster
// src/components/ui/toaster.tsx
'use client'

import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        style: {
          background: 'rgba(17, 24, 39, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(0, 217, 255, 0.3)',
          color: 'white',
        },
      }}
    />
  )
}
