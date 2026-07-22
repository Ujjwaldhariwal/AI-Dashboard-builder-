/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DashboardOS tokens · designed-as-app */
'use client'

import Link from 'next/link'
import { ArrowRight, Check, Circle, Loader2, Play, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { readPlatformAssistantIntent } from '@/lib/ai/platform-assistant-contract'
import type { ChartTemplateId } from '@/types/chart-template'
import type { ProjectAutopilotRun, ProjectAutopilotStepPlan } from '@/types/project-autopilot'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
}

const CHART_TYPES: Array<{ id: ChartTemplateId; label: string }> = [
  { id: 'kpi-card', label: 'KPI' },
  { id: 'line', label: 'Trend' },
  { id: 'bar', label: 'Bar' },
  { id: 'pie', label: 'Pie' },
  { id: 'table-grid', label: 'Table' },
]

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
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [projectId, setProjectId] = useState('')
  const [objective, setObjective] = useState('Build an executive dashboard that highlights the most important KPIs, trends, comparisons, and operational details.')
  const [audience, setAudience] = useState('Leadership')
  const [chartCount, setChartCount] = useState(6)
  const [chartTypes, setChartTypes] = useState<ChartTemplateId[]>(['kpi-card', 'line', 'bar'])
  const [run, setRun] = useState<ProjectAutopilotRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const selectedProject = useMemo(() => projects.find(project => project.id === projectId) ?? null, [projectId, projects])

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

  const start = async () => {
    if (!selectedProject) return toast.error('Select a project first')
    if (objective.trim().length < 10) return toast.error('Describe the dashboard objective')
    setRunning(true)
    try {
      const response = await fetch(`/api/admin/projects/${selectedProject.id}/autopilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          brief: {
            objective,
            audience: audience.trim() || null,
            chartCount,
            chartTypes,
            autoApply: true,
          },
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.run) throw new Error(errorText(payload))
      const created = payload.run as ProjectAutopilotRun
      setRun(created)
      await execute(created)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/project_autopilot_runs|project_autopilot_steps/i.test(message)) {
        toast.error('Apply migration 20260722113000_project_autopilot_runs.sql in the AI Builder Supabase.')
      } else {
        toast.error(message)
      }
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

  const toggleChartType = (templateId: ChartTemplateId) => {
    setChartTypes(current => current.includes(templateId)
      ? current.filter(item => item !== templateId)
      : [...current, templateId])
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="border-b border-[color:var(--dos-border-soft)] pb-5">
        <h1 className="min-w-0 [overflow-wrap:anywhere] text-xl font-semibold text-[var(--dos-text-primary)]">Build the governed dashboard from one brief</h1>
        <p className="mt-1 text-sm text-[var(--dos-text-muted)]">Autopilot prepares semantic fields, a dataset, and editable charts. You approve meaning and publishing.</p>
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

            <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
              <div className="space-y-2">
                <Label htmlFor="autopilot-audience">Audience</Label>
                <Input id="autopilot-audience" className="h-11" value={audience} onChange={event => setAudience(event.target.value)} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="autopilot-count">Charts</Label>
                <Input id="autopilot-count" className="h-11" type="number" min={1} max={12} value={chartCount} onChange={event => setChartCount(Math.min(12, Math.max(1, Number(event.target.value) || 1)))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Preferred visuals</Label>
              <div className="flex flex-wrap gap-2">
                {CHART_TYPES.map(type => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => toggleChartType(type.id)}
                    className={[
                      'min-h-11 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)] focus-visible:ring-offset-2 active:bg-[var(--dos-surface-muted)] disabled:cursor-not-allowed disabled:opacity-55',
                      chartTypes.includes(type.id)
                        ? 'border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] text-[var(--dos-accent-primary)]'
                        : 'border-[color:var(--dos-border-soft)] text-[var(--dos-text-secondary)] hover:bg-[var(--dos-surface-muted)]',
                    ].join(' ')}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={() => void start()} isLoading={running} disabled={!selectedProject} className="mt-1 min-h-11 w-full sm:w-auto">
              <Play className="h-4 w-4" /> Start Autopilot
            </Button>
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

              {run.currentStep !== 'publish_review' ? (
                <Button variant="outline" className="mt-4 min-h-11 w-full" onClick={() => void resume()} isLoading={running}>
                  <RefreshCw className="h-4 w-4" /> {run.status === 'failed' ? 'Retry Autopilot' : 'Resume Autopilot'}
                </Button>
              ) : (
                <Button asChild className="mt-4 min-h-11 w-full">
                  <Link href="/admin/publishing">Review and publish <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
