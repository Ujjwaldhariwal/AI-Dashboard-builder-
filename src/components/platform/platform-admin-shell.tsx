'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Database,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Network,
  SlidersHorizontal,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/tenants', label: 'Tenants', icon: Users },
  { href: '/admin/data-sources', label: 'Data Sources', icon: Database },
  { href: '/admin/semantic-model', label: 'Semantic Model', icon: Network },
  { href: '/admin/datasets', label: 'Datasets', icon: BarChart3 },
  { href: '/admin/charts', label: 'Charts', icon: SlidersHorizontal },
  { href: '/admin/reports', label: 'Reports', icon: FileText },
  { href: '/admin/security', label: 'Security', icon: ShieldCheck },
]

export function PlatformAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="dashboardos-admin min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/10 bg-slate-950/95 px-4 py-5 lg:block">
        <Link href="/admin" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#a6e22e] text-[#1f1f1c] shadow-[0_0_24px_rgba(166,226,46,0.22)]">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">DashboardOS</p>
            <p className="mt-1 text-[11px] text-slate-500">Managed analytics platform</p>
          </div>
        </Link>

        <div className="mt-7 rounded-lg border border-[#fd971f]/25 bg-[#fd971f]/10 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-[#ffd866]">
            <LockKeyhole className="h-3.5 w-3.5" />
            Tenant isolation first
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-400">
            Every dashboard, dataset, and report must resolve through tenant and assignment checks.
          </p>
        </div>

        <nav className="mt-7 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-[#a6e22e] text-[#1f1f1c] shadow-[0_0_20px_rgba(166,226,46,0.16)]'
                    : 'text-slate-400 hover:bg-[#3e3d32] hover:text-slate-100',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-5 left-4 right-4">
          <Button asChild variant="outline" className="w-full border-[#fd971f]/30 bg-transparent text-[#f8f8f2] hover:bg-[#fd971f]/10 hover:text-[#ffd866]">
            <Link href="/workspaces">Open Legacy Builder</Link>
          </Button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#a6e22e] text-[#1f1f1c]">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold">DashboardOS</span>
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="text-xs text-slate-500">Internal admin workspace</p>
              <h1 className="text-base font-semibold">Engineer Command Center</h1>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#f92672]/30 bg-[#f92672]/10 text-[#ff79b2]">
                Sprint 1
              </Badge>
              <Button asChild size="sm" className="bg-[#a6e22e] text-[#1f1f1c] hover:bg-[#cfff55]">
                <Link href="/admin/data-sources">Connect DB</Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
