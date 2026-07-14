'use client'

import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { GuidedPublishReadinessResult } from '@/lib/dashboardos/guided-review'

function statusLabel(status: GuidedPublishReadinessResult['status']) {
  if (status === 'ready_to_publish') return 'Ready to publish'
  if (status === 'previewable_not_publishable') return 'Previewable, not publishable'
  if (status === 'blocked_by_validation') return 'Blocked by validation'
  return 'Draft incomplete'
}

function statusClassName(status: GuidedPublishReadinessResult['status']) {
  if (status === 'ready_to_publish') return 'border-[color:var(--dos-success)] bg-[var(--dos-success-soft)] text-[var(--dos-success-text)]'
  if (status === 'blocked_by_validation') return 'border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] text-[var(--dos-warning-text)]'
  return 'border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[color:var(--dos-text-secondary)]'
}

export function GuidedPublishReadinessPanel({
  readiness,
  compact = false,
  source = 'local',
}: {
  readiness: GuidedPublishReadinessResult
  compact?: boolean
  source?: 'local' | 'server-preflight'
}) {
  const visibleReadyItems = compact ? readiness.readyItems.slice(0, 3) : readiness.readyItems
  const visibleWarnings = compact ? readiness.warnings.slice(0, 2) : readiness.warnings
  const visibleBlockers = compact ? readiness.blockers.slice(0, 3) : readiness.blockers

  return (
    <section
      className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4 text-[color:var(--dos-text-primary)]"
      data-testid="guided-publish-readiness"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusClassName(readiness.status)} data-testid="guided-readiness-status">
              {statusLabel(readiness.status)}
            </Badge>
            <span className="flex items-center gap-1 text-[11px] text-[color:var(--dos-text-muted)]">
              <Clock3 className="h-3.5 w-3.5" />
              Checked {new Date(readiness.evaluatedAt).toLocaleString()}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold">Publish readiness</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--dos-text-muted)]">{readiness.summary}</p>
          <p className="mt-1 max-w-2xl text-[11px] leading-4 text-[color:var(--dos-text-muted)]" data-testid="guided-readiness-source">
            {source === 'server-preflight'
              ? 'Server preflight was recomputed from current project data. Publish still revalidates before release.'
              : 'Local readiness preview. Run server preflight before publishing real project data.'}
          </p>
        </div>
        {readiness.nextFixAction ? (
          <Button asChild size="sm" variant="outline" className="border-[color:var(--dos-border-soft)] bg-transparent text-[color:var(--dos-text-secondary)] hover:bg-[var(--dos-surface)]">
            <Link href={readiness.nextFixAction.href}>
              {readiness.nextFixAction.label}
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>

      <div className={compact ? 'mt-4 grid gap-3 lg:grid-cols-3' : 'mt-4 grid gap-3 md:grid-cols-3'}>
        <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-[var(--dos-success-text)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Ready
          </p>
          <div className="mt-2 space-y-2">
            {visibleReadyItems.length === 0 ? (
              <p className="text-[11px] leading-4 text-[color:var(--dos-text-muted)]">No checks are ready yet.</p>
            ) : visibleReadyItems.map(check => (
              <p key={check.id} className="text-[11px] leading-4 text-[color:var(--dos-text-muted)]">{check.message}</p>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-[var(--dos-warning-text)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            Warnings
          </p>
          <div className="mt-2 space-y-2">
            {visibleWarnings.length === 0 ? (
              <p className="text-[11px] leading-4 text-[color:var(--dos-text-muted)]">No publish warnings.</p>
            ) : visibleWarnings.map(check => (
              <p key={check.id} className="text-[11px] leading-4 text-[color:var(--dos-text-muted)]">{check.message}</p>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-[color:var(--dos-text-secondary)]">
            <ShieldAlert className="h-3.5 w-3.5" />
            Blocking
          </p>
          <div className="mt-2 space-y-2" data-testid="guided-readiness-blockers">
            {visibleBlockers.length === 0 ? (
              <p className="text-[11px] leading-4 text-[color:var(--dos-text-muted)]">No blocking issues.</p>
            ) : visibleBlockers.map(check => (
              <p key={check.id} className="text-[11px] leading-4 text-[color:var(--dos-text-muted)]">{check.message}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
