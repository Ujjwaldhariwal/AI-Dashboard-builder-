/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DashboardOS tokens · designed-as-app */
'use client'

import Link from 'next/link'
import { ArrowRight, Check, Circle, Loader2, Plus, Play, RefreshCw, RotateCcw, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { readPlatformAssistantIntent } from '@/lib/ai/platform-assistant-contract'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import {
  DASHBOARD_BRIEF_VERSION,
  DashboardBriefSchema,
  dashboardRequirementTemplateId,
  type BriefChartType,
  type DashboardChartRequirement,
} from '@/types/dashboard-brief'
import type {
  ProjectAutopilotPublicationPolicy,
  ProjectAutopilotRun,
  ProjectAutopilotStepPlan,
} from '@/types/project-autopilot'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
}

const REQUIREMENT_CHART_TYPES: Array<{ id: BriefChartType; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'status-card', label: 'KPI' },
  { id: 'line', label: 'Trend' },
  { id: 'bar', label: 'Bar' },
  { id: 'pie', label: 'Pie' },
  { id: 'table', label: 'Table' },
]

const AGGREGATIONS = ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'] as const
const TIME_GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const

function newRequirement(index: number): DashboardChartRequirement {
  return {
    id: crypto.randomUUID(),
    title: index === 0 ? 'Primary KPI' : `Required chart ${index + 1}`,
    instruction: '',
    chartType: index === 0 ? 'status-card' : 'auto',
    lockChartType: index === 0,
    metric: null,
    dimensions: [],
    timeGrain: null,
    required: true,
  }
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
  const [objective, setObjective] = useState('Build an executive dashboard that highlights the most important KPIs, trends, comparisons, and operational details.')
  const [audience, setAudience] = useState('Leadership')
  const [requirements, setRequirements] = useState<DashboardChartRequirement[]>([])
  const [publicationPolicy, setPublicationPolicy] = useState<ProjectAutopilotPublicationPolicy>(
    'auto_publish_when_healthy',
  )
  const [run, setRun] = useState<ProjectAutopilotRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const selectedProject = useMemo(() => projects.find(project => project.id === projectId) ?? null, [projectId, projects])

  useEffect(() => {
    setRequirements(current => current.length > 0 ? current : [newRequirement(0)])
  }, [])

  useEffect(() => {
    const intent = readPlatformAssistantIntent('autopilot')
    if (!intent) return
    setProjectId(intent.projectId)
    if (intent.instruction) setObjective(intent.instruction)
  }, [])

  const loadLatest = async (project: ProjectOption) => {
    const response = await fetch(`/api/admin/projects/${project.id}/autopilot?tenantId=${encodeURIComponent(project.tenantId)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 503) {
        setRun(null)
        return
      }
      throw new Error(errorText(payload))
    }
    setRun(payload?.run ?? null)
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
    if (!selectedProject) {
      setRun(null)
      return
    }
    void loadLatest(selectedProject).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
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
    if (objective.trim().length < 10) return toast.error('Describe the dashboard objective')
    if (requirements.length === 0 || requirements.some(requirement => requirement.title.trim().length < 2)) {
      return toast.error('Add at least one named KPI or chart requirement')
    }
    const requirementSpec = DashboardBriefSchema.parse({
      version: DASHBOARD_BRIEF_VERSION,
      id: crypto.randomUUID(),
      title: `${audience.trim() || selectedProject.name} dashboard requirements`,
      objective: objective.trim(),
      requirements,
      updatedAt: new Date().toISOString(),
    })
    const chartTypes = [...new Set(requirementSpec.requirements.map(dashboardRequirementTemplateId))]
    const response = await fetch(`/api/admin/projects/${selectedProject.id}/autopilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: selectedProject.tenantId,
        idempotencyKey: crypto.randomUUID(),
        brief: {
          objective,
          audience: audience.trim() || null,
          chartCount: requirementSpec.requirements.length,
          chartTypes,
          requirementSpec,
          autoApply: true,
          publicationPolicy,
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
    if (objective.trim().length < 10) return toast.error('Describe the dashboard objective')
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
    if (objective.trim().length < 10) return toast.error('Describe the dashboard objective')
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

  const updateRequirement = (id: string, patch: Partial<DashboardChartRequirement>) => {
    setRequirements(current => current.map(requirement => requirement.id === id ? { ...requirement, ...patch } : requirement))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="border-b border-[color:var(--dos-border-soft)] pb-5">
        <h1 className="min-w-0 [overflow-wrap:anywhere] text-xl font-semibold text-[var(--dos-text-primary)]">Build the governed dashboard from client requirements</h1>
        <p className="mt-1 text-sm text-[var(--dos-text-muted)]">Autopilot resolves every KPI against the attached database, pauses on ambiguous semantics, composes requirement-linked charts, and publishes only after immutable release checks pass.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <section className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-5">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="autopilot-project">Project</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={loading || projects.length === 0}>
                <SelectTrigger id="autopilot-project" className="h-11"><SelectValue placeholder={loading ? 'Loading projects…' : 'Select project'} /></SelectTrigger>
                <SelectContent>
                  {projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}{project.tenantName ? ` · ${project.tenantName}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="autopilot-objective">Dashboard brief</Label>
              <Textarea id="autopilot-objective" value={objective} onChange={event => setObjective(event.target.value)} className="min-h-32 resize-y" maxLength={4000} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="autopilot-audience">Audience</Label>
              <Input id="autopilot-audience" className="h-11" value={audience} onChange={event => setAudience(event.target.value)} maxLength={200} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="autopilot-publication-policy">Release mode</Label>
              <Select
                value={publicationPolicy}
                onValueChange={value => setPublicationPolicy(value as ProjectAutopilotPublicationPolicy)}
              >
                <SelectTrigger id="autopilot-publication-policy" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_publish_when_healthy">
                    Auto-publish when healthy
                  </SelectItem>
                  <SelectItem value="review_required">
                    Require final review
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-[var(--dos-text-muted)]">
                Automatic mode still runs readiness, immutable snapshot, entitlement, and client-loadability checks.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label>KPI and chart requirements</Label>
                  <p className="mt-1 text-xs leading-5 text-[var(--dos-text-muted)]">Each requirement is resolved against approved semantic IDs before any dataset or chart is created.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={requirements.length >= 12}
                  onClick={() => setRequirements(current => [...current, newRequirement(current.length)])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              <div className="space-y-3">
                {requirements.map((requirement, index) => (
                  <div key={requirement.id} className="space-y-3 rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-muted)]/35 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[var(--dos-text-muted)]">{String(index + 1).padStart(2, '0')}</span>
                      <Input
                        aria-label={`Requirement ${index + 1} title`}
                        value={requirement.title}
                        onChange={event => updateRequirement(requirement.id, { title: event.target.value })}
                        placeholder="Monthly recognised revenue"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={requirements.length === 1}
                        aria-label={`Remove ${requirement.title}`}
                        onClick={() => setRequirements(current => current.filter(item => item.id !== requirement.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                      <Input
                        aria-label={`${requirement.title} metric concept`}
                        value={requirement.metric?.concept ?? ''}
                        onChange={event => updateRequirement(requirement.id, {
                          metric: event.target.value
                            ? { concept: event.target.value, aggregation: requirement.metric?.aggregation ?? 'sum' }
                            : null,
                        })}
                        placeholder="Metric concept, for example Recognised Revenue"
                      />
                      <Select
                        value={requirement.metric?.aggregation ?? 'sum'}
                        onValueChange={aggregation => updateRequirement(requirement.id, {
                          metric: { concept: requirement.metric?.concept || requirement.title, aggregation: aggregation as typeof AGGREGATIONS[number] },
                        })}
                      >
                        <SelectTrigger aria-label={`${requirement.title} aggregation`}><SelectValue /></SelectTrigger>
                        <SelectContent>{AGGREGATIONS.map(item => <SelectItem key={item} value={item}>{item.replace('_', ' ')}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input
                        aria-label={`${requirement.title} dimensions`}
                        value={requirement.dimensions.join(', ')}
                        onChange={event => updateRequirement(requirement.id, {
                          dimensions: event.target.value.split(',').map(value => value.trim()).filter(Boolean).slice(0, 6),
                        })}
                        placeholder="Dimensions: region, product"
                      />
                      <Select
                        value={requirement.timeGrain ?? 'none'}
                        onValueChange={value => updateRequirement(requirement.id, { timeGrain: value === 'none' ? null : value as typeof TIME_GRAINS[number] })}
                      >
                        <SelectTrigger aria-label={`${requirement.title} time grain`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No time grain</SelectItem>
                          {TIME_GRAINS.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select
                        value={requirement.chartType}
                        onValueChange={value => updateRequirement(requirement.id, {
                          chartType: value as BriefChartType,
                          lockChartType: value !== 'auto',
                        })}
                      >
                        <SelectTrigger aria-label={`${requirement.title} visual`}><SelectValue /></SelectTrigger>
                        <SelectContent>{REQUIREMENT_CHART_TYPES.map(type => <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Textarea
                      aria-label={`${requirement.title} calculation and filters`}
                      value={requirement.instruction}
                      onChange={event => updateRequirement(requirement.id, { instruction: event.target.value })}
                      className="min-h-20 resize-y"
                      maxLength={500}
                      placeholder="Business definition, filters, comparison, or calculation notes"
                    />
                    <label className="flex items-center justify-between gap-3 text-xs text-[var(--dos-text-muted)]">
                      <span>Required for release</span>
                      <Switch checked={requirement.required} onCheckedChange={required => updateRequirement(requirement.id, { required })} />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void start()} isLoading={running} disabled={!selectedProject} className="min-h-11 w-full sm:w-auto">
                <Play className="h-4 w-4" /> Start Autopilot
              </Button>
              <Button variant="outline" onClick={() => void resetAndStart()} disabled={!selectedProject || running} className="min-h-11 w-full sm:w-auto">
                <RotateCcw className="h-4 w-4" /> Reset &amp; run fresh
              </Button>
            </div>
            <p className="text-xs text-[var(--dos-text-muted)]">Fresh reset preserves the connected data source, introspected schema, and selected tables.</p>
          </div>
        </section>

        <section aria-live="polite" className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--dos-text-primary)]">Build status</h2>
              <p className="mt-1 text-xs text-[var(--dos-text-muted)]">Safe to close and resume later.</p>
            </div>
            {run ? <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'awaiting_review' ? 'warning' : 'outline'}>{run.status.replace(/_/g, ' ')}</Badge> : null}
          </div>

          {!run ? (
            <div className="mt-8 px-4 py-10 text-center">
              <p className="text-sm text-[var(--dos-text-secondary)]">Start with a brief to generate the project plan.</p>
            </div>
          ) : (
            <>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--dos-surface-muted)]">
                <div className="h-full origin-left bg-[var(--dos-accent-primary)] transition-transform duration-300 ease-out" style={{ transform: `scaleX(${run.plan.progress / 100})` }} />
              </div>
              {run.artifacts.requirementCoverage ? (
                <div className="mt-4 space-y-2 rounded-md border border-[color:var(--dos-border-soft)] p-3">
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
                <Button variant="outline" className="mt-4 min-h-11 w-full" onClick={() => void resume()} isLoading={running}>
                  <RefreshCw className="h-4 w-4" /> {
                    run.status === 'failed'
                      ? 'Retry Autopilot'
                      : run.currentStep === 'publish_review'
                        ? 'Run release finalization'
                        : 'Resume Autopilot'
                  }
                </Button>
              ) : (
                <Button asChild className="mt-4 min-h-11 w-full">
                  <Link href="/admin/publishing">{run.status === 'succeeded' ? 'Open published dashboard' : 'Review dashboard and publish'} <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
