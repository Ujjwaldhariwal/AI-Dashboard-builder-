/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
/* Hallmark · genre: modern-minimal · macrostructure: Intent-first Workbench · design-system: DashboardOS tokens · designed-as-app */
'use client'

import Link from 'next/link'
import { ArrowRight, Check, Circle, Database, Loader2, Play, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { readPlatformAssistantIntent } from '@/lib/ai/platform-assistant-contract'
import {
  compileRawDashboardBrief,
  inferDashboardAudience,
  interpretRawDashboardRequirements,
} from '@/lib/ai/raw-dashboard-brief'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import { dashboardRequirementTemplateId } from '@/types/dashboard-brief'
import type { ProjectAutopilotRun, ProjectAutopilotStepPlan } from '@/types/project-autopilot'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
}

function errorText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'Request failed'
  const value = (payload as { error?: unknown }).error
  if (typeof value === 'string') return value
  return 'Request failed'
}

function stepIcon(step: ProjectAutopilotStepPlan) {
  if (step.status === 'succeeded') return <Check className="h-3.5 w-3.5" />
  if (step.status === 'failed' || step.status === 'blocked') return <TriangleAlert className="h-3.5 w-3.5" />
  if (step.status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin" />
  return <Circle className="h-3.5 w-3.5" />
}

function statusVariant(status: ProjectAutopilotStepPlan['status']) {
  if (status === 'succeeded') return 'success' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'awaiting_review') return 'warning' as const
  return 'outline' as const
}

export function ProjectAutopilotPanel() {
  const setBuilderScope = useScopedBuilderStore(state => state.setScope)
  const setBuilderDashboardId = useScopedBuilderStore(state => state.setDashboardId)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [projectId, setProjectId] = useState('')
  const [rawBrief, setRawBrief] = useState('')
  const [briefTouched, setBriefTouched] = useState(false)
  const [run, setRun] = useState<ProjectAutopilotRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const selectedProject = useMemo(() => projects.find(project => project.id === projectId) ?? null, [projectId, projects])
  const interpretation = useMemo(() => interpretRawDashboardRequirements(rawBrief), [rawBrief])
  const briefError = briefTouched
    ? rawBrief.trim().length < 10
      ? 'Describe at least one KPI, comparison, trend, or report requirement.'
      : interpretation.requirements.length === 0
        ? 'Add at least one requirement the dashboard should answer.'
        : null
    : null

  useEffect(() => {
    const intent = readPlatformAssistantIntent('autopilot')
    if (!intent) return
    setProjectId(intent.projectId)
    if (intent.instruction) setRawBrief(intent.instruction)
  }, [])

  const loadLatest = async (project: ProjectOption) => {
    const response = await fetch(`/api/admin/projects/${project.id}/autopilot?tenantId=${encodeURIComponent(project.tenantId)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 503) {
        return null
      }
      throw new Error(errorText(payload))
    }
    return payload?.run as ProjectAutopilotRun | null
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch('/api/admin/projects', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(errorText(payload))
        const next = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
        if (!active) return
        setProjects(next)
        setProjectId(current => next.some(project => project.id === current) ? current : next[0]?.id || '')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!selectedProject) {
      setRun(null)
      return () => { active = false }
    }
    void loadLatest(selectedProject)
      .then(latestRun => {
        if (!active) return
        setRun(latestRun)
        if (latestRun?.brief.objective) setRawBrief(current => current.trim() ? current : latestRun.brief.objective)
      })
      .catch(error => {
        if (active) toast.error(error instanceof Error ? error.message : String(error))
      })
    return () => { active = false }
  }, [selectedProject])

  useEffect(() => {
    if (!run?.artifacts.dashboardId) return
    setBuilderScope({ tenantId: run.tenantId, projectId: run.projectId }, 'dashboard')
    setBuilderDashboardId(run.artifacts.dashboardId)
  }, [run?.artifacts.dashboardId, run?.projectId, run?.tenantId, setBuilderDashboardId, setBuilderScope])

  const execute = async (targetRun: ProjectAutopilotRun) => {
    const response = await fetch(`/api/admin/projects/${targetRun.projectId}/autopilot/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: targetRun.tenantId, runId: targetRun.id }),
    })
    const payload = await response.json().catch(() => null)
    if (payload?.run) setRun(payload.run as ProjectAutopilotRun)
    if (!response.ok) throw new Error(errorText(payload))
    return payload.run as ProjectAutopilotRun
  }

  const createAndExecute = async () => {
    if (!selectedProject) return toast.error('Select a project first')
    const requirementSpec = compileRawDashboardBrief({
      rawBrief,
      projectName: selectedProject.name,
    })
    const chartTypes = [...new Set(requirementSpec.requirements.map(dashboardRequirementTemplateId))]
    const response = await fetch(`/api/admin/projects/${selectedProject.id}/autopilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: selectedProject.tenantId,
        idempotencyKey: crypto.randomUUID(),
        brief: {
          objective: rawBrief.trim(),
          audience: inferDashboardAudience(rawBrief),
          chartCount: requirementSpec.requirements.length,
          chartTypes,
          requirementSpec,
          autoApply: true,
          publicationPolicy: 'auto_publish_when_healthy',
        },
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.run) throw new Error(errorText(payload))
    const created = payload.run as ProjectAutopilotRun
    setRun(created)
    await execute(created)
  }

  const handleExecutionError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/compose_project_autopilot_dashboard_draft/i.test(message)) {
      toast.error('Apply migration 20260722130000_autopilot_dashboard_composition.sql in the AI Builder Supabase.')
    } else if (/project_autopilot_runs|project_autopilot_steps/i.test(message)) {
      toast.error('Apply migration 20260722113000_project_autopilot_runs.sql in the AI Builder Supabase.')
    } else {
      toast.error(message)
    }
  }

  const start = async () => {
    if (!selectedProject) return toast.error('Select a project first')
    setBriefTouched(true)
    if (rawBrief.trim().length < 10 || interpretation.requirements.length === 0) return
    setRunning(true)
    try {
      await createAndExecute()
    } catch (error) {
      handleExecutionError(error)
    } finally {
      setRunning(false)
    }
  }

  const resetAndStart = async () => {
    if (!selectedProject) return toast.error('Select a project first')
    setBriefTouched(true)
    if (rawBrief.trim().length < 10 || interpretation.requirements.length === 0) return
    const confirmed = window.confirm(
      'Reset generated semantic mappings, datasets, charts, and dashboard drafts for this project? The attached data source and selected schema stay connected.',
    )
    if (!confirmed) return
    setRunning(true)
    try {
      const response = await fetch(`/api/admin/projects/${selectedProject.id}/autopilot/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: selectedProject.tenantId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.reset) throw new Error(errorText(payload))
      setRun(null)
      toast.success(`Workspace reset. Preserved ${payload.reset.dataSourcesPreserved} data source.`)
      await createAndExecute()
    } catch (error) {
      handleExecutionError(error)
    } finally {
      setRunning(false)
    }
  }

  const resume = async () => {
    if (!run) return
    setRunning(true)
    try {
      await execute(run)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setRunning(false)
    }
  }

  const selectProject = (nextProjectId: string) => {
    setProjectId(nextProjectId)
    setRawBrief('')
    setBriefTouched(false)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="border-b border-[color:var(--dos-border-soft)] pb-5">
        <h1 className="min-w-0 [overflow-wrap:anywhere] text-2xl font-semibold tracking-tight text-[var(--dos-text-primary)]">Describe the dashboard. Autopilot handles the rest.</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--dos-text-muted)]">Paste the client’s raw KPI and reporting brief. Autopilot reads the attached schema, resolves governed business meaning, chooses the right charts, and assembles a release-ready dashboard.</p>
      </section>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <section className="min-w-0 rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-4 sm:p-6">
          <div className="grid gap-5">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="autopilot-project">Build for</Label>
                <Select value={projectId} onValueChange={selectProject} disabled={loading || projects.length === 0}>
                  <SelectTrigger id="autopilot-project" className="h-11 min-w-0 sm:w-72"><SelectValue placeholder={loading ? 'Loading projects…' : 'Select project'} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}{project.tenantName ? ` · ${project.tenantName}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-1 text-xs text-[var(--dos-text-muted)]">
                <Database className="h-4 w-4 text-[var(--dos-accent-primary)]" aria-hidden="true" />
                Attached schema is the source of truth
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <Label htmlFor="autopilot-brief" className="text-base font-semibold text-[var(--dos-text-primary)]">What should this dashboard answer?</Label>
                  <p className="mt-1 text-xs leading-5 text-[var(--dos-text-muted)]">Paste the requirement as received. Use a new line for each KPI or business question when convenient.</p>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-[var(--dos-text-muted)]">{rawBrief.length} / 2000</span>
              </div>
              <Textarea
                id="autopilot-brief"
                value={rawBrief}
                onChange={event => setRawBrief(event.target.value)}
                onBlur={() => setBriefTouched(true)}
                className="min-h-64 resize-y border-[color:var(--dos-border-strong)] bg-[var(--dos-background-deep)] p-4 text-base leading-7 outline-2 outline-transparent focus-visible:outline-[var(--dos-accent-primary)]"
                maxLength={2000}
                aria-required="true"
                aria-invalid={Boolean(briefError)}
                aria-describedby="autopilot-brief-help"
                placeholder={'Total recognised revenue and month-over-month growth\nMonthly revenue trend for the last 12 months\nCompare revenue and margin by region\nTop 10 products by revenue'}
              />
              <div id="autopilot-brief-help" className="min-h-5 text-xs leading-5">
                {briefError ? <span className="text-[var(--dos-danger-text)]">{briefError}</span> : <span className="text-[var(--dos-text-muted)]">Metric names stay in client language; Autopilot matches them to approved semantic IDs before building.</span>}
              </div>
            </div>

            {interpretation.requirements.length > 0 ? (
              <details className="group border-y border-[color:var(--dos-border-soft)] py-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-[var(--dos-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)]">
                  <span>{interpretation.requirements.length} requirement{interpretation.requirements.length === 1 ? '' : 's'}</span>
                  <span className="text-xs font-normal text-[var(--dos-text-muted)] group-open:hidden">Review</span>
                  <span className="hidden text-xs font-normal text-[var(--dos-text-muted)] group-open:inline">Hide</span>
                </summary>
                <div className="divide-y divide-[color:var(--dos-border-soft)] pt-1">
                  {interpretation.requirements.map((requirement, index) => (
                    <div key={requirement.id} className="flex min-w-0 items-center gap-3 py-2.5">
                      <span className="font-mono text-[11px] tabular-nums text-[var(--dos-text-muted)]">{String(index + 1).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--dos-text-secondary)]">{requirement.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{dashboardRequirementTemplateId(requirement).replace(/-/g, ' ')}</Badge>
                    </div>
                  ))}
                </div>
                {interpretation.omittedCount > 0 ? <p className="pt-2 text-xs text-[var(--dos-danger-text)]">Only the first 12 requirements will run. Move {interpretation.omittedCount} requirement{interpretation.omittedCount === 1 ? '' : 's'} to a second brief.</p> : null}
              </details>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-[color:var(--dos-border-soft)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-xs leading-5 text-[var(--dos-text-muted)]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dos-accent-primary)]" aria-hidden="true" />
                Ambiguous meaning pauses for review. Healthy releases publish automatically.
              </div>
              <Button onClick={() => void start()} isLoading={running} disabled={!selectedProject || rawBrief.trim().length < 10} className="min-h-11 w-full whitespace-nowrap sm:w-auto">
                <Play className="h-4 w-4" /> Build dashboard
              </Button>
            </div>
          </div>
        </section>

        <section aria-live="polite" className="min-w-0 rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--dos-text-primary)]">Build status</h2>
              <p className="mt-1 text-xs text-[var(--dos-text-muted)]">Safe to close and resume later.</p>
            </div>
            {run ? <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'awaiting_review' ? 'warning' : 'outline'}>{run.status.replace(/_/g, ' ')}</Badge> : null}
          </div>

          {!run ? (
            <div className="mt-8 flex min-h-48 flex-col justify-center border-y border-[color:var(--dos-border-soft)] py-8">
              <p className="text-sm font-medium text-[var(--dos-text-secondary)]">Waiting for the brief</p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--dos-text-muted)]">Schema scope, semantic model, dataset, charts, layout, and release verification will appear here as one continuous run.</p>
            </div>
          ) : (
            <>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--dos-surface-muted)]">
                <div className="h-full origin-left bg-[var(--dos-accent-primary)] transition-transform duration-300 ease-out" style={{ transform: `scaleX(${run.plan.progress / 100})` }} />
              </div>
              {run.artifacts.requirementCoverage ? (
                <div className="mt-4 space-y-2 border-y border-[color:var(--dos-border-soft)] py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--dos-text-primary)]">Requirement coverage</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="success">{run.artifacts.requirementCoverage.ready} ready</Badge>
                      {run.artifacts.requirementCoverage.needsReview > 0 ? <Badge variant="warning">{run.artifacts.requirementCoverage.needsReview} review</Badge> : null}
                      {run.artifacts.requirementCoverage.blocked > 0 ? <Badge variant="destructive">{run.artifacts.requirementCoverage.blocked} blocked</Badge> : null}
                    </div>
                  </div>
                  {run.artifacts.requirementCoverage.items.map(item => (
                    <div key={item.requirementId} className="border-t border-[color:var(--dos-border-soft)] pt-2 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium text-[var(--dos-text-secondary)]">{item.title}</p>
                        <Badge variant={item.status === 'ready' ? 'success' : item.status === 'blocked' ? 'destructive' : 'warning'} className="text-[10px]">{item.status.replace('_', ' ')}</Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--dos-text-muted)]">{item.reason}</p>
                    </div>
                  ))}
                  {run.artifacts.requirementCoverage.items.some(item => item.required && item.status !== 'ready') ? (
                    <Link href="/admin/semantic-model" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--dos-accent-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)]">
                      Review semantic mappings <ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-4">
                {run.plan.steps.map(step => (
                  <div key={step.key} className="flex items-start gap-3 border-b border-[color:var(--dos-border-soft)] py-3 last:border-b-0">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--dos-surface-muted)] text-[var(--dos-text-secondary)]">{stepIcon(step)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-[var(--dos-text-primary)]">{step.label}</p>
                        <Badge variant={statusVariant(step.status)} className="text-[10px]">{step.status.replace(/_/g, ' ')}</Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--dos-text-muted)]">{step.detail}</p>
                      {(step.status === 'awaiting_review' || step.status === 'blocked') && step.key !== 'dataset' && step.key !== 'charts' ? (
                        <Link href={step.href} className="mt-2 inline-flex whitespace-nowrap items-center gap-1 text-xs font-medium text-[var(--dos-accent-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)]">
                          Open {step.label.toLowerCase()} <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {run.currentStep !== 'publish_review' || (
                run.status !== 'succeeded'
                && run.brief.publicationPolicy === 'auto_publish_when_healthy'
              ) ? (
                <Button variant="outline" className="mt-4 min-h-11 w-full whitespace-nowrap" onClick={() => void resume()} isLoading={running}>
                  <RefreshCw className="h-4 w-4" /> {
                    run.status === 'failed'
                      ? 'Retry Autopilot'
                      : run.currentStep === 'publish_review'
                        ? 'Run release finalization'
                        : 'Resume Autopilot'
                  }
                </Button>
              ) : (
                <Button asChild className="mt-4 min-h-11 w-full whitespace-nowrap">
                  <Link href="/admin/publishing">{run.status === 'succeeded' ? 'Open published dashboard' : 'Review dashboard and publish'} <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              )}
              <Button variant="ghost" className="mt-2 min-h-11 w-full whitespace-nowrap text-[var(--dos-text-muted)]" onClick={() => void resetAndStart()} disabled={running}>
                <RotateCcw className="h-4 w-4" /> Reset generated work
              </Button>
              <p className="mt-1 text-center text-[11px] leading-4 text-[var(--dos-text-muted)]">Reset preserves the connected source, introspected schema, and selected tables.</p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
