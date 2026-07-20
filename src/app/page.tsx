'use client'

/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Product-led split · design-system: design.md · designed-as-app */

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  Network,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Table2,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth-store'

const releasePath = [
  { label: 'Source connected', detail: 'Postgres · read only', icon: Database, state: 'complete' },
  { label: 'Schema scanned', detail: '2 tables · 14 fields', icon: ScanSearch, state: 'complete' },
  { label: 'Semantic review', detail: '4 fields need approval', icon: Network, state: 'active' },
  { label: 'Client release', detail: 'Blocked by review', icon: LayoutDashboard, state: 'pending' },
] as const

const capabilities = [
  {
    eyebrow: 'Governed ingestion',
    title: 'Bring operational data in without exposing credentials.',
    description: 'Connections stay server-side, tenant-scoped, and auditable from first scan to final release.',
    icon: LockKeyhole,
  },
  {
    eyebrow: 'Semantic control',
    title: 'Turn raw columns into business-ready fields.',
    description: 'Review measures, dimensions, joins, and sensitive data before anyone builds a chart.',
    icon: Layers3,
  },
  {
    eyebrow: 'Dashboard production',
    title: 'Compose charts against an approved data contract.',
    description: 'Every visualization inherits the same governed definitions, filters, and tenant boundaries.',
    icon: Table2,
  },
  {
    eyebrow: 'Report delivery',
    title: 'Package decisions into client-ready outputs.',
    description: 'Publish controlled dashboards and reports with clear ownership and release history.',
    icon: FileText,
  },
] as const

const workflow = [
  ['01', 'Connect', 'Register a tenant-scoped, read-only source.'],
  ['02', 'Review', 'Approve semantic fields, metrics, and joins.'],
  ['03', 'Release', 'Build dashboards and publish with confidence.'],
] as const

function ProductEvidence() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Release workspace</p>
          <p className="mt-1 text-sm font-semibold text-foreground">Retail performance dashboard</p>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
          In review
        </span>
      </div>

      <div className="grid gap-0 md:grid-cols-[1fr_12rem]">
        <div className="space-y-2 p-4">
          {releasePath.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3"
              >
                <div className={item.state === 'active' ? 'text-primary' : 'text-muted-foreground'}>
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                </div>
                {item.state === 'complete' ? (
                  <CheckCircle2 className="size-4 text-primary" aria-label="Complete" />
                ) : (
                  <span className="text-xs font-medium capitalize text-muted-foreground">{item.state}</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="border-t border-border bg-muted/35 p-4 md:border-l md:border-t-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Readiness</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">75%</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
            <div className="h-full w-3/4 bg-primary" />
          </div>
          <dl className="mt-6 space-y-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Owner</dt>
              <dd className="font-medium text-foreground">Analytics team</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Tenant</dt>
              <dd className="font-medium text-foreground">Retail demo</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Next gate</dt>
              <dd className="font-medium text-foreground">Field approval</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="DashboardOS home">
            <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <LayoutDashboard className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-tight">DashboardOS</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Sign in
            </Link>
            <Link href="/login" className={buttonVariants({ size: 'sm' })}>
              Open platform
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16 lg:py-24">
          <div className="max-w-xl">
            <div className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
              <Sparkles className="size-4" aria-hidden="true" />
              Governed analytics workspace
            </div>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
              From governed data to client-ready dashboards.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
              Connect data, approve its business meaning, build dependable visualizations, and release every result
              through one controlled workflow.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className={buttonVariants({ size: 'lg' })}>
                Enter workspace
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="#workflow" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                See the workflow
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                Tenant isolation
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                Review before release
              </span>
            </div>
          </div>

          <ProductEvidence />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.68fr_1.32fr] lg:gap-20">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">One operational spine</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Every decision stays connected to its source.
          </h2>
          <p className="mt-5 max-w-md leading-7 text-muted-foreground">
            DashboardOS keeps ingestion, semantics, visualization, and delivery in the same governed chain.
          </p>
        </div>

        <div className="divide-y divide-border border-y border-border">
          {capabilities.map((capability) => {
            const Icon = capability.icon
            return (
              <article key={capability.title} className="grid gap-4 py-6 sm:grid-cols-[2.5rem_1fr] sm:py-7">
                <div className="grid size-9 place-items-center rounded-md border border-border bg-muted/40 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {capability.eyebrow}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight">{capability.title}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{capability.description}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section id="workflow" className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Controlled handoffs</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              A shorter path from database to decision.
            </h2>
          </div>

          <ol className="mt-10 grid overflow-hidden rounded-lg border border-border bg-background md:grid-cols-3">
            {workflow.map(([number, title, description], index) => (
              <li key={number} className={index === 0 ? 'p-6' : 'border-t border-border p-6 md:border-l md:border-t-0'}>
                <span className="font-mono text-xs font-semibold text-primary">{number}</span>
                <h3 className="mt-7 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid overflow-hidden rounded-lg bg-foreground text-background lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="p-7 sm:p-10">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-background/60">Built for accountable delivery</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em]">
              Give teams speed without giving up control.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-background/70">
              Credentials stay protected, semantic changes stay reviewable, and each release remains traceable to its
              tenant, project, and data source.
            </p>
          </div>
          <div className="border-t border-background/15 p-7 lg:border-l lg:border-t-0 lg:p-10">
            <Link href="/login" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              Start in DashboardOS
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>DashboardOS</span>
          <span>Governed analytics from source to release.</span>
        </div>
      </footer>
    </main>
  )
}

export default function HomePage() {
  const router = useRouter()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/admin')
    }
  }, [isAuthenticated, isLoading, router])

  if (!isLoading && isAuthenticated) return null

  return <LandingPage />
}
