// Component: Layout
// src/app/layout.tsx
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/error-boundary'
import { AuthInitializer } from '@/components/auth-initializer'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-dashboard-sans',
  display: 'swap',
  weight: '100 900',
})

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-dashboard-mono',
  display: 'swap',
  weight: '100 900',
})

export const metadata: Metadata = {
  title: 'DashboardOS',
  description: 'Multi-tenant managed dashboard platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}>
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
