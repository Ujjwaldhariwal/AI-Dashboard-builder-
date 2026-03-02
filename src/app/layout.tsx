// Component: Layout
// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/error-boundary'
import { AuthInitializer } from '@/components/auth-initializer'

export const metadata: Metadata = {
  title: 'Analytics AI Dashboard Builder',
  description: 'Internal AI-powered dashboard builder',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <Providers>
          <AuthInitializer /> {/* 👈 Initializes Supabase Auth Session */}
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
