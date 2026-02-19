'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, Database, FolderTree, Settings, 
  LogOut, User, Bell, Search
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useDashboardStore } from '@/store/builder-store'
import { useAuthStore } from '@/store/auth-store'
import { useRouter } from 'next/navigation'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { endpoints, dashboards, currentDashboardId } = useDashboardStore()
  const { logout } = useAuthStore()

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
    <div className="min-h-screen bg-background">

      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b bg-card/95 backdrop-blur">
        <div className="flex h-full items-center px-4 gap-3">
          <Link href="/workspaces" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg">Analytics AI</span>
          </Link>

          {currentDashboard && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10">
              <FolderTree className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium">{currentDashboard.name}</span>
            </div>
          )}

          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search dashboards, APIs..." className="pl-8 h-8 text-sm" />
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
              <Bell className="w-4 h-4" />
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center"
              >
                3
              </Badge>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <User className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="h-8">
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Sidebar + Main */}
      <div className="flex pt-14">

        {/* Fixed sidebar */}
        <aside className="fixed left-0 top-14 bottom-0 w-56 border-r bg-card overflow-y-auto z-40">
          <nav className="p-3 space-y-0.5">
            {navigation.filter(item => item.show).map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              const Icon = item.icon
              return (
                <Link key={item.name} href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className="w-full justify-start h-9 text-sm"
                  >
                    <Icon className="w-4 h-4 mr-2.5" />
                    {item.name}
                  </Button>
                </Link>
              )
            })}
          </nav>

          <div className="p-3 mt-6 border-t">
            <h3 className="text-[10px] font-semibold text-muted-foreground mb-2">QUICK STATS</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Active APIs</span>
                <span className="font-semibold">{endpoints.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Dashboards</span>
                <span className="font-semibold">{dashboards.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Widgets</span>
                <span className="font-semibold">0</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content — simple ml-56 is enough since AppLayout renders exactly once */}
        <main className="ml-56 flex-1 min-h-screen bg-muted/30">
          {children}
        </main>

      </div>
    </div>
  )
}