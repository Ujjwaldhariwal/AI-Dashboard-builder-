import { Database, Gauge, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

const QUICK_ACTIONS = [
  {
    label: 'Connect data',
    href: '/admin/data-sources',
    detail: 'Add or scan a read-only database source.',
    icon: Database,
  },
  {
    label: 'Publish dashboard',
    href: '/admin/publishing',
    detail: 'Review readiness and promote a version.',
    icon: Gauge,
  },
  {
    label: 'Manage tenants',
    href: '/admin/tenants',
    detail: 'Check tenant scope, users, and access.',
    icon: ShieldCheck,
  },
]

export default function AdminOverviewPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="border-b border-[color:var(--dos-border-soft)] pb-5">
        <h2 className="text-xl font-semibold tracking-tight text-[color:var(--dos-text-primary)]">Workspace</h2>
        <p className="mt-1 text-sm text-[color:var(--dos-text-muted)]">Open the area you want to work on.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {QUICK_ACTIONS.map(action => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-4 text-[color:var(--dos-text-primary)] transition-[background-color,border-color] duration-150 hover:border-[color:var(--dos-border-mid)] hover:bg-[var(--dos-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)]"
            >
              <Icon className="h-4 w-4 text-[color:var(--dos-accent-primary)]" />
              <h3 className="mt-3 text-sm font-semibold">{action.label}</h3>
              <p className="mt-1 text-xs leading-5 text-[color:var(--dos-text-muted)]">{action.detail}</p>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
