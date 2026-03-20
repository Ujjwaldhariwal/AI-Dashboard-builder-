'use client'

// src/components/layout/app-layout.tsx

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Database, FolderTree,
  Settings, LogOut, Search,
  Activity, ChevronRight, FolderKanban,
  Shield, BadgeCheck, X, GitBranch,
  Menu,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDashboardStore } from '@/store/builder-store'
import { useAuthStore } from '@/store/auth-store'
import { useMonitoringStore } from '@/store/monitoring-store'
import { NotificationBell } from '@/components/layout/notification-bell'
import { MonitoringPanel } from '@/components/layout/monitoring-panel'
import { OnboardingWizard } from '@/components/layout/onboarding-wizard'
import { KeyboardShortcuts } from '@/components/layout/keyboard-shortcuts'
import { TokenSessionTimer } from '@/components/layout/token-session-timer'
import type { DashboardEndpointProbeSummary } from '@/lib/api/endpoint-runtime-cache'
import {
  BUILDER_API_HEALTH_EVENT,
  dispatchBuilderApiHealthRescan,
} from '@/lib/builder/api-health-events'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

interface AppLayoutProps {
  children: React.ReactNode
}

// ── Search result type ────────────────────────────────────────────────────
interface SearchResult {
  id:      string
  label:   string
  sub:     string
  href:    string
  type:    'dashboard' | 'api' | 'page'
  action?: () => void
}

type SidebarHealthFilters = {
  healthy: boolean
  unauthorized: boolean
  failed: boolean
  empty: boolean
}

function getSidebarHealthBucket(
  status: DashboardEndpointProbeSummary['results'][number]['status'],
): keyof SidebarHealthFilters {
  if (status === 'healthy') return 'healthy'
  if (status === 'unauthorized') return 'unauthorized'
  if (status === 'empty') return 'empty'
  return 'failed'
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const router   = useRouter()

  const { endpoints, dashboards, widgets, currentDashboardId, setCurrentDashboard } =
    useDashboardStore()
  const { user, logout } = useAuthStore()
  const { logs, getErrorCount } = useMonitoringStore()

  const [monitoringOpen, setMonitoringOpen] = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const [searchFocused, setSearchFocused]   = useState(false)
  const [sidebarOpen, setSidebarOpen]       = useState(false)
  const [builderHealthSummary, setBuilderHealthSummary] =
    useState<DashboardEndpointProbeSummary | null>(null)
  const [builderHealthFilters, setBuilderHealthFilters] = useState<SidebarHealthFilters>({
    healthy: true,
    unauthorized: true,
    failed: true,
    empty: true,
  })
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Navigation (recomputes only when currentDashboardId changes) ──────
  const navigation = useMemo(() => [
    { name: 'Dashboards', href: '/workspaces', icon: LayoutDashboard, show: true },
    { name: 'Builder',    href: '/builder',    icon: FolderTree,      show: !!currentDashboardId },
    { name: 'API Config', href: '/api-config', icon: Database,        show: !!currentDashboardId },
    { name: 'Auth Flow',  href: '/auth-flow',  icon: GitBranch,       show: !!currentDashboardId },
    { name: 'Monitoring', href: '/monitoring',  icon: Activity,        show: !!currentDashboardId },
    { name: 'Settings',   href: '/settings',    icon: Settings,        show: true },
  ], [currentDashboardId])

  const handleLogout = useCallback(async () => {
    await logout()
    router.push('/login')
  }, [logout, router])

  const currentDashboard  = dashboards.find(d => d.id === currentDashboardId)
  const activeWidgetCount = currentDashboardId
    ? widgets.filter(w => w.dashboardId === currentDashboardId).length
    : widgets.length
  const errorCount     = getErrorCount()
  const recentLogCount = logs.length
  const isBuilderRoute = pathname?.startsWith('/builder') ?? false

  const visibleSidebarHealthResults = useMemo(
    () => (builderHealthSummary?.results ?? []).filter(result => {
      const bucket = getSidebarHealthBucket(result.status)
      return builderHealthFilters[bucket]
    }),
    [builderHealthSummary, builderHealthFilters],
  )

  // ── Search results ────────────────────────────────────────────────────
  const searchResults = useMemo<SearchResult[]>(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()

    const dashResults: SearchResult[] = dashboards
      .filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q),
      )
      .slice(0, 4)
      .map(d => ({
        id:     `dash-${d.id}`,
        label:  d.name,
        sub:    d.description || 'Dashboard',
        href:   '/builder',
        type:   'dashboard' as const,
        action: () => { setCurrentDashboard(d.id); router.push('/builder') },
      }))

    const apiResults: SearchResult[] = endpoints
      .filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q),
      )
      .slice(0, 3)
      .map(e => ({
        id:    `ep-${e.id}`,
        label: e.name,
        sub:   e.url,
        href:  '/api-config',
        type:  'api' as const,
      }))

    const pageResults: SearchResult[] = (
      [
        { id: 'p-ws',  label: 'Dashboards', sub: 'All dashboards',   href: '/workspaces', type: 'page' as const },
        { id: 'p-api', label: 'API Config', sub: 'Manage endpoints', href: '/api-config', type: 'page' as const },
        { id: 'p-mon', label: 'Monitoring', sub: 'Logs & health',    href: '/monitoring', type: 'page' as const },
        { id: 'p-set', label: 'Settings',   sub: 'App settings',     href: '/settings',   type: 'page' as const },
      ] satisfies SearchResult[]
    ).filter(p => p.label.toLowerCase().includes(q))

    return [...dashResults, ...apiResults, ...pageResults].slice(0, 8)
  }, [searchQuery, dashboards, endpoints, setCurrentDashboard, router])

  const handleSearchSelect = useCallback((result: SearchResult) => {
    if (result.action) result.action()
    else router.push(result.href)
    setSearchQuery('')
    setSearchFocused(false)
  }, [router])

  // ── Close sidebar on route change (mobile) ────────────────────────────
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // ── Keyboard shortcuts: Escape, ⌘K ───────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchQuery('')
        setSearchFocused(false)
        setSidebarOpen(false)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Builder health event listener ─────────────────────────────────────
  useEffect(() => {
    const handleBuilderHealth = (event: Event) => {
      const detail = (event as CustomEvent<DashboardEndpointProbeSummary | null>).detail
      setBuilderHealthSummary(detail ?? null)
    }
    window.addEventListener(BUILDER_API_HEALTH_EVENT, handleBuilderHealth as EventListener)
    return () => {
      window.removeEventListener(BUILDER_API_HEALTH_EVENT, handleBuilderHealth as EventListener)
    }
  }, [])

  useEffect(() => {
    if (!pathname?.startsWith('/builder')) {
      setBuilderHealthSummary(null)
    }
  }, [pathname])

  // ── Helpers ───────────────────────────────────────────────────────────
  const typeIcon = (type: SearchResult['type']) => {
    if (type === 'dashboard') return <FolderKanban className="w-3.5 h-3.5 text-blue-500" />
    if (type === 'api')       return <Database className="w-3.5 h-3.5 text-purple-500" />
    return                           <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
  }

  const roleBadgeClass = user?.role === 'admin'
    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'

  // ── Sidebar content (shared between mobile overlay and desktop fixed) ─
  const sidebarContent = (
    <>
      <nav className="p-3 space-y-0.5">
        {navigation.filter(item => item.show).map(item => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          const Icon     = item.icon
          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                className="w-full justify-start h-9 text-sm"
              >
                <Icon className="w-4 h-4 mr-2.5" />
                {item.name}
                {item.name === 'Monitoring' && errorCount > 0 && (
                  <Badge variant="destructive" className="ml-auto text-[9px] px-1.5 h-4">
                    {errorCount}
                  </Badge>
                )}
              </Button>
            </Link>
          )
        })}
      </nav>

      {/* Quick stats */}
      <div className="p-3 mt-4 border-t">
        <h3 className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Quick Stats
        </h3>
        <div className="space-y-1.5">
          {[
            { label: 'Active APIs', value: endpoints.length },
            { label: 'Dashboards',  value: dashboards.length },
            { label: 'Widgets',     value: activeWidgetCount },
            { label: 'Log entries', value: recentLogCount },
          ].map(stat => (
            <div key={stat.label} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-semibold">{stat.value}</span>
            </div>
          ))}
          {errorCount > 0 && (
            <div className="flex justify-between text-xs items-center">
              <span className="text-red-500">Errors</span>
              <Badge variant="destructive" className="text-[9px] px-1.5 h-4">
                {errorCount}
              </Badge>
            </div>
          )}
        </div>

        {currentDashboardId && (
          <Link href="/monitoring" className="block mt-3">
            <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5">
              <Activity className="w-3 h-3" />
              View Full Monitoring
            </Button>
          </Link>
        )}
      </div>

      {/* Builder health snapshot */}
      {isBuilderRoute && builderHealthSummary && (
        <div className="p-3 border-t">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">
                API Health
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                Builder scan summary
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2.5 text-[10px] flex-shrink-0"
              onClick={dispatchBuilderApiHealthRescan}
              title="Run API health scan"
            >
              Rescan
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <button
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                builderHealthFilters.healthy
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-950/30'
              }`}
              onClick={() => setBuilderHealthFilters(c => ({ ...c, healthy: !c.healthy }))}
            >
              <p className="text-sm font-bold leading-tight">{builderHealthSummary.healthy}</p>
              <p className="text-[10px] leading-tight mt-0.5">Healthy</p>
            </button>
            <button
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                builderHealthFilters.unauthorized
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-950/30'
              }`}
              onClick={() => setBuilderHealthFilters(c => ({ ...c, unauthorized: !c.unauthorized }))}
            >
              <p className="text-sm font-bold leading-tight">{builderHealthSummary.unauthorized}</p>
              <p className="text-[10px] leading-tight mt-0.5">Auth</p>
            </button>
            <button
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                builderHealthFilters.empty
                  ? 'bg-slate-600 text-white border-slate-600'
                  : 'border-slate-200 text-slate-700 bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:bg-slate-900/30'
              }`}
              onClick={() => setBuilderHealthFilters(c => ({ ...c, empty: !c.empty }))}
            >
              <p className="text-sm font-bold leading-tight">{builderHealthSummary.empty}</p>
              <p className="text-[10px] leading-tight mt-0.5">Empty</p>
            </button>
            <button
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                builderHealthFilters.failed
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'border-rose-200 text-rose-700 bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:bg-rose-950/30'
              }`}
              onClick={() => setBuilderHealthFilters(c => ({ ...c, failed: !c.failed }))}
            >
              <p className="text-sm font-bold leading-tight">{builderHealthSummary.failed}</p>
              <p className="text-[10px] leading-tight mt-0.5">Failed</p>
            </button>
          </div>

          {visibleSidebarHealthResults.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">
              No APIs match active filters.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-auto">
              {visibleSidebarHealthResults.slice(0, 6).map(result => {
                const bucket = getSidebarHealthBucket(result.status)
                const statusClass = bucket === 'healthy'
                  ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-950/30'
                  : bucket === 'unauthorized' || bucket === 'empty'
                    ? 'border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-950/30'
                    : 'border-rose-300 text-rose-700 bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:bg-rose-950/30'

                return (
                  <div key={`${result.endpointId ?? result.url}-${result.status}`} className="rounded-lg border p-2.5 bg-background space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-medium leading-snug break-words min-w-0">
                        {result.endpointName || result.url}
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 h-[18px] flex-shrink-0 whitespace-nowrap ${statusClass}`}
                      >
                        {result.status}
                      </Badge>
                    </div>
                    {result.likelyReason && (
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        {result.likelyReason}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )

  return (
    <div className="min-h-screen bg-background">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b bg-card/95 backdrop-blur">
        <div className="flex h-full items-center px-3 sm:px-4 gap-2 sm:gap-3">

          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:hidden flex-shrink-0"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </Button>

          {/* Logo */}
          <Link href="/workspaces" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base hidden sm:block">Analytics AI</span>
          </Link>

          {/* Breadcrumb */}
          {currentDashboard && (
            <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
              <ChevronRight className="w-3 h-3" />
              <button
                className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors font-medium text-foreground"
                onClick={() => router.push('/workspaces')}
              >
                <FolderKanban className="w-3 h-3 text-blue-500" />
                <span className="max-w-[120px] lg:max-w-[200px] truncate">
                  {currentDashboard.name}
                </span>
              </button>
              {pathname !== '/workspaces' && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <span className="capitalize">
                    {pathname.replace('/', '')}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Search */}
          <div className="flex-1 max-w-md relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                placeholder="Search… (⌘K)"
                className="pl-8 h-8 text-sm pr-8"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              />
              {searchQuery && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Search dropdown */}
            <AnimatePresence>
              {searchFocused && searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border bg-card shadow-xl overflow-hidden"
                >
                  {(['dashboard', 'api', 'page'] as const).map(group => {
                    const items = searchResults.filter(r => r.type === group)
                    if (!items.length) return null
                    const groupLabel =
                      group === 'dashboard' ? 'Dashboards'
                      : group === 'api'     ? 'APIs'
                      : 'Pages'
                    return (
                      <div key={group}>
                        <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40">
                          {groupLabel}
                        </p>
                        {items.map(result => (
                          <button
                            key={result.id}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left transition-colors"
                            onMouseDown={() => handleSearchSelect(result)}
                          >
                            {typeIcon(result.type)}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{result.label}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{result.sub}</p>
                            </div>
                            <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </motion.div>
              )}

              {/* No results */}
              {searchFocused && searchQuery.trim() && searchResults.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border bg-card shadow-xl p-4 text-center"
                >
                  <p className="text-xs text-muted-foreground">No results for &ldquo;{searchQuery}&rdquo;</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 flex-shrink-0">

            {/* Monitoring button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              onClick={() => setMonitoringOpen(v => !v)}
              title="Monitoring & Logs"
            >
              <Activity className={`w-4 h-4 ${errorCount > 0 ? 'text-red-500' : ''}`} />
              {errorCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                  {errorCount > 9 ? '9+' : errorCount}
                </span>
              )}
            </Button>

            <NotificationBell />
            <span className="hidden sm:inline-flex">
              <TokenSessionTimer />
            </span>

            {/* ── User profile dropdown ──────────────────────────────── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full relative"
                  title={user?.name ?? 'Profile'}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                    <span className="text-[11px] font-bold text-white">
                      {user?.name
                        ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                        : 'U'}
                    </span>
                  </div>
                  <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-card" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64" sideOffset={8}>
                <DropdownMenuLabel className="p-0">
                  <div className="flex items-center gap-3 p-3 border-b">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-white">
                        {user?.name
                          ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                          : 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{user?.name ?? 'Employee'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user?.email ?? ''}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadgeClass}`}>
                          {user?.role === 'admin' ? '👑 Admin' : '👤 Employee'}
                        </span>
                        {user?.emp_id && user.emp_id !== 'UNKNOWN' && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            #{user.emp_id}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </DropdownMenuLabel>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-0 border-b">
                  {[
                    { label: 'Boards',  value: dashboards.length },
                    { label: 'APIs',    value: endpoints.length },
                    { label: 'Widgets', value: widgets.length },
                  ].map(s => (
                    <div key={s.label} className="flex flex-col items-center py-2 px-1">
                      <span className="text-sm font-bold">{s.value}</span>
                      <span className="text-[10px] text-muted-foreground">{s.label}</span>
                    </div>
                  ))}
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={() => router.push('/settings')}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Settings
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={() => router.push('/workspaces')}
                  >
                    <FolderKanban className="w-3.5 h-3.5" />
                    My Dashboards
                  </DropdownMenuItem>

                  {user?.role === 'admin' && (
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push('/settings')}
                    >
                      <Shield className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-purple-600 dark:text-purple-400">Admin Panel</span>
                    </DropdownMenuItem>
                  )}
                </div>

                <DropdownMenuSeparator />

                <div className="py-1">
                  <div className="px-2 py-1.5 flex items-center gap-2">
                    <BadgeCheck className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-[11px] text-muted-foreground">Session active</span>
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500" />
                  </div>

                  {/* Show token timer inside dropdown on small screens */}
                  <div className="px-2 py-1.5 sm:hidden">
                    <TokenSessionTimer />
                  </div>

                  <DropdownMenuItem
                    className="gap-2 cursor-pointer text-red-500 hover:text-red-600 focus:text-red-600"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Log out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Sidebar + Main ───────────────────────────────────────────────── */}
      <div className="flex pt-14">

        {/* ── Mobile sidebar overlay ─────────────────────────────────────── */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-40 bg-black/30 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed left-0 top-14 bottom-0 w-64 border-r bg-card overflow-y-auto z-50 lg:hidden"
              >
                {sidebarContent}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ── Desktop sidebar (hidden on mobile) ─────────────────────────── */}
        <aside className="hidden lg:block fixed left-0 top-14 bottom-0 w-56 border-r bg-card overflow-y-auto z-40">
          {sidebarContent}
        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main className="w-full lg:ml-56 flex-1 min-h-screen bg-muted/30">
          {children}
        </main>
      </div>

      {/* ── Monitoring slide-over ────────────────────────────────────────── */}
      <AnimatePresence>
        {monitoringOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setMonitoringOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-14 bottom-0 w-full sm:w-96 z-50 border-l shadow-2xl"
            >
              <MonitoringPanel onClose={() => setMonitoringOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <OnboardingWizard />
      <KeyboardShortcuts />
    </div>
  )
}