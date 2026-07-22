'use client'

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Archive, BrainCircuit, CheckCircle2, Database, GitBranch, Loader2, Network, Plus, Send, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import { buildDeterministicSemanticProposal, type SemanticCopilotProposal } from '@/lib/ai/semantic-copilot'
import { readPlatformAssistantIntent } from '@/lib/ai/platform-assistant-contract'
import { demoColumns, demoEntities, demoMetrics, demoModel, demoProjects, demoRelationships, DEMO_MODEL_ID, DEMO_PROJECT_ID, DEMO_TENANT_ID } from '@/lib/dashboardos/demo-data'
import { isDashboardOsDemoMode } from '@/lib/dashboardos/demo-mode'
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

interface MappingSuggestion {
  id: string
  column: DataSourceColumnMetadata
  entityName: string
  entityType: 'fact' | 'dimension' | 'event' | 'snapshot'
  fieldName: string
  role: BusinessFieldRole
  confidence: number
  reason: string
  metricName?: string
  aggregation?: BusinessMetricAggregation
}

type RelationshipSuggestion = SemanticCopilotProposal['relationships'][number]

const FIELD_ROLES: BusinessFieldRole[] = ['identifier', 'dimension', 'metric_source', 'date', 'attribute', 'hidden']
const CONTROL_CLASS = 'border-white/10 bg-slate-950/70 text-slate-100 placeholder:text-slate-500 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-900/70 disabled:text-slate-400 disabled:opacity-100'
const SELECT_TRIGGER_CLASS = `${CONTROL_CLASS} [&>span]:truncate [&>span]:text-slate-100 [&>span[data-placeholder]]:text-slate-500`
const OUTLINE_BUTTON_CLASS = '!border-white/10 !bg-slate-950/70 !text-slate-200 hover:!border-white/20 hover:!bg-slate-900 hover:!text-white [&_svg]:!text-current'
const DISABLED_BUTTON_CLASS = `${OUTLINE_BUTTON_CLASS} disabled:!border-white/10 disabled:!bg-slate-950/60 disabled:!text-slate-600 disabled:!opacity-100`
const SUGGESTION_BUTTON_CLASS = '!border-[color:var(--dos-accent-primary)] !bg-[var(--dos-accent-primary-soft)] !text-[var(--dos-accent-primary)] hover:!bg-[var(--dos-accent-primary-soft)] disabled:!border-[color:var(--dos-border-soft)] disabled:!bg-[var(--dos-background-deep)] disabled:!text-[var(--dos-text-muted)] disabled:!opacity-100 [&_svg]:!text-current'

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

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

function isNumericType(dataType: string) {
  return /int|numeric|decimal|double|real|money|float|bigint|smallint/i.test(dataType)
}

function isDateType(dataType: string) {
  return /date|time/i.test(dataType)
}

function inferRole(column: DataSourceColumnMetadata): BusinessFieldRole {
  const name = normalizeToken(column.columnName)
  if (isDateType(column.dataType) || name.endsWith('_date') || name.includes('created_at') || name.includes('month')) return 'date'
  if (name === 'id' || name.endsWith('_id') || name.includes('uuid')) return 'identifier'
  if (isNumericType(column.dataType) && /(revenue|sales|amount|total|count|quantity|price|cost|profit|margin|duration|score|usage|units|rate|balance)/i.test(name)) return 'metric_source'
  if (/(name|type|status|segment|region|category|country|city|channel|provider|priority|plan|tier|connection)/i.test(name)) return 'dimension'
  if (/(password|secret|token|payload|metadata|raw|hash)/i.test(name)) return 'hidden'
  return isNumericType(column.dataType) ? 'metric_source' : 'attribute'
}

function inferEntityType(columns: DataSourceColumnMetadata[]): MappingSuggestion['entityType'] {
  const joined = columns.map(column => `${column.tableName}_${column.columnName}`).join(' ').toLowerCase()
  const metricCount = columns.filter(column => inferRole(column) === 'metric_source').length
  if (/(event|events|log|logs|orders|payments|items|tickets|usage)/.test(joined)) return 'event'
  if (metricCount >= 2 || /(fact|revenue|sales|summary|transaction|aggregate)/.test(joined)) return 'fact'
  return 'dimension'
}

function inferMetricName(columnName: string) {
  return titleFromColumn(columnName)
    .replace(/\bCount\b/g, 'Count')
    .replace(/\bAmount\b/g, 'Amount')
}

export function SemanticModelAdminPanel() {
  const builderScope = useScopedBuilderStore(state => state.scope)
  const builderDataSourceId = useScopedBuilderStore(state => state.dataSourceIds[0] ?? null)
  const setBuilderScope = useScopedBuilderStore(state => state.setScope)
  const setBuilderSemanticModelId = useScopedBuilderStore(state => state.setSemanticModelId)
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
  const [entityType, setEntityType] = useState<MappingSuggestion['entityType']>('dimension')
  const [metricName, setMetricName] = useState('')
  const [metricFieldId, setMetricFieldId] = useState('')
  const [metricAggregation, setMetricAggregation] = useState<BusinessMetricAggregation>('sum')
  const [fromFieldId, setFromFieldId] = useState('')
  const [toFieldId, setToFieldId] = useState('')
  const [relationshipType, setRelationshipType] = useState<BusinessRelationshipType>('many_to_one')
  const [columnSearch, setColumnSearch] = useState('')
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([])
  const [relationshipSuggestions, setRelationshipSuggestions] = useState<RelationshipSuggestion[]>([])
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set())
  const [semanticInstruction, setSemanticInstruction] = useState('Create a reusable business model for dashboards and operational analysis.')
  const [proposalSource, setProposalSource] = useState<'ai' | 'deterministic' | null>(null)
  const [schemaScannedAt, setSchemaScannedAt] = useState<Date | null>(null)
  const demoMode = isDashboardOsDemoMode()

  useEffect(() => {
    const intent = readPlatformAssistantIntent('semantic_model')
    if (intent?.instruction) setSemanticInstruction(intent.instruction)
  }, [])

  const selectedProject = projects.find(project => project.id === projectId)
  const selectedModel = models.find(model => model.id === modelId)
  const selectedColumn = columns.find(column => column.id === selectedColumnId)
  const visibleColumns = useMemo(() => {
    const search = columnSearch.trim().toLowerCase()
    if (!search) return columns
    return columns.filter(column => (
      column.schemaName.toLowerCase().includes(search)
      || column.tableName.toLowerCase().includes(search)
      || column.columnName.toLowerCase().includes(search)
      || column.dataType.toLowerCase().includes(search)
    ))
  }, [columnSearch, columns])

  const groupedColumns = useMemo(() => {
    const groups = new Map<string, DataSourceColumnMetadata[]>()
    for (const column of visibleColumns) {
      const key = `${column.schemaName}.${column.tableName}`
      groups.set(key, [...(groups.get(key) ?? []), column])
    }
    return Array.from(groups.entries())
  }, [visibleColumns])

  const mappedSourceKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const entity of entities) {
      for (const field of entity.fields) {
        const source = field.sourceColumn
        if (source?.schemaName && source.tableName && source.columnName) {
          keys.add(`${source.schemaName}.${source.tableName}.${source.columnName}`)
        }
      }
    }
    return keys
  }, [entities])

  const selectedSuggestions = useMemo(
    () => suggestions.filter(suggestion => selectedSuggestionIds.has(suggestion.id)),
    [selectedSuggestionIds, suggestions],
  )

  const schemaFreshnessWarning = useMemo(() => {
    if (columns.length === 0) return false
    if (!schemaScannedAt) return true
    return Date.now() - schemaScannedAt.getTime() > 24 * 60 * 60 * 1000
  }, [columns.length, schemaScannedAt])

  const metricFieldOptions = useMemo(() => entities.flatMap(entity => (
    entity.fields
      .filter(field => field.role !== 'hidden')
      .map(field => ({ ...field, entityId: entity.id, entityName: entity.name }))
  )), [entities])

  const fetchProjects = useCallback(async () => {
    if (demoMode) {
      setProjects(demoProjects)
      setProjectId(DEMO_PROJECT_ID)
      if (!builderScope || builderScope.tenantId !== DEMO_TENANT_ID || builderScope.projectId !== DEMO_PROJECT_ID) {
        setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'semantic_model')
      }
      return
    }
    const response = await fetch('/api/admin/projects', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload) || `Projects failed (${response.status})`)
    const nextProjects = Array.isArray(payload?.projects) ? payload.projects as ProjectOption[] : []
    setProjects(nextProjects)
    if (builderScope && nextProjects.some(project => project.id === builderScope.projectId)) {
      setProjectId(builderScope.projectId)
    }
  }, [builderScope, demoMode, setBuilderScope])

  const fetchModels = async (nextProjectId: string) => {
    if (!nextProjectId) {
      setModels([])
      setModelId('')
      return
    }
    if (demoMode) {
      setModels([demoModel])
      setModelId(DEMO_MODEL_ID)
      setBuilderSemanticModelId(DEMO_MODEL_ID)
      return
    }
    const response = await fetch(`/api/admin/semantic-models?projectId=${nextProjectId}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload) || `Models failed (${response.status})`)
    const nextModels = Array.isArray(payload?.models) ? payload.models as BusinessModel[] : []
    setModels(nextModels)
    setModelId(current => nextModels.some(model => model.id === current) ? current : nextModels[0]?.id ?? '')
  }

  const fetchColumns = async (nextProjectId: string, nextDataSourceId = builderDataSourceId) => {
    if (!nextProjectId) {
      setColumns([])
      setSchemaScannedAt(null)
      return
    }
    if (demoMode) {
      setColumns(demoColumns)
      setSchemaScannedAt(new Date())
      return
    }
    const params = new URLSearchParams({ projectId: nextProjectId, scope: 'selected' })
    if (nextDataSourceId) params.set('dataSourceId', nextDataSourceId)
    const response = await fetch(`/api/admin/schema-columns?${params.toString()}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload) || `Columns failed (${response.status})`)
    setColumns(Array.isArray(payload?.columns) ? payload.columns : [])
    setSchemaScannedAt(typeof payload?.scannedAt === 'string' ? new Date(payload.scannedAt) : null)
  }

  const fetchEntities = async (nextModelId: string) => {
    if (!nextModelId) {
      setEntities([])
      return
    }
    if (demoMode) {
      setEntities(demoEntities)
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
    if (demoMode) {
      setMetrics(demoMetrics)
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
    if (demoMode) {
      setRelationships(demoRelationships)
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
      fetchColumns(projectId, builderDataSourceId),
    ]).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
  }, [builderDataSourceId, projectId])

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
      if (demoMode) {
        setModels([demoModel])
        setModelId(DEMO_MODEL_ID)
        setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'semantic_model')
        setBuilderSemanticModelId(DEMO_MODEL_ID)
        toast.success('Demo business model ready')
        return
      }
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
        const model = payload.model as BusinessModel
        setModels(current => [model, ...current])
        setModelId(model.id)
        setBuilderScope({ tenantId: model.tenantId, projectId: model.projectId }, 'semantic_model')
        setBuilderSemanticModelId(model.id)
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
      if (demoMode) {
        const nextModel = { ...demoModel, status, approvedAt: status === 'approved' ? new Date().toISOString() : demoModel.approvedAt }
        setModels([nextModel])
        if (status === 'approved') {
          setBuilderScope({ tenantId: DEMO_TENANT_ID, projectId: DEMO_PROJECT_ID }, 'charts')
          setBuilderSemanticModelId(DEMO_MODEL_ID)
        }
        toast.success(`Demo model moved to ${status}`)
        return
      }
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
        if (nextModel.status === 'approved') {
          setBuilderScope({ tenantId: nextModel.tenantId, projectId: nextModel.projectId }, 'charts')
          setBuilderSemanticModelId(nextModel.id)
        }
      }
      toast.success(`Model moved to ${status}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const openMapping = (column: DataSourceColumnMetadata) => {
    const tableColumns = columns.filter(candidate => (
      candidate.dataSourceId === column.dataSourceId
      && candidate.schemaName === column.schemaName
      && candidate.tableName === column.tableName
    ))
    setSelectedColumnId(column.id)
    setEntityName(titleFromColumn(column.tableName))
    setFieldName(titleFromColumn(column.columnName))
    setFieldRole(inferRole(column))
    setEntityType(inferEntityType(tableColumns.length > 0 ? tableColumns : [column]))
    setMappingOpen(true)
  }

  const handleSaveMapping = async () => {
    if (!selectedModel || !selectedColumn || !entityName.trim() || !fieldName.trim()) {
      toast.error('Select a model, column, entity, and field')
      return
    }
    setSaving(true)
    try {
      if (demoMode) {
        setEntities(demoEntities)
        toast.success('Demo field mapped')
        setMappingOpen(false)
        return
      }
      const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}/field-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityName,
          entityType,
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

  const handleDeleteField = async (fieldId: string) => {
    if (!selectedModel) return
    if (!window.confirm('Remove this field mapping?')) return

    setSaving(true)
    try {
      const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}/field-mappings/${fieldId}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload) || `Delete failed (${response.status})`)
      await Promise.all([fetchEntities(selectedModel.id), fetchMetrics(selectedModel.id)])
      toast.success('Field mapping removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const buildSuggestions = async () => {
    if (!selectedModel) {
      toast.error('Create or select a business model first')
      return
    }
    if (columns.length === 0) {
      toast.error('Confirm the datasource table selection before generating a semantic proposal')
      return
    }

    setSaving(true)
    try {
      let proposal: SemanticCopilotProposal
      let source: 'ai' | 'deterministic'
      let warning: string | undefined
      if (demoMode) {
        proposal = buildDeterministicSemanticProposal(columns, semanticInstruction)
        source = 'deterministic'
      } else {
        const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}/ai-proposal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instruction: semanticInstruction,
            ...(builderDataSourceId ? { dataSourceId: builderDataSourceId } : {}),
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.proposal) throw new Error(errorToText(payload) || `Semantic proposal failed (${response.status})`)
        proposal = payload.proposal as SemanticCopilotProposal
        source = payload.source === 'ai' ? 'ai' : 'deterministic'
        warning = typeof payload.warning === 'string' ? payload.warning : undefined
      }

      const columnById = new Map(columns.map(column => [column.id, column]))
      const nextSuggestions = proposal.mappings.flatMap(mapping => {
        const column = columnById.get(mapping.columnId)
        if (!column || mapping.role === 'hidden') return []
        const sourceKey = `${column.schemaName}.${column.tableName}.${column.columnName}`
        if (mappedSourceKeys.has(sourceKey)) return []
        return [{
          id: `${mapping.columnId}:${mapping.role}`,
          column,
          entityName: mapping.entityName,
          entityType: mapping.entityType,
          fieldName: mapping.fieldName,
          role: mapping.role,
          confidence: Math.round(mapping.confidence * 100),
          reason: mapping.reason,
          metricName: mapping.metric?.name,
          aggregation: mapping.metric?.aggregation,
        } satisfies MappingSuggestion]
      })

      setSuggestions(nextSuggestions)
      setRelationshipSuggestions(proposal.relationships)
      setSelectedSuggestionIds(new Set(nextSuggestions.map(suggestion => suggestion.id)))
      setProposalSource(source)
      setColumnSearch('')
      if (warning) toast.warning('AI provider was unavailable; generated a deterministic schema proposal instead.')
      else toast.success(`Generated ${nextSuggestions.length} mappings and ${proposal.relationships.length} join proposals`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const toggleSuggestion = (id: string) => {
    setSelectedSuggestionIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleApplySuggestions = async () => {
    if (!selectedModel || selectedSuggestions.length === 0) {
      toast.error('Select suggestions to apply')
      return
    }

    setSaving(true)
    try {
      const mappingResults = await Promise.all(selectedSuggestions.map(async (suggestion) => {
        const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}/field-mappings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityName: suggestion.entityName,
            entityType: suggestion.entityType,
            fieldName: suggestion.fieldName,
            role: suggestion.role,
            dataSourceId: suggestion.column.dataSourceId,
            schemaName: suggestion.column.schemaName,
            tableName: suggestion.column.tableName,
            columnName: suggestion.column.columnName,
            dataType: suggestion.column.dataType,
            isFilterable: suggestion.role === 'identifier' || suggestion.role === 'dimension' || suggestion.role === 'date',
            isTooltipField: suggestion.role !== 'hidden',
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(errorToText(payload) || `Suggestion apply failed (${response.status})`)
        return { suggestion, payload }
      }))

      const createdMetricSources: Array<{ suggestion: MappingSuggestion, entityId?: string, fieldId: string }> = []
      const materializedFields = new Map<string, { entityId: string, fieldId: string }>()
      for (const entity of entities) {
        for (const field of entity.fields) {
          const source = field.sourceColumn
          const column = source ? columns.find(candidate => (
            candidate.schemaName === source.schemaName
            && candidate.tableName === source.tableName
            && candidate.columnName === source.columnName
          )) : null
          if (column) materializedFields.set(column.id, { entityId: entity.id, fieldId: field.id })
        }
      }
      for (const { suggestion, payload } of mappingResults) {
        if (typeof payload?.entity?.id === 'string' && typeof payload?.field?.id === 'string') {
          materializedFields.set(suggestion.column.id, {
            entityId: payload.entity.id,
            fieldId: payload.field.id,
          })
        }
        if (suggestion.role === 'metric_source' && payload?.field?.id) {
          createdMetricSources.push({
            suggestion,
            entityId: typeof payload?.entity?.id === 'string' ? payload.entity.id : undefined,
            fieldId: String(payload.field.id),
          })
        }
      }

      for (const item of createdMetricSources) {
        const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}/metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityId: item.entityId,
            fieldId: item.fieldId,
            name: item.suggestion.metricName ?? item.suggestion.fieldName,
            aggregation: item.suggestion.aggregation ?? 'sum',
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(errorToText(payload) || `Metric suggestion failed (${response.status})`)
      }

      let createdRelationshipCount = 0
      for (const suggestion of relationshipSuggestions) {
        const from = materializedFields.get(suggestion.fromColumnId)
        const to = materializedFields.get(suggestion.toColumnId)
        if (!from || !to || from.entityId === to.entityId) continue
        const response = await fetch(`/api/admin/semantic-models/${selectedModel.id}/relationships`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromEntityId: from.entityId,
            toEntityId: to.entityId,
            fromFieldId: from.fieldId,
            toFieldId: to.fieldId,
            type: suggestion.type,
            description: suggestion.reason,
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(errorToText(payload) || `Join suggestion failed (${response.status})`)
        createdRelationshipCount += 1
      }

      await Promise.all([fetchEntities(selectedModel.id), fetchMetrics(selectedModel.id), fetchRelationships(selectedModel.id)])
      setSuggestions(current => current.filter(suggestion => !selectedSuggestionIds.has(suggestion.id)))
      setRelationshipSuggestions([])
      setSelectedSuggestionIds(new Set())
      toast.success(`Applied ${selectedSuggestions.length} mappings, ${createdMetricSources.length} metrics, and ${createdRelationshipCount} joins`)
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
    <div className="mx-auto max-w-[1600px] space-y-6">
      <section className="border-b border-[color:var(--dos-border-soft)] pb-5">
        <p className="font-mono text-xs text-[var(--dos-accent-primary)]">Governed vocabulary</p>
        <h2 className="mt-2 max-w-4xl text-xl font-semibold text-[var(--dos-text-primary)]">
          Semantic Business Model
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--dos-text-muted)]">
          Map scanned database columns into approved business language before datasets, widgets, reports, or AI touch them.
        </p>
      </section>

      <section className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] px-5 text-[var(--dos-text-primary)]">
        <dl className="grid md:grid-cols-3 md:divide-x md:divide-[color:var(--dos-border-soft)]">
          {[
            { title: 'Raw schema', icon: Database, value: `${columns.length} columns scanned` },
            { title: 'Business entities', icon: Network, value: `${entities.length} entities, ${relationships.length} relationships` },
            { title: 'Mapped fields', icon: BrainCircuit, value: `${entities.reduce((total, entity) => total + entity.fields.length, 0)} fields, ${metrics.length} metrics` },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="flex items-center gap-3 border-b border-[color:var(--dos-border-soft)] py-4 last:border-b-0 md:border-b-0 md:px-5 md:first:pl-0 md:last:pr-0">
                <Icon className="h-4 w-4 shrink-0 text-[var(--dos-accent-primary)]" />
                <div>
                  <dt className="text-xs text-[var(--dos-text-muted)]">{item.title}</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold">{item.value}</dd>
                </div>
              </div>
            )
          })}
        </dl>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
        <Card className="min-w-0 border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)]">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">Project and model</CardTitle>
                {selectedModel ? <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[var(--dos-text-secondary)]">{selectedModel.status}</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className={DISABLED_BUTTON_CLASS} onClick={openMetric} disabled={saving || !selectedModel || metricFieldOptions.length === 0}>
                  <BrainCircuit className="mr-2 h-4 w-4" />
                  New Metric
                </Button>
                <Button size="sm" variant="outline" className={DISABLED_BUTTON_CLASS} onClick={openRelationship} disabled={saving || !selectedModel || metricFieldOptions.length < 2}>
                  <GitBranch className="mr-2 h-4 w-4" />
                  New Join
                </Button>
                <Button size="icon" variant="outline" className={DISABLED_BUTTON_CLASS} title={entities.length === 0 ? 'Map at least one field before approving' : 'Submit for review'} onClick={() => void handleModelStatus('review')} disabled={saving || !selectedModel || entities.length === 0 || selectedModel.status === 'review'}>
                  <Send className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" className={DISABLED_BUTTON_CLASS} title={entities.length === 0 ? 'Map at least one field before approving' : 'Approve model'} onClick={() => void handleModelStatus('approved')} disabled={saving || !selectedModel || entities.length === 0 || selectedModel.status === 'approved'}>
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" className={DISABLED_BUTTON_CLASS} title="Archive model" onClick={() => void handleModelStatus('archived')} disabled={saving || !selectedModel || selectedModel.status === 'archived'}>
                  <Archive className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={handleCreateModel} disabled={saving || !selectedProject}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  New Model
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={projectId}
                onValueChange={(value) => {
                  const selected = projects.find(project => project.id === value)
                  setProjectId(value)
                  setModelId('')
                  setSuggestions([])
                  setRelationshipSuggestions([])
                  setProposalSource(null)
                  if (selected) setBuilderScope({ tenantId: selected.tenantId, projectId: selected.id }, 'semantic_model')
                }}
                disabled={loading || projects.length === 0}
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
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
              <Select
                value={modelId}
                onValueChange={(value) => {
                  setModelId(value)
                  setSuggestions([])
                  setRelationshipSuggestions([])
                  setProposalSource(null)
                  setBuilderSemanticModelId(value || null)
                  if (selectedProject) {
                    setBuilderScope({ tenantId: selectedProject.tenantId, projectId: selectedProject.id }, 'semantic_model')
                  }
                }}
                disabled={models.length === 0}
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
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
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="semantic-objective" className="text-xs text-[var(--dos-text-muted)]">Business objective</Label>
                <Input
                  id="semantic-objective"
                  className={CONTROL_CLASS}
                  value={semanticInstruction}
                  onChange={event => setSemanticInstruction(event.target.value)}
                  placeholder="Describe the business questions this model should support"
                  disabled={saving}
                />
              </div>
              <Button
                className={`${SUGGESTION_BUTTON_CLASS} self-end`}
                variant="outline"
                onClick={() => void buildSuggestions()}
                disabled={saving || !selectedModel || selectedModel.status !== 'draft' || columns.length === 0 || semanticInstruction.trim().length < 3}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate proposal
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.length > 0 ? (
              <div className="rounded-md border border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--dos-text-primary)]">Semantic proposal</h3>
                      <Badge variant="outline" className="border-[color:var(--dos-accent-primary)] text-[var(--dos-accent-primary)]">
                        {proposalSource === 'ai' ? 'AI' : 'Rules'} · {relationshipSuggestions.length} joins
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[var(--dos-text-muted)]">Uncheck exceptions, then materialize the selected fields, metrics, and joins.</p>
                  </div>
                  <Button size="sm" onClick={handleApplySuggestions} disabled={saving || selectedSuggestions.length === 0}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Apply {selectedSuggestions.length}
                  </Button>
                </div>
                <div className="mt-4 grid gap-2">
                  {suggestions.map(suggestion => (
                    <label key={suggestion.id} className="grid cursor-pointer gap-3 rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-3 text-xs sm:grid-cols-[auto_1fr_auto]">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[var(--dos-accent-primary)]"
                        checked={selectedSuggestionIds.has(suggestion.id)}
                        onChange={() => toggleSuggestion(suggestion.id)}
                      />
                      <span>
                        <span className="block font-medium text-[var(--dos-text-primary)]">{suggestion.entityName} / {suggestion.fieldName}</span>
                        <span className="mt-1 block font-mono text-[var(--dos-text-muted)]">
                          {suggestion.column.schemaName}.{suggestion.column.tableName}.{suggestion.column.columnName}
                        </span>
                        <span className="mt-1 block text-[var(--dos-text-muted)]">{suggestion.reason}</span>
                      </span>
                      <span className="flex flex-wrap items-start gap-2">
                        <Badge variant="outline" className="border-[color:var(--dos-accent-primary)] text-[var(--dos-accent-primary)]">{suggestion.role}</Badge>
                        <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[var(--dos-text-secondary)]">{suggestion.confidence}%</Badge>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
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
                        <div key={field.id} className="grid items-center gap-2 rounded-md bg-white/[0.03] px-3 py-2 text-xs text-slate-400 sm:grid-cols-[1fr_auto_auto_auto]">
                          <span className="font-medium text-slate-200">{field.name}</span>
                          <span>{field.role}</span>
                          <span>{field.sourceColumn?.tableName}.{field.sourceColumn?.columnName}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
                            title="Remove field mapping"
                            onClick={() => void handleDeleteField(field.id)}
                            disabled={saving}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)] xl:sticky xl:top-20 xl:self-start">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-sm">Scanned schema columns</CardTitle>
              <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[var(--dos-text-secondary)]">
                {visibleColumns.length} visible
              </Badge>
            </div>
            {schemaFreshnessWarning ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Schema scanned over 24h ago - re-introspect from Data Sources to detect drift.</span>
              </div>
            ) : null}
            <Input
              className={CONTROL_CLASS}
              value={columnSearch}
              onChange={event => setColumnSearch(event.target.value)}
              placeholder="Search schema, table, or column"
            />
          </CardHeader>
          <CardContent className="max-h-[620px] space-y-4 overflow-auto">
            {columns.length === 0 ? (
              <div className="rounded-md border border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] p-4 text-sm text-[var(--dos-warning-text)]">
                <div className="flex gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Run schema introspection from Data Sources before mapping fields.</span>
                </div>
              </div>
            ) : groupedColumns.length === 0 ? (
              <div className="border-t border-[color:var(--dos-border-soft)] py-6 text-sm text-[var(--dos-text-muted)]">
                No scanned columns match this search.
              </div>
            ) : (
              groupedColumns.map(([tableName, tableColumns]) => (
                <div key={tableName} className="border-t border-[color:var(--dos-border-soft)] pt-4 first:border-t-0 first:pt-0">
                  <h3 className="text-sm font-semibold">{tableName}</h3>
                  <div className="mt-3 grid gap-2">
                    {tableColumns.map(column => (
                      <button
                        key={column.id}
                        type="button"
                        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left text-xs text-[var(--dos-text-muted)] transition-colors duration-150 hover:border-[color:var(--dos-border-soft)] hover:bg-[var(--dos-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dos-accent-primary)] disabled:cursor-not-allowed disabled:text-[var(--dos-text-muted)]"
                        onClick={() => openMapping(column)}
                        disabled={!selectedModel}
                      >
                        <span className="font-medium text-[var(--dos-text-primary)]">{column.columnName}</span>
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
        <DialogContent className="border-white/10 bg-slate-950 text-slate-100">
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
              <Input className={CONTROL_CLASS} value={entityName} onChange={event => setEntityName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Field</Label>
              <Input className={CONTROL_CLASS} value={fieldName} onChange={event => setFieldName(event.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Role</Label>
              <Select value={fieldRole} onValueChange={value => setFieldRole(value as BusinessFieldRole)}>
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
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
            <Button variant="outline" className={OUTLINE_BUTTON_CLASS} onClick={() => setMappingOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMapping} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save mapping
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={metricOpen} onOpenChange={setMetricOpen}>
        <DialogContent className="border-white/10 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>Create metric</DialogTitle>
            <DialogDescription>
              Metrics are governed aggregations over mapped business fields.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input className={CONTROL_CLASS} value={metricName} onChange={event => setMetricName(event.target.value)} placeholder="Revenue" />
            </div>
            <div className="space-y-2">
              <Label>Source field</Label>
              <Select value={metricFieldId} onValueChange={setMetricFieldId}>
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
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
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
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
            <Button variant="outline" className={OUTLINE_BUTTON_CLASS} onClick={() => setMetricOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMetric} disabled={saving || !metricFieldId || !metricName.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
              Save metric
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={relationshipOpen} onOpenChange={setRelationshipOpen}>
        <DialogContent className="border-white/10 bg-slate-950 text-slate-100">
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
                <SelectTrigger className={SELECT_TRIGGER_CLASS}><SelectValue placeholder="Select field" /></SelectTrigger>
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
                <SelectTrigger className={SELECT_TRIGGER_CLASS}><SelectValue placeholder="Select field" /></SelectTrigger>
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
                <SelectTrigger className={SELECT_TRIGGER_CLASS}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'].map(value => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" className={OUTLINE_BUTTON_CLASS} onClick={() => setRelationshipOpen(false)}>Cancel</Button>
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
