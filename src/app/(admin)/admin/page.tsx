import {
  Activity,
  ArrowRight,
  Database,
  FileText,
  Gauge,
  LockKeyhole,
  Network,
  ShieldCheck,
  Users,
} from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const METRICS = [
  { label: 'Tenants', value: '0', note: 'Tenant model planned', icon: Users },
  { label: 'Data Sources', value: '0', note: 'Postgres first', icon: Database },
  { label: 'Published Dashboards', value: '0', note: 'Read-only runtime', icon: Gauge },
  { label: 'Security Events', value: '0', note: 'Audit trail target', icon: ShieldCheck },
]

const SPRINTS = [
  {
    name: 'Sprint 1',
    status: 'Active',
    title: 'Platform spine',
    items: ['Admin shell', 'Client shell', 'Roadmap', 'Legacy builder bridge'],
  },
  {
    name: 'Sprint 2',
    status: 'Next',
    title: 'Tenancy and access',
    items: ['Tenant model', 'Engineer assignments', 'Client roles', 'RLS plan'],
  },
  {
    name: 'Sprint 3',
    status: 'Planned',
    title: 'Database foundation',
    items: ['Postgres source', 'Encrypted credentials', 'Schema introspection', 'Query guards'],
  },
]

const PRINCIPLES = [
  {
    title: 'Read-only client runtime',
    body: 'Client users can view, filter, and report. They cannot change datasets, widgets, mappings, or source credentials.',
    icon: LockKeyhole,
  },
  {
    title: 'Semantic layer over raw DB',
    body: 'Engineers map messy database columns into governed datasets before widgets query them.',
    icon: Network,
  },
  {
    title: 'Fast by design',
    body: 'Published dashboards should prefer cached prepared results, bounded queries, and background refresh.',
    icon: Activity,
  },
]

export default function AdminOverviewPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-cyan-400 text-slate-950 hover:bg-cyan-400">DashboardOS</Badge>
            <Badge variant="outline" className="border-white/15 text-slate-300">Multi-tenant platform refactor</Badge>
          </div>
          <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-white">
            One platform for client dashboards, engineer configuration, and secure database-backed analytics.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
            This admin surface is the new home for tenant onboarding, database connections, semantic datasets,
            dashboard publishing, and report governance. The existing builder remains available while we migrate.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
              <Link href="/admin/data-sources">
                Start with data sources <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-white/15 bg-transparent text-slate-200 hover:bg-white/10">
              <Link href="/workspaces">Open current builder</Link>
            </Button>
          </div>
        </div>

        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm">Security posture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-400">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
              <p>Every future API route must re-check tenant, role, assignment, and published state.</p>
            </div>
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-4 w-4 text-cyan-300" />
              <p>Database credentials stay server-side and encrypted. Browser code only sees source labels and schema metadata.</p>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 text-amber-300" />
              <p>Reports use authorized dashboard result data, not direct database access from the client.</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.label} className="border-white/10 bg-white/[0.03] text-slate-100">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">{metric.label}</p>
                    <p className="mt-1 text-2xl font-semibold">{metric.value}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/8">
                    <Icon className="h-5 w-5 text-cyan-300" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">{metric.note}</p>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm">Refactor sprints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {SPRINTS.map((sprint) => (
              <div key={sprint.name} className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-cyan-200">{sprint.name}</p>
                    <h3 className="mt-1 text-sm font-semibold">{sprint.title}</h3>
                  </div>
                  <Badge variant="outline" className="border-white/15 text-slate-300">{sprint.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sprint.items.map((item) => (
                    <span key={item} className="rounded-md bg-white/8 px-2 py-1 text-[11px] text-slate-400">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
          {PRINCIPLES.map((principle) => {
            const Icon = principle.icon
            return (
              <Card key={principle.title} className="border-white/10 bg-white/[0.03] text-slate-100">
                <CardContent className="flex gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{principle.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{principle.body}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>
    </div>
  )
}
