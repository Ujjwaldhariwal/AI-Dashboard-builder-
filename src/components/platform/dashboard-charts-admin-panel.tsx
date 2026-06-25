'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle2, Loader2, Palette, Plus, Send, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ChartCompatibilityResult, ChartTemplateId, DatasetShape } from '@/types/chart-template'
import type { DashboardChartConfig, DashboardChartEncoding } from '@/types/dashboard-chart'
import type { SemanticDataset } from '@/types/semantic-dataset'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
}

interface DatasetPlan {
  dataset: {
    id: string
    name: string
    status: string
  }
  fields: Array<{ id: string; name: string; role: string }>
  metrics: Array<{ id: string; name: string; aggregation: string }>
  chartOptions?: {
    shape: DatasetShape
    compatibility: ChartCompatibilityResult[]
  }
}

function errorToText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
  }
  return 'Request failed'
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

function defaultEncoding(plan: DatasetPlan | null): DashboardChartEncoding {
  return {
    xAxisFieldId: plan?.fields[0]?.id,
    yMetricIds: plan?.metrics[0]?.id ? [plan.metrics[0].id] : [],
    stackMetricIds: [],
    tooltipFieldIds: [...(plan?.fields.slice(0, 2).map(field => field.id) ?? []), ...(plan?.metrics.slice(0, 2).map(metric => metric.id) ?? [])],
    labelById: Object.fromEntries([
      ...(plan?.fields.map(field => [field.id, field.name]) ?? []),
      ...(plan?.metrics.map(metric => [metric.id, metric.name]) ?? []),
    ]),
    colorById: {},
    sort: null,
    limit: 25,
  }
}

export function DashboardChartsAdminPanel() {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [datasets, setDatasets] = useState<SemanticDataset[]>([])
  const [charts, setCharts] = useState<DashboardChartConfig[]>([])
  const [projectId, setProjectId] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [plan, setPlan] = useState<DatasetPlan | null>(null)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState<ChartTemplateId | ''>('')
  const [encoding, setEncoding] = useState<DashboardChartEncoding>(defaultEncoding(null))
  const [gridSpan, setGridSpan] = useState('2')
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [planLoading, setPlanLoading] = useState(false)

  const selectedProject = projects.find(project => project.id === projectId)
  const selectedDataset = datasets.find(dataset => dataset.id === datasetId)
  const allowedOptions = useMemo(() => (
    plan?.chartOptions?.compatibility.filter(option => option.status !== 'blocked') ?? []
  ), [plan])
  const recommendedOption = allowedOptions.find(option => option.status === 'recommended') ?? allowedOptions[0]

  const fetchProjects = useCallback(async () => {
    const response = await fetch('/api/admin/projects', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload))
    const nextProjects = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
    setProjects(nextProjects)
    setProjectId(current => current || nextProjects[0]?.id || '')
  }, [])

  const fetchProjectAssets = useCallback(async (nextProjectId: string) => {
    if (!nextProjectId) return
    const [datasetsResponse, chartsResponse] = await Promise.all([
      fetch(`/api/admin/datasets?projectId=${nextProjectId}`, { cache: 'no-store' }),
      fetch(`/api/admin/dashboard-charts?projectId=${nextProjectId}`, { cache: 'no-store' }),
    ])
    const datasetsPayload = await datasetsResponse.json().catch(() => null)
    const chartsPayload = await chartsResponse.json().catch(() => null)
    if (!datasetsResponse.ok) throw new Error(errorToText(datasetsPayload))
    if (!chartsResponse.ok) throw new Error(errorToText(chartsPayload))
    const nextDatasets = Array.isArray(datasetsPayload?.datasets) ? datasetsPayload.datasets as SemanticDataset[] : []
    setDatasets(nextDatasets)
    setCharts(Array.isArray(chartsPayload?.charts) ? chartsPayload.charts as DashboardChartConfig[] : [])
    setDatasetId(current => nextDatasets.some(dataset => dataset.id === current) ? current : nextDatasets[0]?.id ?? '')
  }, [])

  const fetchPlan = useCallback(async (nextDatasetId: string) => {
    if (!nextDatasetId) {
      setPlan(null)
      return
    }
    setPlanLoading(true)
    try {
      const response = await fetch(`/api/admin/datasets/${nextDatasetId}/plan`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      const nextPlan = payload?.plan as DatasetPlan
      const nextRecommendedTemplateId = nextPlan.chartOptions?.compatibility
        .find((option: ChartCompatibilityResult) => option.status === 'recommended')
        ?.template.id ?? ''
      setPlan(nextPlan)
      setName(current => current || `${nextPlan.dataset.name} chart`)
      setTemplateId(current => current || nextRecommendedTemplateId)
      setEncoding(defaultEncoding(nextPlan))
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setPlanLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchProjects().catch(error => toast.error(errorToText(error))).finally(() => setLoading(false))
  }, [fetchProjects])

  useEffect(() => {
    if (!projectId) return
    void fetchProjectAssets(projectId).catch(error => toast.error(errorToText(error)))
  }, [fetchProjectAssets, projectId])

  useEffect(() => {
    void fetchPlan(datasetId)
  }, [datasetId, fetchPlan])

  useEffect(() => {
    if (!templateId && recommendedOption?.template.id) setTemplateId(recommendedOption.template.id)
  }, [recommendedOption, templateId])

  async function handleSave() {
    if (!selectedProject || !selectedDataset || !templateId) {
      toast.error('Select a project, dataset, and chart template first')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/admin/dashboard-charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          datasetId: selectedDataset.id,
          name,
          templateId,
          encoding,
          presentation: {
            size: Number(gridSpan) >= 3 ? 'wide' : 'standard',
            showLegend: true,
            showLabels: false,
            valueFormat: null,
          },
          interactions: {},
          layout: {
            order: charts.length,
            gridSpan: Number(gridSpan),
          },
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setCharts(current => [payload.chart as DashboardChartConfig, ...current])
      toast.success('Draft chart saved')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleStatus(chartId: string, status: 'draft' | 'published' | 'archived') {
    setUpdatingId(chartId)
    try {
      const response = await fetch(`/api/admin/dashboard-charts/${chartId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setCharts(current => current.map(chart => chart.id === chartId ? payload.chart as DashboardChartConfig : chart))
      toast.success(status === 'published' ? 'Chart published' : 'Chart status updated')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading chart composer
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#a6e22e]">Chart Composer</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">Validated dashboard charts</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Convert published semantic datasets into guarded chart configs with axis, tooltip, sizing, and template validation.
          </p>
        </div>
        <Badge className="bg-[#66d9ef]/15 text-[#9beaff] hover:bg-[#66d9ef]/20">
          {charts.length} saved configs
        </Badge>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-white/10 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <SlidersHorizontal className="h-4 w-4 text-[#fd971f]" />
              Draft chart setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-300">Project</Label>
                <Select value={projectId} onValueChange={(value) => {
                  setProjectId(value)
                  setDatasetId('')
                  setPlan(null)
                  setTemplateId('')
                }}>
                  <SelectTrigger className="border-white/10 bg-slate-950 text-slate-100">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Dataset</Label>
                <Select value={datasetId} onValueChange={(value) => {
                  setDatasetId(value)
                  setTemplateId('')
                }}>
                  <SelectTrigger className="border-white/10 bg-slate-950 text-slate-100">
                    <SelectValue placeholder="Select dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map(dataset => (
                      <SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <Label className="text-slate-300">Chart name</Label>
                <Input value={name} onChange={event => setName(event.target.value)} className="border-white/10 bg-slate-950 text-slate-100" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Grid span</Label>
                <Select value={gridSpan} onValueChange={setGridSpan}>
                  <SelectTrigger className="border-white/10 bg-slate-950 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Compact</SelectItem>
                    <SelectItem value="2">Standard</SelectItem>
                    <SelectItem value="3">Wide</SelectItem>
                    <SelectItem value="4">Full width</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-fuchsia-300/20 bg-fuchsia-300/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-fuchsia-100">
                    {planLoading ? 'Analyzing dataset...' : `Shape: ${plan?.chartOptions?.shape.kind ?? 'unknown'}`}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">Only compatible chart templates are selectable.</p>
                </div>
                {recommendedOption ? (
                  <Badge className="bg-[#a6e22e]/20 text-[#d7ff8f] hover:bg-[#a6e22e]/25">
                    Recommended: {recommendedOption.template.name}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {allowedOptions.map(option => (
                  <button
                    key={option.template.id}
                    type="button"
                    onClick={() => setTemplateId(option.template.id)}
                    className={[
                      'rounded-md border px-3 py-2 text-left text-xs transition-colors',
                      templateId === option.template.id
                        ? 'border-[#a6e22e]/60 bg-[#a6e22e]/15 text-[#d7ff8f]'
                        : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25',
                    ].join(' ')}
                  >
                    <span className="font-semibold">{option.template.name}</span>
                    <span className="mt-1 block text-[11px] text-slate-500">{option.template.family} / score {option.score}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-300">X axis</Label>
                <Select value={encoding.xAxisFieldId ?? ''} onValueChange={(value) => setEncoding(current => ({ ...current, xAxisFieldId: value }))}>
                  <SelectTrigger className="border-white/10 bg-slate-950 text-slate-100">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {plan?.fields.map(field => (
                      <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Row limit</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={encoding.limit ?? 25}
                  onChange={event => setEncoding(current => ({ ...current, limit: Number(event.target.value) || 25 }))}
                  className="border-white/10 bg-slate-950 text-slate-100"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                <p className="text-xs font-semibold text-slate-200">Y metrics</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {plan?.metrics.map(metric => (
                    <button
                      key={metric.id}
                      type="button"
                      onClick={() => setEncoding(current => ({ ...current, yMetricIds: toggleValue(current.yMetricIds, metric.id) }))}
                      className={[
                        'rounded-md border px-2 py-1 text-xs',
                        encoding.yMetricIds.includes(metric.id)
                          ? 'border-[#66d9ef]/50 bg-[#66d9ef]/15 text-[#9beaff]'
                          : 'border-white/10 text-slate-400',
                      ].join(' ')}
                    >
                      {metric.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                <p className="text-xs font-semibold text-slate-200">Tooltip fields</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...(plan?.fields ?? []), ...(plan?.metrics ?? [])].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setEncoding(current => ({ ...current, tooltipFieldIds: toggleValue(current.tooltipFieldIds, item.id) }))}
                      className={[
                        'rounded-md border px-2 py-1 text-xs',
                        encoding.tooltipFieldIds.includes(item.id)
                          ? 'border-[#fd971f]/50 bg-[#fd971f]/15 text-[#ffd866]'
                          : 'border-white/10 text-slate-400',
                      ].join(' ')}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button onClick={() => void handleSave()} disabled={saving || !templateId || !datasetId} className="bg-[#a6e22e] text-[#1f1f1c] hover:bg-[#cfff55]">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Save validated draft
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/10 bg-slate-900/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <ShieldCheck className="h-4 w-4 text-[#a6e22e]" />
                Guardrails
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-400">
              <p>Dataset fields and metrics are validated before save.</p>
              <p>Incompatible chart templates are blocked by the server.</p>
              <p>Validation history is stored for publish checks.</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-900/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <Palette className="h-4 w-4 text-[#f92672]" />
                Saved Drafts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {charts.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/10 p-4 text-xs text-slate-500">
                  No chart configs saved for this project yet.
                </div>
              ) : charts.slice(0, 8).map(chart => (
                <div key={chart.id} className="rounded-md border border-white/10 bg-slate-950/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{chart.name}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{chart.templateId} / {chart.status} / span {chart.layout.gridSpan}</p>
                    </div>
                    <Badge variant="outline" className={chart.validationState === 'valid' ? 'border-[#a6e22e]/30 text-[#d7ff8f]' : 'border-[#fd971f]/30 text-[#ffd866]'}>
                      {chart.validationState}
                    </Badge>
                  </div>
                  {chart.validationState === 'valid' ? (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-[#a6e22e]">
                      <CheckCircle2 className="h-3 w-3" />
                      Ready for publish validator
                    </div>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-[#a6e22e]/30 bg-transparent text-[#d7ff8f] hover:bg-[#a6e22e]/10"
                      onClick={() => void handleStatus(chart.id, 'published')}
                      disabled={updatingId === chart.id || chart.status === 'published'}
                    >
                      {updatingId === chart.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                      Publish
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-white/10 bg-transparent text-slate-300 hover:bg-white/10"
                      onClick={() => void handleStatus(chart.id, 'archived')}
                      disabled={updatingId === chart.id || chart.status === 'archived'}
                    >
                      <Archive className="mr-2 h-3.5 w-3.5" />
                      Archive
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
