'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Database, FolderTree, Settings,
  LogOut, User, Search, ChevronLeft, ChevronRight, Menu
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDashboardStore } from '@/store/builder-store'
import { useAuthStore } from '@/store/auth-store'
import { NotificationBell } from '@/components/layout/notification-bell'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { endpoints, dashboards, currentDashboardId } = useDashboardStore()
  const { logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const navigation = [
    { name: 'Dashboards', href: '/workspaces', icon: LayoutDashboard, show: true },
    { name: 'Builder',    href: '/builder',    icon: FolderTree,      show: !!currentDashboardId },
    { name: 'API Config', href: '/api-config', icon: Database,        show: !!currentDashboardId },
    { name: 'Settings',   href: '/settings',   icon: Settings,        show: true },
  ]

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const currentDashboard = dashboards.find(d => d.id === currentDashboardId)

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b bg-card/95 backdrop-blur flex items-center px-4 gap-3">
        <Button
          variant="ghost" size="icon"
          className="md:hidden"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu className="w-5 h-5" />
        </Button>

        <Link href="/workspaces" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg hidden sm:inline-block">Analytics AI</span>
        </Link>

        {currentDashboard && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10">
            <FolderTree className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium">{currentDashboard.name}</span>
          </div>
        )}

        <div className="flex-1 max-w-md ml-auto mr-4 hidden sm:block">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-8 h-8 text-sm bg-muted/50" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          <NotificationBell />
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <User className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogout} className="h-8 hidden sm:flex">
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Logout
          </Button>
        </div>
      </header>

      {/* ── Sidebar + Main ──────────────────────────────────────── */}
      <div className="flex pt-14 flex-1">

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed left-0 top-14 bottom-0 border-r bg-card z-40 transition-all duration-300 ease-in-out flex flex-col",
            sidebarOpen ? "w-64" : "w-[70px] -translate-x-full md:translate-x-0"
          )}
        >
          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {navigation.filter(item => item.show).map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              const Icon = item.icon
              return (
                <Link key={item.name} href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                      "w-full h-10 mb-1 justify-start",
                      !sidebarOpen && "justify-center px-0"
                    )}
                    title={!sidebarOpen ? item.name : undefined}
                  >
                    <Icon className={cn("w-4 h-4", sidebarOpen && "mr-3")} />
                    {sidebarOpen && <span>{item.name}</span>}
                  </Button>
                </Link>
              )
            })}
          </div>

          {/* Stats Footer (Hidden if collapsed) */}
          {sidebarOpen && (
            <div className="p-4 border-t bg-muted/10">
              <h3 className="text-[10px] font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Project Stats
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Dashboards</span>
                  <span className="font-medium bg-muted px-1.5 rounded">{dashboards.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">APIs</span>
                  <span className="font-medium bg-muted px-1.5 rounded">{endpoints.length}</span>
                </div>
              </div>
            </div>
          )}

          {/* Collapse Toggle */}
          <div className="p-2 border-t flex justify-end">
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main
          className={cn(
            "flex-1 bg-muted/30 transition-all duration-300 min-h-[calc(100vh-3.5rem)]",
            sidebarOpen ? "md:ml-64" : "md:ml-[70px]"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
