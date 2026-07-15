'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Database,
  LogOut,
  Menu,
  Moon,
  PanelsTopLeft,
  LayoutDashboard,
  LockKeyhole,
  Network,
  SlidersHorizontal,
  Sun,
  UserRound,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BuilderFlowIndicator } from '@/components/platform/builder-flow-indicator'
import { enableDashboardOsDemoMode } from '@/lib/dashboardos/demo-mode'
import { DASHBOARDOS_THEME_STORAGE_KEY, getDashboardOsThemeVars, type DashboardOsThemeMode } from '@/lib/dashboardos/theme'
import { useAuthStore } from '@/store/auth-store'

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/tenants', label: 'Tenants', icon: Users },
  { href: '/admin/data-sources', label: 'Data Sources', icon: Database },
  { href: '/admin/semantic-model', label: 'Semantic Model', icon: Network },
  { href: '/admin/datasets', label: 'Datasets', icon: BarChart3 },
  { href: '/admin/charts', label: 'Charts', icon: SlidersHorizontal },
  { href: '/admin/publishing', label: 'Publishing', icon: PanelsTopLeft },
]

function DashboardOsThemeToggle({
  mode,
  onToggle,
  label = false,
}: {
  mode: DashboardOsThemeMode
  onToggle: () => void
  label?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} theme`}
      aria-pressed={mode === 'light'}
      className="group inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] px-1.5 text-xs text-[var(--dos-text-secondary)] shadow-sm transition-all duration-300 hover:border-[color:var(--dos-border-mid)] hover:text-[var(--dos-text-primary)]"
    >
      <span className="relative grid h-7 w-16 grid-cols-2 rounded-full bg-[var(--dos-background-deep)] p-1">
        <span
          className={[
            'absolute left-1 top-1 h-5 w-7 rounded-full bg-[var(--dos-accent-primary)] shadow-[0_8px_18px_var(--dos-accent-primary-soft)] transition-transform duration-300 ease-out',
            mode === 'light' ? 'translate-x-7' : 'translate-x-0',
          ].join(' ')}
        />
        <span className="relative z-10 flex items-center justify-center">
          <Moon className={mode === 'dark' ? 'h-3.5 w-3.5 text-[var(--dos-background-deep)]' : 'h-3.5 w-3.5 text-[var(--dos-text-muted)]'} />
        </span>
        <span className="relative z-10 flex items-center justify-center">
          <Sun className={mode === 'light' ? 'h-3.5 w-3.5 text-[var(--dos-background-deep)]' : 'h-3.5 w-3.5 text-[var(--dos-text-muted)]'} />
        </span>
      </span>
      {label ? <span className="pr-2 font-medium text-[var(--dos-text-primary)]">{mode === 'light' ? 'Light' : 'Dark'}</span> : null}
    </button>
  )
}

export function PlatformAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [themeMode, setThemeMode] = useState<DashboardOsThemeMode>('dark')
  const { user, logout } = useAuthStore()

  useEffect(() => {
    const stored = window.localStorage.getItem(DASHBOARDOS_THEME_STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') setThemeMode(stored)
    enableDashboardOsDemoMode()
  }, [pathname])

  const updateThemeMode = (checked: boolean) => {
    const nextMode: DashboardOsThemeMode = checked ? 'light' : 'dark'
    setThemeMode(nextMode)
    window.localStorage.setItem(DASHBOARDOS_THEME_STORAGE_KEY, nextMode)
  }

  const toggleThemeMode = () => updateThemeMode(themeMode !== 'light')

  const renderNavItems = (onNavigate?: () => void) => (
    NAV_ITEMS.map((item) => {
      const Icon = item.icon
      const active = pathname === item.href
        || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`))

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={[
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            active
              ? 'bg-[var(--dos-accent-primary)] text-[var(--dos-background-deep)] shadow-[0_0_20px_var(--dos-accent-primary-soft)]'
              : 'text-slate-400 hover:bg-[var(--dos-surface-muted)] hover:text-slate-100',
          ].join(' ')}
        >
          <Icon className="h-4 w-4" />
          {item.label}
        </Link>
      )
    })
  )

  return (
    <div className="dashboardos-admin min-h-screen bg-[var(--dos-background-base)] text-[var(--dos-text-primary)]" data-dashboardos-theme={themeMode} style={getDashboardOsThemeVars(themeMode)}>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-slate-950/95 px-4 py-5 lg:flex">
        <div className="shrink-0">
          <Link href="/admin" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--dos-accent-primary)] text-[var(--dos-background-deep)] shadow-[0_0_24px_var(--dos-accent-primary-soft)]">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-none text-[var(--dos-text-primary)]">DashboardOS</p>
              <p className="mt-1 truncate text-[11px] text-[var(--dos-text-secondary)]">Managed analytics platform</p>
            </div>
          </Link>

          <div className="mt-7 rounded-lg border border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--dos-warning-text)]">
              <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
              Tenant isolation first
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              Every dashboard, dataset, and report must resolve through tenant and assignment checks.
            </p>
          </div>
        </div>

        <nav className="mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {renderNavItems()}
        </nav>

        <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
          <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-[var(--dos-accent-primary)]" />
              <span className="truncate">{user?.name ?? 'Signed in'}</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-500">{user?.email ?? 'Active admin session'}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 h-8 w-full justify-start px-2 text-slate-400 hover:bg-[var(--dos-surface-muted)] hover:text-slate-100"
              onClick={() => void logout('/login')}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
          <Button asChild variant="outline" className="w-full border-[color:var(--dos-warning)] bg-transparent text-[var(--dos-text-primary)] hover:bg-[var(--dos-warning-soft)] hover:text-[var(--dos-warning-text)]">
            <Link href="/admin/publishing">Review publishing readiness</Link>
          </Button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open admin navigation"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold text-[var(--dos-text-primary)]">DashboardOS</span>
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="text-xs text-[var(--dos-text-secondary)]">Governed analytics workspace</p>
              <h1 className="text-base font-semibold text-[var(--dos-text-primary)]">Analytics Control Center</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300 md:flex">
                <UserRound className="h-3.5 w-3.5 text-[var(--dos-accent-primary)]" />
                <span className="max-w-40 truncate">{user?.name ?? 'Admin'}</span>
              </div>
              <div className="hidden sm:block">
                <DashboardOsThemeToggle mode={themeMode} onToggle={toggleThemeMode} />
              </div>
              <Button asChild size="sm" className="bg-[var(--dos-accent-primary)] text-[var(--dos-background-deep)] hover:bg-[var(--dos-accent-primary-hover)]">
                <Link href="/admin/data-sources">Connect DB</Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 lg:px-8">
          <BuilderFlowIndicator />
          {children}
        </main>
      </div>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="border-white/10 bg-slate-950 text-slate-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>DashboardOS</DialogTitle>
            <DialogDescription className="text-slate-500">
              Navigate admin sections or end the current session.
            </DialogDescription>
          </DialogHeader>
          <nav className="space-y-1">
            {renderNavItems(() => setMobileNavOpen(false))}
          </nav>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 sm:hidden">
              <span>Theme</span>
              <DashboardOsThemeToggle mode={themeMode} onToggle={toggleThemeMode} label />
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
              <UserRound className="h-3.5 w-3.5 text-[var(--dos-accent-primary)]" />
              <span className="truncate">{user?.name ?? 'Signed in'}</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-500">{user?.email ?? 'Active admin session'}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full border-white/10 bg-transparent text-slate-100 hover:bg-white/[0.08]"
              onClick={() => void logout('/login')}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
