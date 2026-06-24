'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Archive, BrainCircuit, CheckCircle2, Database, GitBranch, Loader2, Network, Plus, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DataSourceColumnMetadata } from '@/types/data-source'
import type { BusinessFieldRole, BusinessMetric, BusinessMetricAggregation, BusinessModel, BusinessModelStatus, BusinessRelationship, BusinessRelationshipType } from '@/types/semantic-model'

interface ProjectOption {
  id: string
  tenantId: string
  name: string
  tenantName?: string | null
  tenantSlug?: string | null
}

interface EntityWithFields {
  id: string
  name: string
  semanticKey: string
  type: string
  fields: Array<{
    id: string
    name: string
    role: BusinessFieldRole
    sourceColumn?: {
      schemaName?: string
      tableName: string
      columnName: string
      dataType?: string
    } | null
  }>
}

const FIELD_ROLES: BusinessFieldRole[] = ['identifier', 'dimension', 'metric_source', 'date', 'attribute', 'hidden']

function errorToText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
  }
  return 'Request failed'
}

function titleFromColumn(columnName: string) {
  return columnName
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

export function SemanticModelAdminPanel() {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [models, setModels] = useState<BusinessModel[]>([])
  const [columns, setColumns] = useState<DataSourceColumnMetadata[]>([])
  const [entities, setEntities] = useState<EntityWithFields[]>([])
  const [metrics, setMetrics] = useState<BusinessMetric[]>([])
  const [relationships, setRelationships] = useState<BusinessRelationship[]>([])
  const [loading, setLoading] = useState(true)
  const [mappingOpen, setMappingOpen] = useState(false)
  const [metricOpen, setMetricOpen] = useState(false)
  const [relationshipOpen, setRelationshipOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [modelId, setModelId] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState('')
  const [entityName, setEntityName] = useState('')
  const [fieldName, setFieldName] = useState('')
  const [fieldRole, setFieldRole] = useState<BusinessFieldRole>('attribute')
  const [metricName, setMetricName] = useState('')
  const [metricFieldId, setMetricFieldId] = useState('')
  const [metricAggregation, setMetricAggregation] = useState<BusinessMetricAggregation>('sum')
  const [fromFieldId, setFromFieldId] = useState('')
  const [toFieldId, setToFieldId] = useState('')
  const [relationshipType, setRelationshipType] = useState<BusinessRelationshipType>('many_to_one')

  const selectedProject = projects.find(project => project.id === projectId)
  const selectedModel = models.find(model => model.id === modelId)
  const selectedColumn = columns.find(column => column.id === selectedColumnId)

  const groupedColumns = useMemo(() => {
    const groups = new Map<string, DataSourceColumnMetadata[]>()
    for (const column of columns) {
      const key = `${column.schemaName}.${column.tableName}`
      groups.set(key, [...(groups.get(key) ?? []), column])
    }
    return Array.from(groups.entries())
  }, [columns])

  const metricFieldOptions = useMemo(() => entities.flatMap(entity => (
    entity.fields
      .filter(field => field.role !== 'hidden')
      .map(field => ({ ...field, entityId: entity.id, entityName: entity.name }))
  )), [entities])

  const fetchProjects = useCallback(async () => {
    const response = await fetch('/api/admin/projects', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload) || `Projects failed (${response.status})`)
    const nextProjects = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
    setProjects(nextProjects)
    if (!projectId && nextProjects[0]) setProjectId(nextProjects[0].id)
  }, [projectId])

  const fetchModels = async (nextProjectId: string) => {
    if (!nextProjectId) {
      setModels([])
      setModelId('')
      return
    }
    const response = await fetch(`/api/admin/semantic-models?projectId=${nextProjectId}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload) || `Models failed (${response.status})`)
    const nextModels = Array.isArray(payload?.models) ? payload.models as BusinessModel[] : []
    setModels(nextModels)
    setModelId(current => nextModels.some(model => model.id === current) ? current : nextModels[0]?.id ?? '')
  }

  const fetchColumns = async (nextProjectId: string) => {
    if (!nextProjectId) {
      setColumns([])
      return
    }
    const response = await fetch(`/api/admin/schema-columns?projectId=${nextProjectId}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload) || `Columns failed (${response.status})`)
    setColumns(Array.isArray(payload?.columns) ? payload.columns : [])
  }

  const fetchEntities = async (nextModelId: string) => {
    if (!nextModelId) {
      setEntities([])
      return
    }
    const response = await fetch(`/api/admin/semantic-models/${nextModelId}/field-mappings`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload) || `Mappings failed (${response.status})`)
    setEntities(Array.isArray(payload?.entities) ? payload.entities : [])
  }

  const fetchMetrics = async (nextModelId: string) => {
    if (!nextModelId) {
      setMetrics([])
      return
    }
    const response = await fetch(`/api/admin/semantic-models/${nextModelId}/metrics`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload) || `Metrics failed (${response.status})`)
    setMetrics(Array.isArray(payload?.metrics) ? payload.metrics : [])
  }

  const fetchRelationships = async (nextModelId: string) => {
    if (!nextModelId) {
      setRelationships([])
      return
    }
    const response = await fetch(`/api/admin/semantic-models/${nextModelId}/relationships`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload) || `Relationships failed (${response.status})`)
    setRelationships(Array.isArray(payload?.relationships) ? payload.relationships : [])
  }

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetchProjects()
      .catch(error => {
        if (mounted) toast.error(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [fetchProjects])

  useEffect(() => {
    if (!projectId) return
    void Promise.all([
      fetchModels(projectId),
      fetchColumns(projectId),
    ]).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
  }, [projectId])

  useEffect(() => {
    void Promise.all([
      fetchEntities(modelId),
      fetchMetrics(modelId),
      fetchRelationships(modelId),
    ]).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
  }, [modelId])

  const handleCreateModel = async () => {
    if (!selectedProject) {
      toast.error('Select a project first')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/admin/semantic-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedProject.tenantId,
          projectId: selectedProject.id,
          name: `${selectedProject.name} Business Model`,
          description: 'Draft semantic layer for approved dashboard datasets.',
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Create failed (${response.status})`)
      if (payload?.model) {
        setModels(current => [payload.model as BusinessModel, ...current])
        setModelId((payload.model as BusinessModel).id)
      }
      toast.success('Business model created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const handleModelStatus = async (status: BusinessModelStatus) => {
    if (!selectedModel) {
      toast.error('Select a business model first')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Status update failed (${response.status})`)
      if (payload?.model) {
        const nextModel = payload.model as BusinessModel
        setModels(current => current.map(model => model.id === nextModel.id ? nextModel : model))
      }
      toast.success(`Model moved to ${status}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const openMapping = (column: DataSourceColumnMetadata) => {
    setSelectedColumnId(column.id)
    setEntityName(titleFromColumn(column.tableName))
    setFieldName(titleFromColumn(column.columnName))
    setFieldRole(column.columnName.toLowerCase().includes('id') ? 'identifier' : 'attribute')
    setMappingOpen(true)
  }

  const handleSaveMapping = async () => {
    if (!selectedModel || !selectedColumn || !entityName.trim() || !fieldName.trim()) {
      toast.error('Select a model, column, entity, and field')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}/field-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityName,
          entityType: 'dimension',
          fieldName,
          role: fieldRole,
          dataSourceId: selectedColumn.dataSourceId,
          schemaName: selectedColumn.schemaName,
          tableName: selectedColumn.tableName,
          columnName: selectedColumn.columnName,
          dataType: selectedColumn.dataType,
          isFilterable: fieldRole === 'identifier' || fieldRole === 'dimension' || fieldRole === 'date',
          isTooltipField: fieldRole !== 'hidden',
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Mapping failed (${response.status})`)
      await fetchEntities(selectedModel.id)
      toast.success('Field mapped')
      setMappingOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const openMetric = () => {
    const firstField = metricFieldOptions[0]
    setMetricFieldId(firstField?.id ?? '')
    setMetricName(firstField ? `${firstField.name} Total` : '')
    setMetricAggregation('sum')
    setMetricOpen(true)
  }

  const handleSaveMetric = async () => {
    if (!selectedModel || !metricFieldId || !metricName.trim()) {
      toast.error('Select a model, mapped field, and metric name')
      return
    }
    const field = metricFieldOptions.find(option => option.id === metricFieldId)
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: field?.entityId,
          fieldId: metricFieldId,
          name: metricName,
          aggregation: metricAggregation,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Metric failed (${response.status})`)
      await fetchMetrics(selectedModel.id)
      toast.success('Metric created')
      setMetricOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const openRelationship = () => {
    setFromFieldId(metricFieldOptions[0]?.id ?? '')
    setToFieldId(metricFieldOptions[1]?.id ?? '')
    setRelationshipType('many_to_one')
    setRelationshipOpen(true)
  }

  const handleSaveRelationship = async () => {
    if (!selectedModel || !fromFieldId || !toFieldId || fromFieldId === toFieldId) {
      toast.error('Select two different mapped fields')
      return
    }
    const fromField = metricFieldOptions.find(option => option.id === fromFieldId)
    const toField = metricFieldOptions.find(option => option.id === toFieldId)
    if (!fromField || !toField) return
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromEntityId: fromField.entityId,
          toEntityId: toField.entityId,
          fromFieldId,
          toFieldId,
          type: relationshipType,
          description: `${fromField.entityName}.${fromField.name} to ${toField.entityName}.${toField.name}`,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Relationship failed (${response.status})`)
      await fetchRelationships(selectedModel.id)
      toast.success('Relationship created')
      setRelationshipOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <Badge className="bg-cyan-400 text-slate-950 hover:bg-cyan-400">Sprint 4</Badge>
        <h2 className="mt-4 max-w-4xl text-2xl font-semibold tracking-tight text-white">
          Semantic Business Model
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
          Map scanned database columns into approved business language before datasets, widgets, reports, or AI touch them.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          { title: 'Raw schema', icon: Database, value: `${columns.length} columns scanned` },
          { title: 'Business entities', icon: Network, value: `${entities.length} entities, ${relationships.length} relationships` },
          { title: 'Mapped fields', icon: BrainCircuit, value: `${entities.reduce((total, entity) => total + entity.fields.length, 0)} fields, ${metrics.length} metrics` },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.title} className="border-white/10 bg-white/[0.03] text-slate-100">
              <CardContent className="p-5">
                <Icon className="h-5 w-5 text-cyan-300" />
                <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
                <p className="mt-2 text-xs text-slate-500">{item.value}</p>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">Project and model</CardTitle>
                {selectedModel ? <Badge variant="outline" className="border-white/15 text-slate-300">{selectedModel.status}</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={openMetric} disabled={saving || !selectedModel || metricFieldOptions.length === 0}>
                  <BrainCircuit className="mr-2 h-4 w-4" />
                  New Metric
                </Button>
                <Button size="sm" variant="outline" onClick={openRelationship} disabled={saving || !selectedModel || metricFieldOptions.length < 2}>
                  <GitBranch className="mr-2 h-4 w-4" />
                  New Join
                </Button>
                <Button size="icon" variant="outline" title="Submit for review" onClick={() => void handleModelStatus('review')} disabled={saving || !selectedModel || selectedModel.status === 'review'}>
                  <Send className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" title="Approve model" onClick={() => void handleModelStatus('approved')} disabled={saving || !selectedModel || selectedModel.status === 'approved'}>
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" title="Archive model" onClick={() => void handleModelStatus('archived')} disabled={saving || !selectedModel || selectedModel.status === 'archived'}>
                  <Archive className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={handleCreateModel} disabled={saving || !selectedProject}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  New Model
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={projectId} onValueChange={setProjectId} disabled={loading || projects.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.tenantName ?? project.tenantSlug ?? 'Tenant'} / {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={modelId} onValueChange={setModelId} disabled={models.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name} v{model.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {models.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/15 bg-slate-950/50 p-6 text-sm text-slate-400">
                Create a draft business model before mapping schema columns.
              </div>
            ) : entities.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/15 bg-slate-950/50 p-6 text-sm text-slate-400">
                No fields mapped yet. Start from a scanned column on the right.
              </div>
            ) : (
              <>
                {metrics.length > 0 ? (
                  <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
                    <h3 className="text-sm font-semibold text-cyan-100">Metrics</h3>
                    <div className="mt-3 grid gap-2">
                      {metrics.map(metric => (
                        <div key={metric.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                          <span className="font-medium">{metric.name}</span>
                          <span>{metric.aggregation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {relationships.length > 0 ? (
                  <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                    <h3 className="text-sm font-semibold text-emerald-100">Relationships</h3>
                    <div className="mt-3 grid gap-2">
                      {relationships.map(relationship => (
                        <div key={relationship.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                          <span>{relationship.type}</span>
                          <span>{relationship.description ?? 'structured join'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {entities.map(entity => (
                  <div key={entity.id} className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">{entity.name}</h3>
                      <Badge variant="outline" className="border-white/15 text-slate-300">{entity.type}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {entity.fields.map(field => (
                        <div key={field.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                          <span className="font-medium text-slate-200">{field.name}</span>
                          <span>{field.role}</span>
                          <span>{field.sourceColumn?.tableName}.{field.sourceColumn?.columnName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm">Scanned schema columns</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[620px] space-y-4 overflow-auto">
            {columns.length === 0 ? (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                <div className="flex gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Run schema introspection from Data Sources before mapping fields.</span>
                </div>
              </div>
            ) : (
              groupedColumns.map(([tableName, tableColumns]) => (
                <div key={tableName} className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
                  <h3 className="text-sm font-semibold">{tableName}</h3>
                  <div className="mt-3 grid gap-2">
                    {tableColumns.map(column => (
                      <button
                        key={column.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md bg-white/[0.03] px-3 py-2 text-left text-xs text-slate-400 hover:bg-white/[0.07]"
                        onClick={() => openMapping(column)}
                        disabled={!selectedModel}
                      >
                        <span className="font-medium text-slate-200">{column.columnName}</span>
                        <span>{column.dataType}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={mappingOpen} onOpenChange={setMappingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Map business field</DialogTitle>
            <DialogDescription>
              Convert the raw column into a governed field clients and datasets can understand.
            </DialogDescription>
          </DialogHeader>
          {selectedColumn ? (
            <div className="rounded-md border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-400">
              {selectedColumn.schemaName}.{selectedColumn.tableName}.{selectedColumn.columnName} · {selectedColumn.dataType}
            </div>
          ) : null}
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Entity</Label>
              <Input value={entityName} onChange={event => setEntityName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Field</Label>
              <Input value={fieldName} onChange={event => setFieldName(event.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Role</Label>
              <Select value={fieldRole} onValueChange={value => setFieldRole(value as BusinessFieldRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_ROLES.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setMappingOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMapping} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save mapping
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={metricOpen} onOpenChange={setMetricOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create metric</DialogTitle>
            <DialogDescription>
              Metrics are governed aggregations over mapped business fields.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={metricName} onChange={event => setMetricName(event.target.value)} placeholder="Revenue" />
            </div>
            <div className="space-y-2">
              <Label>Source field</Label>
              <Select value={metricFieldId} onValueChange={setMetricFieldId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mapped field" />
                </SelectTrigger>
                <SelectContent>
                  {metricFieldOptions.map(field => (
                    <SelectItem key={field.id} value={field.id}>{field.entityName} / {field.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Aggregation</Label>
              <Select value={metricAggregation} onValueChange={value => setMetricAggregation(value as BusinessMetricAggregation)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['sum', 'avg', 'min', 'max', 'count', 'count_distinct'].map(value => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setMetricOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMetric} disabled={saving || !metricFieldId || !metricName.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
              Save metric
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={relationshipOpen} onOpenChange={setRelationshipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create relationship</DialogTitle>
            <DialogDescription>
              Relationships describe governed joins between mapped business fields.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 pt-2">
            <div className="space-y-2">
              <Label>From field</Label>
              <Select value={fromFieldId} onValueChange={setFromFieldId}>
                <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                <SelectContent>
                  {metricFieldOptions.map(field => (
                    <SelectItem key={field.id} value={field.id}>{field.entityName} / {field.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To field</Label>
              <Select value={toFieldId} onValueChange={setToFieldId}>
                <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                <SelectContent>
                  {metricFieldOptions.map(field => (
                    <SelectItem key={field.id} value={field.id}>{field.entityName} / {field.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={relationshipType} onValueChange={value => setRelationshipType(value as BusinessRelationshipType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'].map(value => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setRelationshipOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRelationship} disabled={saving || !fromFieldId || !toFieldId || fromFieldId === toFieldId}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
              Save relationship
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
