'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import {
  DASHBOARDOS_THEME_STORAGE_KEY,
  getDashboardOsThemeVars,
  type DashboardOsThemeMode,
} from '@/lib/dashboardos/theme'

export const DASHBOARDOS_THEME_CHANGE_EVENT = 'dashboardos-theme-change'

function readStoredTheme(): DashboardOsThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(DASHBOARDOS_THEME_STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

export function ClientThemeShell({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DashboardOsThemeMode>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMode(readStoredTheme())
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    window.localStorage.setItem(DASHBOARDOS_THEME_STORAGE_KEY, mode)
    document.documentElement.dataset.dashboardosTheme = mode
    window.dispatchEvent(new CustomEvent(DASHBOARDOS_THEME_CHANGE_EVENT, { detail: { mode } }))
  }, [mode, mounted])

  const nextMode = mode === 'dark' ? 'light' : 'dark'
  const Icon = mode === 'dark' ? Sun : Moon

  return (
    <div
      className="dashboardos-client min-h-screen bg-[var(--dos-background-base)] text-[var(--dos-text-primary)]"
      data-dashboardos-theme={mode}
      style={getDashboardOsThemeVars(mode)}
    >
      <button
        type="button"
        aria-label={`Switch to ${nextMode} mode`}
        title={`Switch to ${nextMode} mode`}
        onClick={() => setMode(nextMode)}
        className="fixed right-4 top-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--dos-border-mid)] bg-[var(--dos-surface-raised)] text-[var(--dos-text-primary)] hover:border-[color:var(--dos-accent-primary)] hover:text-[var(--dos-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)] focus-visible:ring-offset-2 active:bg-[var(--dos-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon className="h-4 w-4" />
      </button>
      {children}
    </div>
  )
}
