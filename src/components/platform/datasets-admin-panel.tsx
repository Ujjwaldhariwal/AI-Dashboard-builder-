'use client'

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, BarChart3, CheckCircle2, Eye, GitBranch, Loader2, Play, Plus, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import { buildDeterministicDatasetProposal, type DatasetCopilotProposal } from '@/lib/ai/dataset-copilot'
import { demoDataset, demoDatasetPlan, demoEntities, demoMetrics, demoModel, demoProjects, demoRelationships, demoChartRows, DEMO_MODEL_ID, DEMO_PROJECT_ID, DEMO_TENANT_ID } from '@/lib/dashboardos/demo-data'
import { isDashboardOsDemoMode } from '@/lib/dashboardos/demo-mode'
import type { ChartCompatibilityResult, DatasetShape } from '@/types/chart-template'
import type { BusinessFieldRole, BusinessMetric, BusinessModel, BusinessRelationship } from '@/types/semantic-model'
import type { SemanticDataset } from '@/types/semantic-dataset'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
}

interface EntityWithFields {
  id: string
  name: string
  fields: Array<{
    id: string
    name: string
    role: BusinessFieldRole
  }>
}

interface DatasetPlan {
  dataset: {
    id: string
    name: string
    status: string
  }
  fields: Array<{ id: string; name: string; role: string }>
  metrics: Array<{ id: string; name: string; aggregation: string }>
  relationships: Array<{ id: string; type: string }>
  limits: {
    rowLimit: number
    timeoutMs: number
  }
  queryPlan?: {
    dialect: string
    select: Array<{ id: string; label: string; role: string }>
    joins: Array<{ id: string; type: string }>
    executableSql: string | null
    warnings?: string[]
  }
  warnings?: string[]
  dataSourceId?: string
  chartOptions?: {
    shape: DatasetShape
    compatibility: ChartCompatibilityResult[]
  }
}

interface DatasetRunResult {
  dataset: {
    id: string
    name: string
    status: string
  }
  rowCount: number
  elapsedMs: number
  fields: Array<{ name: string; dataTypeId: number }>
  rows: Array<Record<string, unknown>>
  warnings?: string[]
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

export function DatasetsAdminPanel() {
  const builderScope = useScopedBuilderStore(state => state.scope)
  const builderSemanticModelId = useScopedBuilderStore(state => state.semanticModelId)
  const setBuilderScope = useScopedBuilderStore(state => state.setScope)
  const setBuilderSemanticModelId = useScopedBuilderStore(state => state.setSemanticModelId)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [models, setModels] = useState<BusinessModel[]>([])
  const [datasets, setDatasets] = useState<SemanticDataset[]>([])
  const [entities, setEntities] = useState<EntityWithFields[]>([])
  const [metrics, setMetrics] = useState<BusinessMetric[]>([])
  const [relationships, setRelationships] = useState<BusinessRelationship[]>([])
  const [projectId, setProjectId] = useState('')
  const [modelId, setModelId] = useState('')
  const [name, setName] = useState('')
  const [fieldIds, setFieldIds] = useState<string[]>([])
  const [metricIds, setMetricIds] = useState<string[]>([])
  const [relationshipIds, setRelationshipIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null)
  const [plan, setPlan] = useState<DatasetPlan | null>(null)
  const [runResult, setRunResult] = useState<DatasetRunResult | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [datasetInstruction, setDatasetInstruction] = useState('Create a decision-ready dataset for the most important trends, comparisons, and filters.')
  const [proposalSource, setProposalSource] = useState<'ai' | 'deterministic' | null>(null)
  const [proposalWarnings, setProposalWarnings] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const demoMode = isDashboardOsDemoMode()

  const selectedProject = projects.find(project => project.id === projectId)
  const approvedModels = models.filter(model => model.status === 'approved')
  const fieldOptions = useMemo(() => entities.flatMap(entity => (
    entity.fields
      .filter(field => field.role !== 'hidden')
      .map(field => ({ ...field, entityName: entity.name }))
  )), [entities])
  const fetchProjects = useCallback(async () => {
    if (demoMode) {
      setProjects(demoProjects)
      setProjectId(DEMO_PROJECT_ID)
      if (!builderScope || builderScope.tenantId !== DEMO_TENANT_ID || builderScope.projectId !== DEMO_PROJECT_ID) {
        setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'charts')
      }
      return
    }
    const response = await fetch('/api/admin/projects', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload))
    const nextProjects = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
    setProjects(nextProjects)
    if (builderScope && nextProjects.some(project => project.id === builderScope.projectId)) {
      setProjectId(builderScope.projectId)
    }
  }, [builderScope, demoMode, setBuilderScope])

  const fetchProjectData = async (nextProjectId: string) => {
    if (!nextProjectId) return
    if (demoMode) {
      setModels([demoModel])
      setDatasets([demoDataset])
      setModelId(DEMO_MODEL_ID)
      setBuilderSemanticModelId(DEMO_MODEL_ID)
      return
    }
    const [modelsResponse, datasetsResponse] = await Promise.all([
      fetch(`/api/admin/semantic-models?projectId=${nextProjectId}`, { cache: 'no-store' }),
      fetch(`/api/admin/datasets?projectId=${nextProjectId}`, { cache: 'no-store' }),
    ])
    const modelsPayload = await modelsResponse.json().catch(() => null)
    const datasetsPayload = await datasetsResponse.json().catch(() => null)
    if (!modelsResponse.ok) throw new Error(errorToText(modelsPayload))
    if (!datasetsResponse.ok) throw new Error(errorToText(datasetsPayload))
    const nextModels = Array.isArray(modelsPayload?.models) ? modelsPayload.models as BusinessModel[] : []
    setModels(nextModels)
    setDatasets(Array.isArray(datasetsPayload?.datasets) ? datasetsPayload.datasets : [])
    setModelId(current => {
      if (nextModels.some(model => model.id === current && model.status === 'approved')) return current
      if (builderSemanticModelId && nextModels.some(model => model.id === builderSemanticModelId && model.status === 'approved')) {
        return builderSemanticModelId
      }
      return ''
    })
  }

  const fetchModelAssets = async (nextModelId: string) => {
    if (!nextModelId) {
      setEntities([])
      setMetrics([])
      setRelationships([])
      return
    }
    if (demoMode) {
      setEntities(demoEntities)
      setMetrics(demoMetrics)
      setRelationships(demoRelationships)
      setFieldIds(['demo-field-month', 'demo-field-region', 'demo-field-segment'])
      setMetricIds(['demo-metric-revenue', 'demo-metric-orders', 'demo-metric-customers'])
      setRelationshipIds([])
      return
    }
    const [fieldsResponse, metricsResponse, relationshipsResponse] = await Promise.all([
      fetch(`/api/admin/semantic-models/${nextModelId}/field-mappings`, { cache: 'no-store' }),
      fetch(`/api/admin/semantic-models/${nextModelId}/metrics`, { cache: 'no-store' }),
      fetch(`/api/admin/semantic-models/${nextModelId}/relationships`, { cache: 'no-store' }),
    ])
    const fieldsPayload = await fieldsResponse.json().catch(() => null)
    const metricsPayload = await metricsResponse.json().catch(() => null)
    const relationshipsPayload = await relationshipsResponse.json().catch(() => null)
    if (!fieldsResponse.ok) throw new Error(errorToText(fieldsPayload))
    if (!metricsResponse.ok) throw new Error(errorToText(metricsPayload))
    if (!relationshipsResponse.ok) throw new Error(errorToText(relationshipsPayload))
    setEntities(Array.isArray(fieldsPayload?.entities) ? fieldsPayload.entities : [])
    setMetrics(Array.isArray(metricsPayload?.metrics) ? metricsPayload.metrics : [])
    setRelationships(Array.isArray(relationshipsPayload?.relationships) ? relationshipsPayload.relationships : [])
    setFieldIds([])
    setMetricIds([])
    setRelationshipIds([])
  }

  useEffect(() => {
    setLoading(true)
    fetchProjects()
      .catch(error => toast.error(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false))
  }, [fetchProjects])

  useEffect(() => {
    void fetchProjectData(projectId).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
  }, [projectId])

  useEffect(() => {
    void fetchModelAssets(modelId).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
  }, [modelId])

  const toggle = (value: string, values: string[], setValues: (next: string[]) => void) => {
    setValues(values.includes(value) ? values.filter(item => item !== value) : [...values, value])
  }

  const handleGenerateProposal = async () => {
    if (!selectedProject || !modelId) {
      toast.error('Select an approved semantic model before generating a dataset')
      return
    }
    if (datasetInstruction.trim().length < 3) {
      toast.error('Describe the business outcome for this dataset')
      return
    }
    setGenerating(true)
    try {
      let proposal: DatasetCopilotProposal
      let source: 'ai' | 'deterministic'
      let warning: string | undefined
      if (demoMode) {
        proposal = buildDeterministicDatasetProposal({
          instruction: datasetInstruction,
          fields: fieldOptions.map(field => ({ ...field, entityId: entities.find(entity => entity.name === field.entityName)?.id ?? '' })),
          metrics: metrics.map(metric => ({ ...metric, entityId: metric.entityId ?? null })),
          relationships,
        })
        source = 'deterministic'
      } else {
        const response = await fetch(`/api/admin/semantic-models/${modelId}/dataset-proposal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: datasetInstruction }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.proposal) throw new Error(errorToText(payload) || `Dataset proposal failed (${response.status})`)
        proposal = payload.proposal as DatasetCopilotProposal
        source = payload.source === 'ai' ? 'ai' : 'deterministic'
        warning = typeof payload.warning === 'string' ? payload.warning : undefined
      }

      setName(proposal.name)
      setFieldIds(proposal.fieldIds)
      setMetricIds(proposal.metricIds)
      setRelationshipIds(proposal.relationshipIds)
      setProposalSource(source)
      setProposalWarnings(proposal.warnings)
      setAdvancedOpen(false)
      if (warning) toast.warning('AI provider was unavailable; generated a governed rules-based proposal instead.')
      else toast.success(`Proposed ${proposal.fieldIds.length} fields, ${proposal.metricIds.length} metrics, and ${proposal.relationshipIds.length} joins`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setGenerating(false)
    }
  }

  const handleCreate = async () => {
    if (!selectedProject || !modelId || !name.trim()) {
      toast.error('Select project, approved model, and dataset name')
      return
    }
    setSaving(true)
    try {
      if (demoMode) {
        const dataset: SemanticDataset = {
          ...demoDataset,
          id: `demo-dataset-${Date.now()}`,
          name: name.trim() || demoDataset.name,
          selection: { fieldIds, metricIds, relationshipIds },
          status: 'draft',
          updatedAt: new Date().toISOString(),
        }
        setDatasets(current => [dataset, ...current])
        setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'charts')
        setBuilderSemanticModelId(DEMO_MODEL_ID)
        toast.success('Demo dataset created')
        return
      }
      const response = await fetch('/api/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          modelId,
          name,
          description: `Generated for: ${datasetInstruction.trim()}`,
          fieldIds,
          metricIds,
          relationshipIds,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      if (payload?.dataset) setDatasets(current => [payload.dataset as SemanticDataset, ...current])
      setBuilderScope({ tenantId: selectedProject.tenantId, projectId: selectedProject.id }, 'charts')
      setBuilderSemanticModelId(modelId)
      setName('')
      setFieldIds([])
      setMetricIds([])
      setRelationshipIds([])
      setProposalSource(null)
      setProposalWarnings([])
      toast.success('Dataset created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const handleStatus = async (datasetId: string, status: SemanticDataset['status']) => {
    setSaving(true)
    try {
      if (demoMode) {
        setDatasets(current => current.map(dataset => dataset.id === datasetId ? { ...dataset, status } : dataset))
        toast.success(`Demo dataset ${status}`)
        return
      }
      const response = await fetch(`/api/admin/datasets/${datasetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      if (payload?.dataset) {
        const nextDataset = payload.dataset as SemanticDataset
        setDatasets(current => current.map(dataset => dataset.id === nextDataset.id ? nextDataset : dataset))
      }
      toast.success(`Dataset ${status}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const handlePreview = async (datasetId: string) => {
    setPreviewingId(datasetId)
    try {
      if (demoMode) {
        setPlan(demoDatasetPlan)
        setRunResult(null)
        toast.success('Demo dataset plan ready')
        return
      }
      const response = await fetch(`/api/admin/datasets/${datasetId}/plan`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setPlan(payload?.plan ?? null)
      setRunResult(null)
      toast.success('Dataset plan ready')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPreviewingId(null)
    }
  }

  const handleRun = async (datasetId: string) => {
    setRunningId(datasetId)
    try {
      if (demoMode) {
        setRunResult({
          dataset: { id: demoDataset.id, name: demoDataset.name, status: demoDataset.status },
          rowCount: demoChartRows.length,
          elapsedMs: 38,
          fields: [{ name: 'Month', dataTypeId: 1082 }, { name: 'Revenue', dataTypeId: 1700 }, { name: 'Orders', dataTypeId: 23 }, { name: 'Customers', dataTypeId: 23 }],
          rows: demoChartRows,
        })
        toast.success('Demo dataset preview executed')
        return
      }
      const response = await fetch(`/api/admin/datasets/${datasetId}/run`, { method: 'POST' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setRunResult(payload?.result ?? null)
      toast.success('Dataset preview executed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setRunningId(null)
    }
  }

  const handleDeleteDataset = async (dataset: SemanticDataset) => {
    if (!window.confirm(`Delete "${dataset.name}" and its chart configs from this project? This cannot be undone.`)) return

    setDeletingDatasetId(dataset.id)
    try {
      if (demoMode) {
        setDatasets(current => current.filter(item => item.id !== dataset.id))
        if (plan?.dataset.id === dataset.id) setPlan(null)
        if (runResult?.dataset.id === dataset.id) setRunResult(null)
        toast.success('Demo dataset deleted')
        return
      }

      const response = await fetch(`/api/admin/datasets/${dataset.id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))

      setDatasets(current => current.filter(item => item.id !== dataset.id))
      if (plan?.dataset.id === dataset.id) setPlan(null)
      if (runResult?.dataset.id === dataset.id) setRunResult(null)
      const deletedChartCount = typeof payload?.deletedChartCount === 'number' ? payload.deletedChartCount : 0
      toast.success(deletedChartCount > 0
        ? `Dataset deleted with ${deletedChartCount} chart config${deletedChartCount === 1 ? '' : 's'}`
        : 'Dataset deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setDeletingDatasetId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-[color:var(--dos-border-soft)] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs text-[var(--dos-accent-primary)]">Dataset registry</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--dos-text-primary)]">Governed dataset workbench</h2>
        </div>
        <div className="flex gap-5 text-xs text-[var(--dos-text-muted)]"><span><strong className="font-mono text-[var(--dos-text-primary)]">{datasets.length}</strong> datasets</span><span><strong className="font-mono text-[var(--dos-text-primary)]">{approvedModels.length}</strong> approved models</span></div>
      </section>

      <section className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] p-5 text-[var(--dos-text-primary)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Dataset Copilot</h3>
            {proposalSource ? <Badge variant="outline" className="mt-2 border-[color:var(--dos-accent-primary)] text-[var(--dos-accent-primary)]">{proposalSource === 'ai' ? 'AI proposal' : 'Rules fallback'}</Badge> : null}
          </div>
          <Button variant="outline" onClick={() => setAdvancedOpen(open => !open)} disabled={!modelId}>
            {advancedOpen ? 'Close field editor' : 'Edit fields'}
          </Button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="dataset-objective" className="text-xs text-[var(--dos-text-muted)]">Business request</Label>
            <Input
              id="dataset-objective"
              value={datasetInstruction}
              onChange={event => setDatasetInstruction(event.target.value)}
              placeholder="Example: compare monthly revenue by region and customer segment"
              disabled={generating}
            />
          </div>
          <Button className="self-end" onClick={() => void handleGenerateProposal()} disabled={generating || !modelId || datasetInstruction.trim().length < 3}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate proposal
          </Button>
        </div>
        {proposalSource ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[color:var(--dos-border-soft)] pt-4 text-xs text-[var(--dos-text-muted)]">
            <span><strong className="font-mono text-[var(--dos-text-primary)]">{fieldIds.length}</strong> fields</span>
            <span><strong className="font-mono text-[var(--dos-text-primary)]">{metricIds.length}</strong> metrics</span>
            <span><strong className="font-mono text-[var(--dos-text-primary)]">{relationshipIds.length}</strong> joins</span>
            {proposalWarnings.map(warning => <span key={warning} className="text-[var(--dos-warning-text)]">{warning}</span>)}
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className={advancedOpen ? 'border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)]' : 'border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)] opacity-90'}>
          <CardHeader>
            <CardTitle className="text-sm">{advancedOpen ? 'Field-level editor' : 'Review generated dataset'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={projectId}
                onValueChange={(value) => {
                  const selected = projects.find(project => project.id === value)
                  setProjectId(value)
                  setModelId('')
                  setProposalSource(null)
                  setProposalWarnings([])
                  if (selected) setBuilderScope({ tenantId: selected.tenantId, projectId: selected.id }, 'charts')
                }}
                disabled={loading || projects.length === 0}
              >
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>{project.tenantName ?? 'Tenant'} / {project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Approved model</Label>
              <Select
                value={modelId}
                onValueChange={(value) => {
                  setModelId(value)
                  setProposalSource(null)
                  setProposalWarnings([])
                  setBuilderSemanticModelId(value || null)
                }}
                disabled={approvedModels.length === 0}
              >
                <SelectTrigger><SelectValue placeholder="Select approved model" /></SelectTrigger>
                <SelectContent>
                  {approvedModels.map(model => (
                    <SelectItem key={model.id} value={model.id}>{model.name} v{model.version}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={event => setName(event.target.value)} placeholder="Business analysis dataset" />
            </div>
            <div className={advancedOpen ? 'space-y-2' : 'hidden'}>
              <Label>Fields</Label>
              <div className="grid max-h-40 gap-2 overflow-auto rounded-md border border-white/10 bg-slate-950/50 p-2">
                {fieldOptions.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-slate-500">Map fields in the semantic model first.</p>
                ) : fieldOptions.map(field => (
                  <button
                    key={field.id}
                    type="button"
                    className={[
                      'rounded-md px-3 py-2 text-left text-xs transition-colors',
                      fieldIds.includes(field.id) ? 'bg-cyan-400 text-slate-950' : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]',
                    ].join(' ')}
                    onClick={() => toggle(field.id, fieldIds, setFieldIds)}
                  >
                    {field.entityName} / {field.name}
                  </button>
                ))}
              </div>
            </div>
            <div className={advancedOpen ? 'space-y-2' : 'hidden'}>
              <Label>Metrics</Label>
              <div className="grid max-h-36 gap-2 overflow-auto rounded-md border border-white/10 bg-slate-950/50 p-2">
                {metrics.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-slate-500">Create metrics in the semantic model first.</p>
                ) : metrics.map(metric => (
                  <button
                    key={metric.id}
                    type="button"
                    className={[
                      'rounded-md px-3 py-2 text-left text-xs transition-colors',
                      metricIds.includes(metric.id) ? 'bg-cyan-400 text-slate-950' : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]',
                    ].join(' ')}
                    onClick={() => toggle(metric.id, metricIds, setMetricIds)}
                  >
                    {metric.name} · {metric.aggregation}
                  </button>
                ))}
              </div>
            </div>
            <div className={advancedOpen ? 'space-y-2' : 'hidden'}>
              <Label>Relationships</Label>
              <div className="grid max-h-32 gap-2 overflow-auto rounded-md border border-white/10 bg-slate-950/50 p-2">
                {relationships.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-slate-500">Relationships are optional for single-entity datasets.</p>
                ) : relationships.map(relationship => (
                  <button
                    key={relationship.id}
                    type="button"
                    className={[
                      'rounded-md px-3 py-2 text-left text-xs transition-colors',
                      relationshipIds.includes(relationship.id) ? 'bg-cyan-400 text-slate-950' : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]',
                    ].join(' ')}
                    onClick={() => toggle(relationship.id, relationshipIds, setRelationshipIds)}
                  >
                    <GitBranch className="mr-2 inline h-3.5 w-3.5" />
                    {relationship.type}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleCreate} disabled={saving || !modelId || !name.trim() || (fieldIds.length === 0 && metricIds.length === 0)}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create dataset draft
            </Button>
            {!advancedOpen ? (
              <div className="rounded-md border border-white/10 bg-slate-950/50 p-3 text-xs leading-5 text-slate-400">
                Current proposal: {fieldIds.length} fields, {metricIds.length} metrics, {relationshipIds.length} joins.
              </div>
            ) : null}
            {approvedModels.length === 0 ? (
              <div className="rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                Approve a semantic model before creating datasets.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm">Dataset registry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {datasets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/15 bg-slate-950/50 p-8 text-center text-sm text-slate-400">
                <BarChart3 className="mx-auto h-8 w-8 text-slate-500" />
                <p className="mt-3">No semantic datasets yet.</p>
              </div>
            ) : datasets.map(dataset => (
              <div key={dataset.id} className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{dataset.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {dataset.selection.fieldIds.length} fields · {dataset.selection.metricIds.length} metrics · {dataset.cachePolicy.ttlSeconds}s cache
                    </p>
                    {dataset.description ? (
                      <p className="mt-2 max-w-2xl text-[11px] leading-4 text-slate-500" data-testid="guided-dataset-lineage">
                        {dataset.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-white/15 text-slate-300">{dataset.status}</Badge>
                    <Button size="icon" variant="outline" title="Preview plan" onClick={() => void handlePreview(dataset.id)} disabled={previewingId === dataset.id}>
                      {previewingId === dataset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="outline" title="Run preview" onClick={() => void handleRun(dataset.id)} disabled={runningId === dataset.id}>
                      {runningId === dataset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="outline" title="Publish dataset" onClick={() => void handleStatus(dataset.id, 'published')} disabled={saving || dataset.status === 'published'}>
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" title="Archive dataset" onClick={() => void handleStatus(dataset.id, 'archived')} disabled={saving || dataset.status === 'archived'}>
                      <Archive className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      title="Delete dataset"
                      className="border-rose-300/20 bg-rose-500/10 text-rose-200 hover:border-rose-300/35 hover:bg-rose-500/15 hover:text-rose-100"
                      onClick={() => void handleDeleteDataset(dataset)}
                      disabled={deletingDatasetId === dataset.id}
                    >
                      {deletingDatasetId === dataset.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {plan ? (
              <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
                <h3 className="text-sm font-semibold text-cyan-100">Preview: {plan.dataset.name}</h3>
                <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
                  <div>{plan.fields.length} fields</div>
                  <div>{plan.metrics.length} metrics</div>
                  <div>{plan.relationships.length} joins</div>
                  <div>{plan.limits.rowLimit} rows / {plan.limits.timeoutMs}ms</div>
                </div>
                {plan.queryPlan ? (
                  <div className="mt-3 rounded-md bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                    {plan.queryPlan.dialect} plan / {plan.queryPlan.select.length} select items / {plan.queryPlan.executableSql ? 'SQL ready' : 'SQL blocked'}
                  </div>
                ) : null}
                {plan.chartOptions ? (
                  <div className="mt-3 rounded-md border border-fuchsia-300/20 bg-fuchsia-300/10 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-fuchsia-100">Shape: {plan.chartOptions.shape.kind}</span>
                      {plan.chartOptions.compatibility.filter(option => option.status === 'recommended').slice(0, 1).map(option => (
                        <Badge key={option.template.id} className="bg-[var(--dos-success-soft)] text-[var(--dos-success-text)] hover:bg-[var(--dos-success-soft)]">
                          Recommended: {option.template.name}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {plan.chartOptions.compatibility.filter(option => option.status !== 'blocked').slice(0, 5).map(option => (
                        <Badge key={option.template.id} variant="outline" className="border-white/15 text-slate-300">
                          {option.template.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {(plan.warnings?.length ?? 0) > 0 ? (
                  <div className="mt-3 space-y-1 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
                    {plan.warnings?.map(warning => <p key={warning}>{warning}</p>)}
                  </div>
                ) : null}
                {plan.queryPlan?.executableSql ? (
                  <pre className="mt-3 max-h-44 overflow-auto rounded-md bg-slate-950/70 p-3 text-xs text-cyan-100">
                    {plan.queryPlan.executableSql}
                  </pre>
                ) : null}
                <div className="mt-3 grid gap-2">
                  {[...plan.fields.map(field => `${field.name} (${field.role})`), ...plan.metrics.map(metric => `${metric.name} (${metric.aggregation})`)].slice(0, 6).map(item => (
                    <div key={item} className="rounded-md bg-slate-950/50 px-3 py-2 text-xs text-slate-300">{item}</div>
                  ))}
                </div>
              </div>
            ) : null}
            {runResult ? (
              <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                <h3 className="text-sm font-semibold text-emerald-100">
                  Run: {runResult.dataset.name} / {runResult.rowCount} rows / {runResult.elapsedMs}ms
                </h3>
                <div className="mt-3 max-h-64 overflow-auto rounded-md border border-white/10 bg-slate-950/60">
                  <table className="min-w-full text-left text-xs text-slate-300">
                    <thead className="sticky top-0 bg-slate-950 text-slate-400">
                      <tr>
                        {runResult.fields.map(field => (
                          <th key={field.name} className="px-3 py-2 font-medium">{field.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runResult.rows.slice(0, 25).map((row, index) => (
                        <tr key={index} className="border-t border-white/5">
                          {runResult.fields.map(field => (
                            <td key={field.name} className="max-w-52 truncate px-3 py-2">
                              {String(row[field.name] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 text-emerald-300" />
        Dataset execution will only use approved semantic selections and parameterized query plans.
      </div>
    </div>
  )
}
