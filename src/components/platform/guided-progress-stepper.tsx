'use client'

import { CheckCircle2, Circle, LockKeyhole } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { GuidedContinueAction, GuidedProgressStep, GuidedProgressStepId } from '@/lib/dashboardos/guided-review'

export function GuidedProgressStepper({
  steps,
  actions,
  title = 'Continue guided flow',
  description = 'Advanced controls stay available when the guided path needs adjustment.',
}: {
  steps: GuidedProgressStep[]
  actions?: Partial<Record<GuidedProgressStepId, GuidedContinueAction>>
  title?: string
  description?: string
}) {
  return (
    <section className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-4 text-[color:var(--dos-text-primary)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge className="bg-[var(--dos-success-soft)] text-[var(--dos-success-text)] hover:bg-[var(--dos-success-soft)]">Guided workflow</Badge>
          <h2 className="mt-2 text-base font-semibold">{title}</h2>
        </div>
        <p className="text-xs text-[color:var(--dos-text-muted)]">
          {description}
        </p>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-7">
        {steps.map((step) => {
          const Icon = step.status === 'done' ? CheckCircle2 : step.status === 'blocked' ? LockKeyhole : Circle
          const action = actions?.[step.id]
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
              {action && step.status !== 'blocked' ? (
                <Button asChild size="sm" variant="outline" className="mt-3 h-7 border-current bg-transparent px-2 text-[11px] hover:bg-white/10">
                  <Link href={action.href}>{action.label}</Link>
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
