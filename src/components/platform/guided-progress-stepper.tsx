'use client'

import { CheckCircle2, Circle, LockKeyhole } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { GuidedProgressStep } from '@/lib/dashboardos/guided-review'

export function GuidedProgressStepper({ steps }: { steps: GuidedProgressStep[] }) {
  return (
    <section className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-4 text-[color:var(--dos-text-primary)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge className="bg-[var(--dos-success-soft)] text-[var(--dos-success-text)] hover:bg-[var(--dos-success-soft)]">Guided workflow</Badge>
          <h2 className="mt-2 text-base font-semibold">Connect, review, generate, publish</h2>
        </div>
        <p className="text-xs text-[color:var(--dos-text-muted)]">
          Advanced controls stay available when the guided path needs adjustment.
        </p>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-7">
        {steps.map((step) => {
          const Icon = step.status === 'done' ? CheckCircle2 : step.status === 'blocked' ? LockKeyhole : Circle
          const className = step.status === 'done'
            ? 'border-[color:var(--dos-success)] bg-[var(--dos-success-soft)] text-[var(--dos-success-text)]'
            : step.status === 'ready'
              ? 'border-[color:var(--dos-info)] bg-[var(--dos-info-soft)] text-[var(--dos-info-text)]'
              : 'border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] text-[color:var(--dos-text-muted)]'

          return (
            <div key={step.id} className={`rounded-lg border p-3 ${className}`}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <p className="text-xs font-semibold">{step.label}</p>
              </div>
              <p className="mt-2 text-[11px] leading-4 opacity-90">{step.detail}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
