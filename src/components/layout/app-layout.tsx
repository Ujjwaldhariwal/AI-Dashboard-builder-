'use client'

// src/components/layout/app-layout.tsx

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Database, FolderTree,
  Settings, LogOut, Search,
  Activity, ChevronRight, FolderKanban,
  Shield, BadgeCheck, X, GitBranch,
  Menu, PanelLeftClose, PanelLeftOpen,
  Zap, CircleDot, ArrowRight,
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

// ── Sidebar nav item with tooltip for collapsed mode ──────────────────────
function SidebarNavItem({
  item,
  isActive,
  isCompact,
  errorCount,
}: {
  item: { name: string; href: string; icon: React.ElementType; show: boolean; iconColor: string; activeBg: string; pillColor: string }
  isActive: boolean
  isCompact: boolean
  errorCount: number
}) {
  const Icon = item.icon

  const inner = (
    <Link href={item.href} className="block">
      <div
        className={`
          group relative flex items-center gap-3 rounded-xl transition-all duration-200 overflow-hidden
          ${isCompact
            ? 'h-12 w-12 mx-auto justify-center'
            : 'h-10 px-3'
          }
          ${isActive
            ? `bg-gradient-to-r ${item.activeBg}`
            : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
          }
        `}
      >
        {/* Active indicator pill — unique color per route */}
        {isActive && (
          <motion.div
            layoutId="sidebar-active-pill"
            className={`
              absolute bg-gradient-to-b ${item.pillColor} rounded-full
              ${isCompact
                ? 'left-0 top-2 bottom-2 w-[3px]'
                : 'left-0 top-1.5 bottom-1.5 w-[3px]'
              }
            `}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          />
        )}

        <div className={`
          relative flex items-center justify-center flex-shrink-0 transition-transform duration-200
          ${isCompact ? 'w-6 h-6' : 'w-5 h-5'}
          ${!isActive ? 'group-hover:scale-110' : ''}
        `}>
          <Icon
            className={`
              ${isCompact ? 'w-[22px] h-[22px]' : 'w-[18px] h-[18px]'}
              ${item.iconColor}
            `}
            strokeWidth={isActive ? 2.2 : 1.8}
          />
        </div>

        {!isCompact && (
          <span className={`text-[13px] tracking-tight whitespace-nowrap truncate ${isActive ? 'font-semibold text-foreground' : 'font-medium'}`}>
            {item.name}
          </span>
        )}

        {!isCompact && item.name === 'Monitoring' && errorCount > 0 && (
          <Badge variant="destructive" className="ml-auto text-[9px] px-1.5 h-4 animate-pulse">
            {errorCount}
          </Badge>
        )}

        {isCompact && item.name === 'Monitoring' && errorCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold ring-2 ring-card">
            {errorCount > 9 ? '!' : errorCount}
          </span>
        )}
      </div>
    </Link>
  )

  if (isCompact) {
    return (
      <div
        className="group/tip relative"
        title={item.name + (item.name === 'Monitoring' && errorCount > 0 ? ` (${errorCount} errors)` : '')}
      >
        {inner}
        {/* CSS-only tooltip */}
        <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1 rounded-md bg-popover border border-border text-popover-foreground text-xs font-medium whitespace-nowrap opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150 shadow-md z-50">
          {item.name}
          {item.name === 'Monitoring' && errorCount > 0 && (
            <span className="ml-1.5 text-red-400">({errorCount} errors)</span>
          )}
        </span>
      </div>
    )
  }

  return inner
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
  const [isDesktopViewport, setIsDesktopViewport] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false)
  const [builderHealthSummary, setBuilderHealthSummary] =
    useState<DashboardEndpointProbeSummary | null>(null)
  const [builderHealthFilters, setBuilderHealthFilters] = useState<SidebarHealthFilters>({
    healthy: true,
    unauthorized: true,
    failed: true,
    empty: true,
  })
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Navigation ────────────────────────────────────────────────────────
  const navigation = useMemo(() => [
    { name: 'Dashboards', href: '/workspaces', icon: LayoutDashboard, show: true,                  iconColor: 'text-blue-500',   activeBg: 'from-blue-600/10 to-blue-400/5 dark:from-blue-500/15 dark:to-blue-400/5',     pillColor: 'from-blue-500 to-blue-600' },
    { name: 'Builder',    href: '/builder',    icon: FolderTree,      show: !!currentDashboardId,  iconColor: 'text-violet-500', activeBg: 'from-violet-600/10 to-violet-400/5 dark:from-violet-500/15 dark:to-violet-400/5', pillColor: 'from-violet-500 to-violet-600' },
    { name: 'API Config', href: '/api-config', icon: Database,        show: !!currentDashboardId,  iconColor: 'text-emerald-500', activeBg: 'from-emerald-600/10 to-emerald-400/5 dark:from-emerald-500/15 dark:to-emerald-400/5', pillColor: 'from-emerald-500 to-emerald-600' },
    { name: 'Auth Flow',  href: '/auth-flow',  icon: GitBranch,       show: !!currentDashboardId,  iconColor: 'text-amber-500',  activeBg: 'from-amber-600/10 to-amber-400/5 dark:from-amber-500/15 dark:to-amber-400/5',   pillColor: 'from-amber-500 to-amber-600' },
    { name: 'Monitoring', href: '/monitoring',  icon: Activity,        show: !!currentDashboardId,  iconColor: 'text-rose-500',   activeBg: 'from-rose-600/10 to-rose-400/5 dark:from-rose-500/15 dark:to-rose-400/5',       pillColor: 'from-rose-500 to-rose-600' },
    { name: 'Settings',   href: '/settings',    icon: Settings,        show: true,                  iconColor: 'text-slate-400',  activeBg: 'from-slate-600/10 to-slate-400/5 dark:from-slate-500/15 dark:to-slate-400/5',   pillColor: 'from-slate-400 to-slate-500' },
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
  const isCompactSidebar = isDesktopViewport && desktopSidebarCollapsed

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
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // ── Body scroll lock when any overlay is open ─────────────────────────
  useEffect(() => {
    const anyOverlay = (sidebarOpen && !isDesktopViewport) || monitoringOpen
    if (anyOverlay) {
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.overflow = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [sidebarOpen, isDesktopViewport, monitoringOpen])

  // ── Keyboard shortcuts: Escape, ⌘K ───────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchQuery('')
        setSearchFocused(false)
        setSidebarOpen(false)
        setMonitoringOpen(false)
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
    if (!pathname?.startsWith('/builder')) setBuilderHealthSummary(null)
  }, [pathname])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)')
    const stored = window.localStorage.getItem('app_layout_sidebar_collapsed')
    if (stored === '1') setDesktopSidebarCollapsed(true)

    const updateViewport = (matches: boolean) => {
      setIsDesktopViewport(matches)
      if (!matches) setDesktopSidebarCollapsed(false)
    }
    updateViewport(media.matches)
    const onChange = (event: MediaQueryListEvent) => updateViewport(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!isDesktopViewport) return
    window.localStorage.setItem(
      'app_layout_sidebar_collapsed',
      desktopSidebarCollapsed ? '1' : '0',
    )
  }, [desktopSidebarCollapsed, isDesktopViewport])

  const handleSidebarToggle = useCallback(() => {
    if (isDesktopViewport) {
      setDesktopSidebarCollapsed(v => !v)
      return
    }
    setSidebarOpen(v => !v)
  }, [isDesktopViewport])

  // ── Helpers ───────────────────────────────────────────────────────────
  const typeIcon = (type: SearchResult['type']) => {
    if (type === 'dashboard') return <FolderKanban className="w-3.5 h-3.5 text-blue-500" />
    if (type === 'api')       return <Database className="w-3.5 h-3.5 text-purple-500" />
    return                           <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
  }

  const roleBadgeClass = user?.role === 'admin'
    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'

  // ── Stat card for quick stats (compact & clean) ─────────────────────────
  const StatCard = ({ label, value, accent }: { label: string; value: number; accent?: string }) => (
    <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
      <span className="text-[11px] text-muted-foreground whitespace-nowrap truncate">{label}</span>
      <span className={`text-xs font-bold tabular-nums flex-shrink-0 ${accent ?? ''}`}>{value}</span>
    </div>
  )

  // ── Health filter toggle ──────────────────────────────────────────────
  const HealthToggle = ({
    active,
    count,
    label,
    colorActive,
    colorInactive,
    onClick,
  }: {
    active: boolean
    count: number
    label: string
    colorActive: string
    colorInactive: string
    onClick: () => void
  }) => (
    <button
      onClick={onClick}
      className={`
        rounded-xl border px-2.5 py-2 text-left transition-all duration-200
        ${active ? colorActive : colorInactive}
        hover:scale-[1.02] active:scale-[0.98]
      `}
    >
      <p className="text-sm font-bold leading-tight tabular-nums">{count}</p>
      <p className="text-[10px] leading-tight mt-0.5 opacity-80">{label}</p>
    </button>
  )

  // ── Sidebar content ───────────────────────────────────────────────────
  const sidebarContent = (
    <>
      {/* Section label */}
      {!isCompactSidebar && (
        <div className="px-4 pt-4 pb-1">
          <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.12em] whitespace-nowrap">
            Navigation
          </p>
        </div>
      )}

      {/* Nav items */}
      <nav className={`space-y-0.5 ${isCompactSidebar ? 'px-2 pt-3' : 'px-2.5 py-1'}`}>
        {navigation.filter(item => item.show).map(item => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <SidebarNavItem
              key={item.name}
              item={item}
              isActive={isActive}
              isCompact={isCompactSidebar}
              errorCount={errorCount}
            />
          )
        })}
      </nav>

      {/* Quick Stats */}
      {!isCompactSidebar && (
        <div className="mx-3 mt-5">
          <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
            <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.12em] whitespace-nowrap">
                Quick Stats
              </p>
              <CircleDot className="w-3 h-3 text-green-500 animate-pulse flex-shrink-0" />
            </div>
            <div className="px-1 pb-2">
              <StatCard label="Active APIs" value={endpoints.length} />
              <StatCard label="Dashboards"  value={dashboards.length} />
              <StatCard label="Widgets"     value={activeWidgetCount} />
              <StatCard label="Log entries" value={recentLogCount} />
              {errorCount > 0 && (
                <StatCard label="Errors" value={errorCount} accent="text-red-500" />
              )}
            </div>

            {currentDashboardId && (
              <Link href="/monitoring" className="block border-t border-border/40">
                <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3 flex-shrink-0" />
                    Full Monitoring
                  </span>
                  <ArrowRight className="w-3 h-3 flex-shrink-0" />
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Compact sidebar: mini stat dots */}
      {isCompactSidebar && (
        <div className="flex flex-col items-center gap-2 mt-5 px-2">
          <div
            className="group/tip relative w-10 h-10 rounded-xl bg-muted/40 border border-border/40 flex flex-col items-center justify-center cursor-default"
            title={`${endpoints.length} Active APIs · ${dashboards.length} Dashboards · ${activeWidgetCount} Widgets`}
          >
            <span className="text-[11px] font-bold tabular-nums">{endpoints.length}</span>
            <span className="text-[7px] text-muted-foreground leading-none">APIs</span>
            <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1 rounded-md bg-popover border border-border text-popover-foreground text-xs font-medium whitespace-nowrap opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150 shadow-md z-50">
              {endpoints.length} Active APIs · {dashboards.length} Dashboards · {activeWidgetCount} Widgets
            </span>
          </div>
          {errorCount > 0 && (
            <div
              className="group/tip relative w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex flex-col items-center justify-center cursor-default"
              title={`${errorCount} errors detected`}
            >
              <span className="text-[11px] font-bold tabular-nums text-red-500">{errorCount}</span>
              <span className="text-[7px] text-red-400 leading-none">Err</span>
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1 rounded-md bg-popover border border-border text-popover-foreground text-xs font-medium whitespace-nowrap opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150 shadow-md z-50">
                {errorCount} errors detected
              </span>
            </div>
          )}
        </div>
      )}

      {/* Builder health snapshot */}
      {!isCompactSidebar && isBuilderRoute && builderHealthSummary && (
        <div className="mx-3 mt-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
            <div className="px-3 pt-2.5 pb-2 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.12em]">
                  API Health
                </p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  Builder scan summary
                </p>
              </div>
              <button
                className="text-[10px] px-2 py-1 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                onClick={dispatchBuilderApiHealthRescan}
                title="Run API health scan"
              >
                Rescan
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 px-2.5 pb-2.5">
              <HealthToggle
                active={builderHealthFilters.healthy}
                count={builderHealthSummary.healthy}
                label="Healthy"
                colorActive="bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20"
                colorInactive="border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-950/30"
                onClick={() => setBuilderHealthFilters(c => ({ ...c, healthy: !c.healthy }))}
              />
              <HealthToggle
                active={builderHealthFilters.unauthorized}
                count={builderHealthSummary.unauthorized}
                label="Auth"
                colorActive="bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/20"
                colorInactive="border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-950/30"
                onClick={() => setBuilderHealthFilters(c => ({ ...c, unauthorized: !c.unauthorized }))}
              />
              <HealthToggle
                active={builderHealthFilters.empty}
                count={builderHealthSummary.empty}
                label="Empty"
                colorActive="bg-slate-600 text-white border-slate-600 shadow-sm shadow-slate-600/20"
                colorInactive="border-slate-200 text-slate-700 bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:bg-slate-900/30"
                onClick={() => setBuilderHealthFilters(c => ({ ...c, empty: !c.empty }))}
              />
              <HealthToggle
                active={builderHealthFilters.failed}
                count={builderHealthSummary.failed}
                label="Failed"
                colorActive="bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-600/20"
                colorInactive="border-rose-200 text-rose-700 bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:bg-rose-950/30"
                onClick={() => setBuilderHealthFilters(c => ({ ...c, failed: !c.failed }))}
              />
            </div>

            {visibleSidebarHealthResults.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/60 px-3 pb-2.5">
                No APIs match active filters.
              </p>
            ) : (
              <div className="space-y-1.5 px-2.5 pb-2.5 max-h-56 overflow-auto">
                {visibleSidebarHealthResults.slice(0, 6).map(result => {
                  const bucket = getSidebarHealthBucket(result.status)
                  const dotColor = bucket === 'healthy'
                    ? 'bg-emerald-500'
                    : bucket === 'unauthorized' || bucket === 'empty'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'

                  return (
                    <div
                      key={`${result.endpointId ?? result.url}-${result.status}`}
                      className="rounded-lg border border-border/40 p-2.5 bg-background/60 space-y-1 hover:border-border transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium leading-snug break-words">
                            {result.endpointName || result.url}
                          </p>
                          {result.likelyReason && (
                            <p className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5">
                              {result.likelyReason}
                            </p>
                          )}
                        </div>
                        <span className={`text-[8px] font-bold uppercase tracking-wider flex-shrink-0 mt-0.5 ${
                          bucket === 'healthy' ? 'text-emerald-600 dark:text-emerald-400'
                          : bucket === 'failed' ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          {result.status}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapse toggle at bottom (desktop expanded only) */}
      {!isCompactSidebar && isDesktopViewport && (
        <div className="mt-auto px-3 py-3 border-t border-border/40">
          <button
            onClick={() => setDesktopSidebarCollapsed(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40 transition-colors whitespace-nowrap"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
            Collapse sidebar
          </button>
        </div>
      )}

      {/* Expand button at bottom (compact only) */}
      {isCompactSidebar && (
        <div className="mt-auto flex justify-center py-3 border-t border-border/40">
          <div className="group/tip relative">
            <button
              onClick={() => setDesktopSidebarCollapsed(false)}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40 transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
            <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1 rounded-md bg-popover border border-border text-popover-foreground text-xs font-medium whitespace-nowrap opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150 shadow-md z-50">
              Expand sidebar
            </span>
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className="min-h-screen bg-background">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border/60 bg-card/80 backdrop-blur-xl">
        <div className="flex h-full items-center px-3 sm:px-4 gap-2 sm:gap-3">

          {/* Sidebar toggle (mobile only — desktop uses sidebar bottom toggles) */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0 xl:hidden"
            onClick={handleSidebarToggle}
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </Button>

          {/* Logo */}
          <Link href="/workspaces" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-600/20">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.4} />
            </div>
            <span className="font-bold text-base hidden sm:block tracking-tight">
              Analytics<span className="text-blue-600 dark:text-blue-400">.ai</span>
            </span>
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
                  <span className="capitalize">{pathname.replace('/', '')}</span>
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
                className="pl-8 h-8 text-sm pr-8 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
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
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-1.5 left-0 right-0 z-50 rounded-xl border border-border/60 bg-card shadow-2xl shadow-black/10 overflow-hidden"
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
                        <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.12em] bg-muted/30">
                          {groupLabel}
                        </p>
                        {items.map(result => (
                          <button
                            key={result.id}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 text-left transition-colors"
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

              {searchFocused && searchQuery.trim() && searchResults.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-full mt-1.5 left-0 right-0 z-50 rounded-xl border border-border/60 bg-card shadow-2xl p-4 text-center"
                >
                  <p className="text-xs text-muted-foreground">No results for &ldquo;{searchQuery}&rdquo;</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              onClick={() => setMonitoringOpen(v => !v)}
              title="Monitoring & Logs"
            >
              <Activity className={`w-4 h-4 ${errorCount > 0 ? 'text-red-500' : ''}`} />
              {errorCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold ring-2 ring-card">
                  {errorCount > 9 ? '9+' : errorCount}
                </span>
              )}
            </Button>

            <NotificationBell />
            <span className="hidden sm:inline-flex">
              <TokenSessionTimer />
            </span>

            {/* User profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full relative"
                  title={user?.name ?? 'Profile'}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center ring-2 ring-blue-600/20">
                    <span className="text-[11px] font-bold text-white">
                      {user?.name
                        ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                        : 'U'}
                    </span>
                  </div>
                  <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-card" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64 rounded-xl" sideOffset={8}>
                <DropdownMenuLabel className="p-0">
                  <div className="flex items-center gap-3 p-3 border-b">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0 ring-2 ring-blue-600/20">
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
                          <span className="text-[10px] text-muted-foreground font-mono">#{user.emp_id}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </DropdownMenuLabel>

                <div className="grid grid-cols-3 gap-0 border-b">
                  {[
                    { label: 'Boards',  value: dashboards.length },
                    { label: 'APIs',    value: endpoints.length },
                    { label: 'Widgets', value: widgets.length },
                  ].map(s => (
                    <div key={s.label} className="flex flex-col items-center py-2 px-1">
                      <span className="text-sm font-bold tabular-nums">{s.value}</span>
                      <span className="text-[10px] text-muted-foreground">{s.label}</span>
                    </div>
                  ))}
                </div>

                <div className="py-1">
                  <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => router.push('/settings')}>
                    <Settings className="w-3.5 h-3.5" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => router.push('/workspaces')}>
                    <FolderKanban className="w-3.5 h-3.5" /> My Dashboards
                  </DropdownMenuItem>
                  {user?.role === 'admin' && (
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => router.push('/settings')}>
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
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  </div>
                  <div className="px-2 py-1.5 sm:hidden">
                    <TokenSessionTimer />
                  </div>
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer text-red-500 hover:text-red-600 focus:text-red-600"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-3.5 h-3.5" /> Log out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Sidebar + Main ───────────────────────────────────────────────── */}
      <div className="flex pt-14">

        {/* Mobile / Tablet sidebar overlay (below xl) */}
        <AnimatePresence>
          {sidebarOpen && !isDesktopViewport && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed left-0 top-14 bottom-0 w-[272px] max-w-[85vw] border-r border-border/60 bg-card z-50 flex flex-col will-change-transform"
                style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
              >
                {sidebarContent}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/*
          Desktop sidebar (xl+) — TRUE OVERLAY.
          Always floats on top of content. Main content never changes width.
          Expanded = wide sidebar overlays content with subtle scrim behind it.
          Collapsed = compact icon rail overlays left edge.
        */}
        <aside
          className={`
            hidden xl:flex xl:flex-col fixed left-0 top-14 bottom-0 border-r border-border/60
            bg-card z-50 will-change-[width]
            transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
            ${isCompactSidebar ? 'w-[68px]' : 'w-60'}
          `}
          style={{ overflowY: 'auto', overflowX: 'hidden' }}
        >
          {sidebarContent}
        </aside>

        {/* Desktop scrim — click to collapse expanded sidebar back to icon rail */}
        <AnimatePresence>
          {isDesktopViewport && !desktopSidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden xl:block fixed top-14 bottom-0 right-0 z-40 bg-black/5 cursor-pointer"
              style={{ left: 68 }}
              onClick={() => setDesktopSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
            />
          )}
        </AnimatePresence>

        {/* Main content — FIXED xl:ml-[68px] always. Sidebar expansion overlays on top. Content width NEVER changes. */}
        <main className="w-full flex-1 min-h-[calc(100vh-3.5rem)] bg-muted/20 xl:ml-[68px]">
          {children}
        </main>
      </div>

      {/* Monitoring slide-over */}
      <AnimatePresence>
        {monitoringOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
              onClick={() => setMonitoringOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-14 bottom-0 w-full max-w-sm sm:w-96 z-50 border-l shadow-2xl bg-card will-change-transform"
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
