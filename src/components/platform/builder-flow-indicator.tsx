'use client'

import Link from 'next/link'
import type { ComponentType } from 'react'
import { CheckCircle2, Circle, Database, LayoutDashboard, Network, PanelsTopLeft, Table2, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import type { BuilderFlowStage } from '@/lib/dashboardos/scoped-builder-state'

const STEPS: Array<{
  stage: BuilderFlowStage
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}> = [
  { stage: 'tenant', label: 'Tenant', href: '/admin/tenants', icon: Users },
  { stage: 'data_source', label: 'Data Source', href: '/admin/data-sources', icon: Database },
  { stage: 'semantic_model', label: 'Model', href: '/admin/semantic-model', icon: Network },
  { stage: 'charts', label: 'Dataset + Chart', href: '/admin/datasets', icon: Table2 },
  { stage: 'dashboard', label: 'Dashboard', href: '/admin/charts', icon: LayoutDashboard },
  { stage: 'published', label: 'Publish', href: '/admin/publishing', icon: PanelsTopLeft },
]

const STAGE_ORDER = new Map(STEPS.map((step, index) => [step.stage, index]))

export function BuilderFlowIndicator() {
  const { scope, stage, dataSourceIds, semanticModelId, chartIds, dashboardId, publishedVersionId } = useScopedBuilderStore()
  const activeIndex = STAGE_ORDER.get(stage) ?? 0
  const scopeLabel = scope ? `${scope.tenantId.slice(0, 8)} / ${scope.projectId.slice(0, 8)}` : 'No explicit scope'

  return (
    <section className="mb-5 rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-card-overlay)] px-4 py-3 text-[var(--dos-text-primary)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--dos-text-muted)]">Builder flow</p>
          <p className="mt-1 text-sm font-semibold">{'create tenant -> attach source -> model -> dataset -> chart -> publish'}</p>
        </div>
        <Badge variant="outline" className="border-[color:var(--dos-border-mid)] text-[var(--dos-text-secondary)]">
          {scopeLabel}
        </Badge>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((step, index) => {
          const Icon = step.icon
          const complete = index < activeIndex
          const active = index === activeIndex
          return (
            <Link
              key={step.stage}
              href={step.href}
              className={[
                'flex min-w-fit items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors',
                active
                  ? 'border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] text-[var(--dos-text-primary)]'
                  : complete
                    ? 'border-[color:var(--dos-chart-success)] bg-[var(--dos-success-soft)] text-[var(--dos-text-primary)]'
                    : 'border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[var(--dos-text-secondary)] hover:border-[color:var(--dos-border-mid)]',
              ].join(' ')}
            >
              {complete ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--dos-chart-success)]" /> : <Circle className="h-3.5 w-3.5" />}
              <Icon className="h-3.5 w-3.5" />
              <span>{step.label}</span>
            </Link>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--dos-text-muted)]">
        <span>{dataSourceIds.length} source</span>
        <span>{semanticModelId ? 'model selected' : 'no model'}</span>
        <span>{chartIds.length} chart</span>
        <span>{dashboardId ? 'dashboard ready' : 'no dashboard'}</span>
        <span>{publishedVersionId ? 'published' : 'not published'}</span>
      </div>
    </section>
  )
}
