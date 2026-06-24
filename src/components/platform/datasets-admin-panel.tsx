'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, BarChart3, CheckCircle2, Eye, GitBranch, Loader2, Plus, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  const [plan, setPlan] = useState<DatasetPlan | null>(null)

  const selectedProject = projects.find(project => project.id === projectId)
  const approvedModels = models.filter(model => model.status === 'approved')
  const fieldOptions = useMemo(() => entities.flatMap(entity => (
    entity.fields
      .filter(field => field.role !== 'hidden')
      .map(field => ({ ...field, entityName: entity.name }))
  )), [entities])

  const fetchProjects = useCallback(async () => {
    const response = await fetch('/api/admin/projects', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload))
    const nextProjects = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
    setProjects(nextProjects)
    if (!projectId && nextProjects[0]) setProjectId(nextProjects[0].id)
  }, [projectId])

  const fetchProjectData = async (nextProjectId: string) => {
    if (!nextProjectId) return
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
    setModelId(current => nextModels.some(model => model.id === current && model.status === 'approved') ? current : nextModels.find(model => model.status === 'approved')?.id ?? '')
  }

  const fetchModelAssets = async (nextModelId: string) => {
    if (!nextModelId) {
      setEntities([])
      setMetrics([])
      setRelationships([])
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

  const handleCreate = async () => {
    if (!selectedProject || !modelId || !name.trim()) {
      toast.error('Select project, approved model, and dataset name')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          modelId,
          name,
          fieldIds,
          metricIds,
          relationshipIds,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      if (payload?.dataset) setDatasets(current => [payload.dataset as SemanticDataset, ...current])
      setName('')
      setFieldIds([])
      setMetricIds([])
      setRelationshipIds([])
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
      const response = await fetch(`/api/admin/datasets/${datasetId}/plan`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setPlan(payload?.plan ?? null)
      toast.success('Dataset plan ready')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPreviewingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <Badge className="bg-cyan-400 text-slate-950 hover:bg-cyan-400">Sprint 5</Badge>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">Semantic Datasets</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Datasets bind approved business models into reusable chart contracts before any query compiler or widget touches them.
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm">Create dataset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={loading || projects.length === 0}>
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
              <Select value={modelId} onValueChange={setModelId} disabled={approvedModels.length === 0}>
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
              <Input value={name} onChange={event => setName(event.target.value)} placeholder="Executive Revenue Dataset" />
            </div>
            <div className="space-y-2">
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
            <div className="space-y-2">
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
            <div className="space-y-2">
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
              Create dataset
            </Button>
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
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-white/15 text-slate-300">{dataset.status}</Badge>
                    <Button size="icon" variant="outline" title="Preview plan" onClick={() => void handlePreview(dataset.id)} disabled={previewingId === dataset.id}>
                      {previewingId === dataset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="outline" title="Publish dataset" onClick={() => void handleStatus(dataset.id, 'published')} disabled={saving || dataset.status === 'published'}>
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" title="Archive dataset" onClick={() => void handleStatus(dataset.id, 'archived')} disabled={saving || dataset.status === 'archived'}>
                      <Archive className="h-4 w-4" />
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
                <div className="mt-3 grid gap-2">
                  {[...plan.fields.map(field => `${field.name} (${field.role})`), ...plan.metrics.map(metric => `${metric.name} (${metric.aggregation})`)].slice(0, 6).map(item => (
                    <div key={item} className="rounded-md bg-slate-950/50 px-3 py-2 text-xs text-slate-300">{item}</div>
                  ))}
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
