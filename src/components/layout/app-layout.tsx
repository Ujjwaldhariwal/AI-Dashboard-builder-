'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  ChevronRight,
  Database,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { KeyboardShortcuts } from '@/components/layout/keyboard-shortcuts'
import { OnboardingWizard } from '@/components/layout/onboarding-wizard'
import { TokenSessionTimer } from '@/components/layout/token-session-timer'
import { useAuthStore } from '@/store/auth-store'

interface AppLayoutProps {
  children: React.ReactNode
}

interface ShellNavItem {
  name: string
  href: string
  icon: React.ElementType
  show: boolean
}

interface SearchResult {
  id: string
  label: string
  sub: string
  href: string
}

const LEGACY_NAVIGATION_ENABLED = process.env.NEXT_PUBLIC_DASHBOARDOS_ENABLE_LEGACY_ROUTES === 'true'

function SidebarNavItem({
  item,
  isActive,
  isCompact,
}: {
  item: ShellNavItem
  isActive: boolean
  isCompact: boolean
}) {
  const Icon = item.icon
  const inner = (
    <Link href={item.href} className="block">
      <div
        className={[
          'group relative flex items-center gap-3 overflow-hidden rounded-md border border-transparent transition-colors duration-150',
          isCompact ? 'mx-auto h-12 w-12 justify-center' : 'h-10 px-3',
          isActive ? 'border-primary/20 bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
        ].join(' ')}
      >
        {isActive ? (
          <div
            className={[
              'absolute bg-primary',
              isCompact ? 'bottom-2 left-0 top-2 w-[3px]' : 'bottom-1.5 left-0 top-1.5 w-[3px]',
            ].join(' ')}
          />
        ) : null}

        <div className={['relative flex shrink-0 items-center justify-center', isCompact ? 'h-6 w-6' : 'h-5 w-5'].join(' ')}>
          <Icon className={`${isCompact ? 'h-[22px] w-[22px]' : 'h-[18px] w-[18px]'} ${isActive ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={isActive ? 2.2 : 1.8} />
        </div>

        {!isCompact ? (
          <span className={`truncate whitespace-nowrap text-[13px] tracking-tight ${isActive ? 'font-semibold text-foreground' : 'font-medium'}`}>
            {item.name}
          </span>
        ) : null}
      </div>
    </Link>
  )

  if (!isCompact) return inner

  return (
    <div className="group/tip relative" title={item.name}>
      {inner}
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100">
        {item.name}
      </span>
    </div>
  )
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktopViewport, setIsDesktopViewport] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const navigation = useMemo<ShellNavItem[]>(() => [
    { name: 'DashboardOS', href: '/admin', icon: Network, show: true },
    { name: 'Autopilot', href: '/admin/autopilot', icon: Sparkles, show: true },
    { name: 'Tenants', href: '/admin/tenants', icon: Users, show: true },
    { name: 'Data Sources', href: '/admin/data-sources', icon: Database, show: true },
    { name: 'Semantic Model', href: '/admin/semantic-model', icon: GitBranch, show: true },
    { name: 'Datasets', href: '/admin/datasets', icon: BarChart3, show: true },
    { name: 'Charts', href: '/admin/charts', icon: SlidersHorizontal, show: true },
    { name: 'Publishing', href: '/admin/publishing', icon: LayoutDashboard, show: true },
    { name: 'API Docs', href: '/admin/api-docs', icon: BookOpen, show: true },
    { name: 'Legacy Workspaces', href: '/workspaces', icon: FolderKanban, show: LEGACY_NAVIGATION_ENABLED },
    { name: 'Legacy Builder', href: '/builder', icon: FolderKanban, show: LEGACY_NAVIGATION_ENABLED },
    { name: 'Settings', href: '/settings', icon: Settings, show: true },
  ], [])

  const visibleNavigation = useMemo(() => navigation.filter(item => item.show), [navigation])

  const searchResults = useMemo<SearchResult[]>(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    return visibleNavigation
      .filter(item => item.name.toLowerCase().includes(query) || item.href.toLowerCase().includes(query))
      .slice(0, 8)
      .map(item => ({
        id: item.href,
        label: item.name,
        sub: item.href.startsWith('/admin') ? 'DashboardOS platform' : 'Maintenance-only legacy route',
        href: item.href,
      }))
  }, [searchQuery, visibleNavigation])

  const handleLogout = useCallback(async () => {
    await logout()
    router.push('/login')
  }, [logout, router])

  const handleSearchSelect = useCallback((result: SearchResult) => {
    router.push(result.href)
    setSearchQuery('')
    setSearchFocused(false)
  }, [router])

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchQuery('')
        setSearchFocused(false)
        setSidebarOpen(false)
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
    window.localStorage.setItem('app_layout_sidebar_collapsed', desktopSidebarCollapsed ? '1' : '0')
  }, [desktopSidebarCollapsed, isDesktopViewport])

  const isCompactSidebar = isDesktopViewport && desktopSidebarCollapsed
  const roleBadgeClass = user?.role === 'admin'
    ? 'border border-primary/20 bg-primary/10 text-primary'
    : 'border border-border bg-muted text-muted-foreground'

  const handleSidebarToggle = useCallback(() => {
    if (isDesktopViewport) {
      setDesktopSidebarCollapsed(value => !value)
      return
    }
    setSidebarOpen(value => !value)
  }, [isDesktopViewport])

  const sidebarContent = (
    <>
      <div className="px-3 py-4">
        <div className={isCompactSidebar ? 'flex justify-center' : ''}>
          <Link href="/admin" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
              <Network className="h-4 w-4" strokeWidth={2.2} />
            </div>
            {!isCompactSidebar ? (
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight">DashboardOS</p>
                <p className="text-[11px] text-muted-foreground">Platform shell</p>
              </div>
            ) : null}
          </Link>
        </div>
      </div>

      <nav className="space-y-1 px-2">
        {visibleNavigation.map(item => (
          <SidebarNavItem
            key={item.href}
            item={item}
            isActive={pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(`${item.href}/`))}
            isCompact={isCompactSidebar}
          />
        ))}
      </nav>

      {!isCompactSidebar ? (
        <div className="mx-3 mt-4 rounded-lg border border-border/60 bg-muted/30 p-3">
          <p className="text-xs font-semibold">Legacy routes</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {LEGACY_NAVIGATION_ENABLED ? 'Maintenance access is enabled for this environment.' : 'Quarantined for this environment.'}
          </p>
        </div>
      ) : null}

      {!isCompactSidebar && isDesktopViewport ? (
        <div className="mt-auto border-t border-border/40 px-3 py-3">
          <button
            onClick={() => setDesktopSidebarCollapsed(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
            Collapse sidebar
          </button>
        </div>
      ) : null}

      {isCompactSidebar ? (
        <div className="mt-auto flex justify-center border-t border-border/40 py-3">
          <button
            onClick={() => setDesktopSidebarCollapsed(false)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </>
  )

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed left-0 right-0 top-0 z-50 h-14 border-b border-border bg-card/95">
        <div className="flex h-full items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 xl:hidden" onClick={handleSidebarToggle} aria-label="Toggle sidebar">
            <Menu className="h-5 w-5" />
          </Button>

          <Link href="/admin" className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
              <Network className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <span className="hidden text-base font-bold tracking-tight sm:block">
              Dashboard<span className="text-primary">OS</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
            <ChevronRight className="h-3 w-3" />
            <span className="capitalize">{pathname?.replace(/^\//, '').replace(/\//g, ' / ') || 'admin'}</span>
          </div>

          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search platform pages... (Ctrl+K)"
              className="h-8 rounded-md border-border bg-muted/30 pl-8 pr-8 text-sm focus:bg-background"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            />
            {searchQuery ? (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}

            <AnimatePresence>
              {searchFocused && searchResults.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-float)]"
                >
                  {searchResults.map(result => (
                    <button
                      key={result.id}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                      onMouseDown={() => handleSearchSelect(result)}
                    >
                      <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{result.label}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{result.sub}</p>
                      </div>
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <span className="hidden sm:inline-flex">
              <TokenSessionTimer />
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full" title={user?.name ?? 'Profile'}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                    <span className="text-[11px] font-bold text-primary">
                      {user?.name ? user.name.split(' ').map(name => name[0]).join('').slice(0, 2).toUpperCase() : 'U'}
                    </span>
                  </div>
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-card bg-green-500" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64 rounded-xl" sideOffset={8}>
                <DropdownMenuLabel className="p-0">
                  <div className="flex items-center gap-3 border-b p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                      <UserRound className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{user?.name ?? 'Employee'}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{user?.email ?? ''}</p>
                      <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${roleBadgeClass}`}>
                        {user?.role === 'admin' ? 'Admin' : 'Employee'}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>

                <div className="py-1">
                  <DropdownMenuItem className="gap-2" onClick={() => router.push('/admin')}>
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    DashboardOS Admin
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={() => router.push('/admin/publishing')}>
                    <FolderKanban className="h-3.5 w-3.5" />
                    Publishing
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={() => router.push('/settings')}>
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                  </DropdownMenuItem>
                </div>

                <DropdownMenuSeparator />

                <div className="py-1">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-[11px] text-muted-foreground">Session active</span>
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-500" />
                  </div>
                  <div className="px-2 py-1.5 sm:hidden">
                    <TokenSessionTimer />
                  </div>
                  <DropdownMenuItem className="gap-2 text-red-500 hover:text-red-600 focus:text-red-600" onClick={handleLogout}>
                    <LogOut className="h-3.5 w-3.5" />
                    Log out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex pt-14">
        <AnimatePresence>
          {sidebarOpen && !isDesktopViewport ? (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-40 bg-foreground/25"
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 top-14 z-50 flex w-[272px] max-w-[85vw] flex-col overflow-y-auto border-r border-border/60 bg-card"
              >
                {sidebarContent}
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>

        <aside
          className={[
            'fixed bottom-0 left-0 top-14 z-50 hidden flex-col overflow-y-auto overflow-x-hidden border-r border-border bg-card xl:flex',
            isCompactSidebar ? 'w-[68px]' : 'w-60',
          ].join(' ')}
        >
          {sidebarContent}
        </aside>

        <AnimatePresence>
          {isDesktopViewport && !desktopSidebarCollapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-0 right-0 top-14 z-40 hidden cursor-pointer bg-transparent xl:block"
              style={{ left: 68 }}
              onClick={() => setDesktopSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
            />
          ) : null}
        </AnimatePresence>

        <main className="min-h-[calc(100vh-3.5rem)] w-full flex-1 bg-muted/20 xl:ml-[68px]">
          {children}
        </main>
      </div>

      <OnboardingWizard />
      <KeyboardShortcuts />
    </div>
  )
}
