'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Lock, Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  buildDashboardBriefPlan,
  profileDashboardBriefEndpoints,
  type DashboardBriefPlan,
} from '@/lib/builder/dashboard-brief-planner'
import { getEndpointSessionScope } from '@/lib/api/endpoint-runtime-cache'
import { useDashboardStore } from '@/store/builder-store'
import {
  BRIEF_CHART_TYPES,
  DASHBOARD_BRIEF_VERSION,
  DashboardBriefSchema,
  type BriefChartType,
  type DashboardChartRequirement,
} from '@/types/dashboard-brief'

interface DashboardBriefDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPE_LABEL: Record<BriefChartType, string> = {
  auto: 'Let Autopilot choose',
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  donut: 'Donut',
  'horizontal-bar': 'Horizontal bar',
  'horizontal-stacked-bar': 'Horizontal stacked',
  'grouped-bar': 'Grouped bar',
  'drilldown-bar': 'Drilldown bar',
  gauge: 'Gauge',
  'ring-gauge': 'Ring gauge',
  'status-card': 'KPI card',
  table: 'Table',
}

function makeId() {
  return crypto.randomUUID()
}

function newRequirement(index: number): DashboardChartRequirement {
  return {
    id: makeId(),
    title: index === 0 ? 'Primary KPI' : `Chart ${index + 1}`,
    instruction: '',
    chartType: index === 0 ? 'status-card' : 'auto',
    lockChartType: index === 0,
  }
}

export function DashboardBriefDialog({ open, onOpenChange }: DashboardBriefDialogProps) {
  const {
    dashboards,
    currentDashboardId,
    endpoints,
    widgets,
    addWidget,
    updateDashboard,
  } = useDashboardStore()
  const dashboard = dashboards.find(item => item.id === currentDashboardId) ?? null
  const dashboardEndpoints = endpoints.filter(endpoint => (endpoint.dashboardId ?? currentDashboardId) === currentDashboardId)
  const dashboardWidgets = widgets.filter(widget => widget.dashboardId === currentDashboardId)

  const [briefId, setBriefId] = useState(makeId)
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [requirements, setRequirements] = useState<DashboardChartRequirement[]>([])
  const [planning, setPlanning] = useState(false)
  const [plan, setPlan] = useState<DashboardBriefPlan | null>(null)

  useEffect(() => {
    if (!open || !dashboard) return
    const existing = dashboard.dashboardBrief
    setBriefId(existing?.id ?? makeId())
    setTitle(existing?.title ?? dashboard.name)
    setObjective(existing?.objective ?? dashboard.description ?? '')
    setRequirements(existing?.requirements?.length ? existing.requirements : [newRequirement(0), newRequirement(1), newRequirement(2)])
    setPlan(null)
  }, [dashboard, open])

  const canPlan = useMemo(() => (
    Boolean(title.trim() && objective.trim().length >= 3 && requirements.length > 0 && requirements.every(item => item.title.trim().length >= 2))
  ), [objective, requirements, title])

  const updateRequirement = (id: string, patch: Partial<DashboardChartRequirement>) => {
    setRequirements(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
    setPlan(null)
  }

  const buildBrief = () => DashboardBriefSchema.parse({
    version: DASHBOARD_BRIEF_VERSION,
    id: briefId,
    title: title.trim(),
    objective: objective.trim(),
    requirements: requirements.map(item => ({
      ...item,
      title: item.title.trim(),
      instruction: item.instruction.trim(),
      lockChartType: item.chartType === 'auto' ? false : item.lockChartType,
    })),
    updatedAt: new Date().toISOString(),
  })

  const handlePlan = async () => {
    if (!canPlan || !dashboard) return
    if (dashboardEndpoints.length === 0) {
      toast.error('Connect at least one data source before generating a dashboard.')
      return
    }
    setPlanning(true)
    try {
      const brief = buildBrief()
      const profiles = await profileDashboardBriefEndpoints({
        endpoints: dashboardEndpoints,
        sessionScope: getEndpointSessionScope(),
      })
      const nextPlan = buildDashboardBriefPlan({ brief, profiles, widgets: dashboardWidgets })
      setPlan(nextPlan)
      if (nextPlan.profiledEndpointCount === 0) toast.error('No connected source returned readable tabular data.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create an Autopilot plan.')
    } finally {
      setPlanning(false)
    }
  }

  const handleApply = () => {
    if (!plan || !dashboard) return
    updateDashboard(dashboard.id, { dashboardBrief: plan.brief })
    const generatedAt = new Date().toISOString()
    for (const draft of plan.drafts) {
      addWidget({
        title: draft.title,
        type: draft.type,
        endpointId: draft.endpointId,
        dataMapping: {
          xAxis: draft.xAxis,
          yAxis: draft.yAxis,
          autopilot: {
            briefId: plan.brief.id,
            requirementId: draft.requirementId,
            confidence: draft.confidence,
            locked: draft.locked,
            generatedAt,
          },
        },
        position: draft.position,
      })
    }
    toast.success(plan.drafts.length > 0
      ? `Generated ${plan.drafts.length} editable chart${plan.drafts.length === 1 ? '' : 's'}.`
      : 'Dashboard brief saved. Existing generated charts were preserved.')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Build from dashboard brief</DialogTitle>
              <DialogDescription>
                Define the required charts. Autopilot maps them to connected fields and creates normal, fully editable widgets.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!plan ? (
          <div className="space-y-5 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Dashboard title</Label>
                <Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Electricity overview" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Business objective</Label>
                <Textarea
                  value={objective}
                  onChange={event => setObjective(event.target.value)}
                  placeholder="Monitor consumption, total cost, monthly movement, and regional performance."
                  className="min-h-24 resize-none"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Required charts</h3>
                  <p className="text-xs text-muted-foreground">Pin exact chart types or let Autopilot choose based on the available data.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={requirements.length >= 24}
                  onClick={() => setRequirements(current => [...current, newRequirement(current.length)])}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add chart
                </Button>
              </div>

              <div className="space-y-2">
                {requirements.map((requirement, index) => (
                  <div key={requirement.id} className="grid gap-3 rounded-lg border bg-muted/15 p-3 md:grid-cols-[2rem_minmax(0,1fr)_13rem_7rem_2.25rem] md:items-center">
                    <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                    <div className="grid gap-2">
                      <Input
                        value={requirement.title}
                        onChange={event => updateRequirement(requirement.id, { title: event.target.value })}
                        placeholder="Monthly consumption"
                      />
                      <Input
                        value={requirement.instruction}
                        onChange={event => updateRequirement(requirement.id, { instruction: event.target.value })}
                        placeholder="Optional field or grouping instruction"
                        className="h-8 text-xs"
                      />
                    </div>
                    <Select
                      value={requirement.chartType}
                      onValueChange={value => updateRequirement(requirement.id, {
                        chartType: value as BriefChartType,
                        lockChartType: value === 'auto' ? false : requirement.lockChartType,
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BRIEF_CHART_TYPES.map(type => <SelectItem key={type} value={type}>{TYPE_LABEL[type]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Pin type</span>
                      <Switch
                        checked={requirement.lockChartType}
                        disabled={requirement.chartType === 'auto'}
                        onCheckedChange={checked => updateRequirement(requirement.id, { lockChartType: checked })}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={requirements.length === 1}
                      aria-label={`Remove ${requirement.title}`}
                      onClick={() => {
                        setRequirements(current => current.filter(item => item.id !== requirement.id))
                        setPlan(null)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Connected sources profiled</p><p className="mt-1 text-xl font-semibold">{plan.profiledEndpointCount}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">New editable charts</p><p className="mt-1 text-xl font-semibold">{plan.drafts.length}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Needs attention</p><p className="mt-1 text-xl font-semibold">{plan.unresolved.length}</p></div>
            </div>

            <div className="space-y-2">
              {plan.drafts.map(draft => (
                <div key={draft.requirementId} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <p className="font-medium">{draft.title}</p>
                      <Badge variant="outline">{draft.type}</Badge>
                      {draft.locked && <Badge variant="secondary">Pinned</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{draft.reason}</p>
                  </div>
                  <Badge variant="outline" className="w-fit">{draft.confidence}% confidence</Badge>
                </div>
              ))}
              {plan.unresolved.map(item => (
                <div key={item.requirementId} className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                  <div><p className="font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.reason}</p></div>
                </div>
              ))}
              {plan.retainedRequirementIds.length > 0 && (
                <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  {plan.retainedRequirementIds.length} previously generated chart{plan.retainedRequirementIds.length === 1 ? '' : 's'} will be retained so manual edits are never overwritten.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {plan ? (
            <>
              <Button variant="outline" onClick={() => setPlan(null)}>Edit brief</Button>
              <Button onClick={handleApply} disabled={plan.profiledEndpointCount === 0}>
                <Sparkles className="mr-2 h-4 w-4" /> Apply editable draft
              </Button>
            </>
          ) : (
            <Button onClick={() => void handlePlan()} disabled={!canPlan || planning}>
              {planning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {planning ? 'Mapping requirements…' : 'Generate plan'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

