import {
  ArrowRight,
  Database,
  Gauge,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { GuidedWorkflowLanding } from '@/components/platform/guided-workflow-landing'

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
    <div className="mx-auto max-w-7xl space-y-6">
      <GuidedWorkflowLanding />

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] text-[color:var(--dos-text-primary)]">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[var(--dos-info-soft)] text-[var(--dos-info-text)] hover:bg-[var(--dos-info-soft)]">Prepared workspace</Badge>
              <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[color:var(--dos-text-muted)]">Read-only reference state</Badge>
            </div>
            <h2 className="mt-3 text-base font-semibold">Explore the Northstar Retail release journey.</h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--dos-text-muted)]">
              This prepared walkthrough shows reviewed semantic assets, governed datasets, publish readiness,
              and an immutable client release. Automatic dashboard assembly remains intentionally unavailable.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="bg-[var(--dos-accent-primary)] text-white hover:bg-[var(--dos-accent-primary-hover)]">
                <Link href="/admin/data-sources?demo=1">
                  Enter prepared workspace
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-[color:var(--dos-border-soft)] bg-transparent text-[color:var(--dos-text-secondary)] hover:bg-[var(--dos-surface)]">
                <Link href="/client/northstar-retail?demo=1">Open published dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-4 text-[color:var(--dos-text-primary)] transition-colors hover:bg-[var(--dos-surface)]"
              >
                <Icon className="h-4 w-4 text-[color:var(--dos-accent-primary)]" />
                <h3 className="mt-3 text-sm font-semibold">{action.label}</h3>
                <p className="mt-1 text-xs leading-5 text-[color:var(--dos-text-muted)]">{action.detail}</p>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
