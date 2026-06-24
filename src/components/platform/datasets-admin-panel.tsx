'use client'

import { useCallback, useEffect, useState } from 'react'
import { Archive, BarChart3, CheckCircle2, Loader2, Plus, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BusinessModel } from '@/types/semantic-model'
import type { SemanticDataset } from '@/types/semantic-dataset'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
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
  const [projectId, setProjectId] = useState('')
  const [modelId, setModelId] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const selectedProject = projects.find(project => project.id === projectId)
  const approvedModels = models.filter(model => model.status === 'approved')

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

  useEffect(() => {
    setLoading(true)
    fetchProjects()
      .catch(error => toast.error(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false))
  }, [fetchProjects])

  useEffect(() => {
    void fetchProjectData(projectId).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
  }, [projectId])

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
          fieldIds: [],
          metricIds: [],
          relationshipIds: [],
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      if (payload?.dataset) setDatasets(current => [payload.dataset as SemanticDataset, ...current])
      setName('')
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
            <Button onClick={handleCreate} disabled={saving || !modelId || !name.trim()}>
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
