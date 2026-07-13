'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Archive, BrainCircuit, CheckCircle2, ChevronDown, ChevronRight, Database, GitBranch, Loader2, Network, Plus, Send, Sparkles, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GuidedProgressStepper } from '@/components/platform/guided-progress-stepper'
import { useScopedBuilderStore } from '@/store/scoped-builder-store'
import { demoColumns, demoEntities, demoMetrics, demoModel, demoProjects, demoRelationships, DEMO_MODEL_ID, DEMO_PROJECT_ID, DEMO_TENANT_ID } from '@/lib/dashboardos/demo-data'
import { isDashboardOsDemoMode } from '@/lib/dashboardos/demo-mode'
import { buildGuidedProgress, buildGuidedSchemaProfile, buildGuidedSemanticDraft, type GuidedReviewDecisionAction, type GuidedReviewState } from '@/lib/dashboardos/guided-review'
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

interface GuidedProfileApiRecord {
  id: string
  state: GuidedReviewState
}

const FIELD_ROLES: BusinessFieldRole[] = ['identifier', 'dimension', 'metric_source', 'date', 'attribute', 'hidden']
const CONTROL_CLASS = 'border-white/10 bg-slate-950/70 text-slate-100 placeholder:text-slate-500 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-900/70 disabled:text-slate-400 disabled:opacity-100'
const SELECT_TRIGGER_CLASS = `${CONTROL_CLASS} [&>span]:truncate [&>span]:text-slate-100 [&>span[data-placeholder]]:text-slate-500`
const OUTLINE_BUTTON_CLASS = '!border-white/10 !bg-slate-950/70 !text-slate-200 hover:!border-white/20 hover:!bg-slate-900 hover:!text-white [&_svg]:!text-current'
const DISABLED_BUTTON_CLASS = `${OUTLINE_BUTTON_CLASS} disabled:!border-white/10 disabled:!bg-slate-950/60 disabled:!text-slate-600 disabled:!opacity-100`
const SUGGESTION_BUTTON_CLASS = '!border-[#a6e22e]/45 !bg-[#a6e22e]/10 !text-[#a6e22e] hover:!border-[#a6e22e]/70 hover:!bg-[#a6e22e]/15 hover:!text-[#d8ff7a] disabled:!border-white/10 disabled:!bg-slate-950/60 disabled:!text-slate-600 disabled:!opacity-100 [&_svg]:!text-current'

const SEMANTIC_GUIDE_STEPS = [
  {
    title: 'Pick project',
    body: 'Start from the tenant/project that owns the connected electricity database.',
    accent: 'var(--dos-accent-primary)',
    icon: Database,
  },
  {
    title: 'Map customers',
    body: 'Turn customer_id, city, connection_type, and sanctioned_load_kw into business fields.',
    accent: 'var(--dos-info)',
    icon: Network,
  },
  {
    title: 'Map readings',
    body: 'Use bill_month, units_consumed_kwh, bill_amount, payment_status, and outage_hours.',
    accent: 'var(--dos-success)',
    icon: Zap,
  },
  {
    title: 'Join tables',
    body: 'Connect readings.customer_id to customers.customer_id so charts can group by city.',
    accent: 'var(--dos-warning)',
    icon: GitBranch,
  },
  {
    title: 'Approve model',
    body: 'Approval unlocks datasets and charts using reviewed electricity fields.',
    accent: 'var(--dos-chart-risk)',
    icon: CheckCircle2,
  },
]

const ELECTRICITY_MAPPING_PLAN = [
  { raw: 'public.electricity_customers.customer_id', role: 'identifier', note: 'Customer primary key and relationship target.' },
  { raw: 'public.electricity_customers.city', role: 'dimension', note: 'Use for city-wise billing and usage charts.' },
  { raw: 'public.electricity_customers.connection_type', role: 'dimension', note: 'Use for domestic/commercial breakdowns.' },
  { raw: 'public.electricity_readings.customer_id', role: 'identifier', note: 'Join back to the customer table.' },
  { raw: 'public.electricity_readings.bill_month', role: 'date', note: 'Use as the chart time axis.' },
  { raw: 'public.electricity_readings.units_consumed_kwh', role: 'metric_source', note: 'Create Total Units Consumed with sum.' },
  { raw: 'public.electricity_readings.bill_amount', role: 'metric_source', note: 'Create Total Bill Amount with sum.' },
  { raw: 'public.electricity_readings.payment_status', role: 'dimension', note: 'Use for paid/pending/overdue filters.' },
  { raw: 'public.electricity_readings.outage_hours', role: 'metric_source', note: 'Create Average Outage Hours with avg.' },
]

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
  if (isNumericType(column.dataType) && /(revenue|sales|amount|bill|total|count|quantity|orders|customers|users|price|cost|profit|margin|duration|score|usage|units|kwh|consumed|outage|load)/i.test(name)) return 'metric_source'
  if (/(name|type|status|segment|region|category|country|city|channel|provider|priority|plan|tier|connection)/i.test(name)) return 'dimension'
  if (/(password|secret|token|payload|metadata|raw|hash)/i.test(name)) return 'hidden'
  return isNumericType(column.dataType) ? 'metric_source' : 'attribute'
}

function inferEntityType(columns: DataSourceColumnMetadata[]): MappingSuggestion['entityType'] {
  const joined = columns.map(column => `${column.tableName}_${column.columnName}`).join(' ').toLowerCase()
  const metricCount = columns.filter(column => inferRole(column) === 'metric_source').length
  if (/(event|events|log|logs|orders|payments|items|tickets|usage)/.test(joined)) return 'event'
  if (metricCount >= 2 || /(fact|revenue|sales|summary|monthly|readings|billing|electricity)/.test(joined)) return 'fact'
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
  const [guideOpen, setGuideOpen] = useState(true)
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([])
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set())
  const [schemaScannedAt, setSchemaScannedAt] = useState<Date | null>(null)
  const [guidedProfileRecord, setGuidedProfileRecord] = useState<GuidedProfileApiRecord | null>(null)
  const [guidedSavingItemId, setGuidedSavingItemId] = useState<string | null>(null)
  const demoMode = isDashboardOsDemoMode()

  const selectedProject = projects.find(project => project.id === projectId)
  const selectedModel = models.find(model => model.id === modelId)
  const selectedColumn = columns.find(column => column.id === selectedColumnId)
  const guidedProfile = useMemo(() => buildGuidedSchemaProfile(columns), [columns])
  const computedSemanticDraft = useMemo(() => buildGuidedSemanticDraft(guidedProfile), [guidedProfile])
  const guidedState = guidedProfileRecord?.state
  const semanticDraft = guidedState?.semanticDraft ?? computedSemanticDraft
  const semanticAsset = guidedState?.semanticAsset ?? null
  const guidedProgress = useMemo(() => buildGuidedProgress({
    hasDataSource: columns.length > 0,
    hasProfile: Boolean(guidedProfileRecord) || columns.length > 0,
    openReviewCount: semanticDraft.needsReview.length,
    semanticDraftApproved: guidedState?.semanticDraftStatus === 'approved' || selectedModel?.status === 'approved',
    hasDatasetDraft: false,
    hasDashboardDraft: false,
    hasPreview: false,
    hasPublishedDashboard: false,
  }), [columns.length, guidedProfileRecord, guidedState?.semanticDraftStatus, selectedModel?.status, semanticDraft.needsReview.length])

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
    const params = new URLSearchParams({ projectId: nextProjectId })
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

  const fetchGuidedProfile = async (nextProjectId: string) => {
    if (!nextProjectId) {
      setGuidedProfileRecord(null)
      return
    }
    if (demoMode) {
      setGuidedProfileRecord(null)
      return
    }
    const response = await fetch(`/api/admin/guided-review/profile?projectId=${encodeURIComponent(nextProjectId)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(errorToText(payload))
    setGuidedProfileRecord(payload?.profile ?? null)
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
      fetchGuidedProfile(projectId),
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

  const handleGuidedDecision = async (itemId: string, action: GuidedReviewDecisionAction) => {
    if (demoMode || !guidedProfileRecord) {
      toast.success(`Demo review decision recorded: ${action}`)
      return
    }
    setGuidedSavingItemId(itemId)
    try {
      const response = await fetch('/api/admin/guided-review/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: guidedProfileRecord.id, itemId, action }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      setGuidedProfileRecord(payload.profile as GuidedProfileApiRecord)
      toast.success('Review decision saved')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setGuidedSavingItemId(null)
    }
  }

  const handleApproveGuidedDraft = async () => {
    if (demoMode || !guidedProfileRecord) {
      toast.success('Demo semantic draft approved')
      return
    }
    setGuidedSavingItemId('semantic-draft')
    try {
      const response = await fetch('/api/admin/guided-review/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: guidedProfileRecord.id, action: 'approve_semantic_draft' }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorToText(payload))
      const nextProfile = payload.profile as GuidedProfileApiRecord
      setGuidedProfileRecord(nextProfile)
      await fetchModels(projectId)
      if (nextProfile.state.semanticAsset?.modelId) {
        setModelId(nextProfile.state.semanticAsset.modelId)
        setBuilderSemanticModelId(nextProfile.state.semanticAsset.modelId)
      }
      toast.success('Guided semantic draft approved and semantic model asset created')
    } catch (error) {
      toast.error(errorToText(error))
    } finally {
      setGuidedSavingItemId(null)
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

  const buildSuggestions = () => {
    if (!selectedModel) {
      toast.error('Create or select a business model first')
      return
    }

    const byTable = new Map<string, DataSourceColumnMetadata[]>()
    for (const column of columns) {
      const key = `${column.schemaName}.${column.tableName}.${column.columnName}`
      if (mappedSourceKeys.has(key)) continue
      const tableKey = `${column.schemaName}.${column.tableName}`
      byTable.set(tableKey, [...(byTable.get(tableKey) ?? []), column])
    }

    const rankedTables = Array.from(byTable.entries())
      .map(([tableKey, tableColumns]) => {
        const tableText = tableKey.toLowerCase()
        const roles = tableColumns.map(inferRole)
        const score =
          (tableText.includes('electricity_readings') ? 120 : 0)
          + (tableText.includes('electricity_customers') ? 96 : 0)
          + (tableText.includes('electricity') ? 64 : 0)
          + (tableText.includes('billing') || tableText.includes('readings') ? 32 : 0)
          + (tableText.includes('v_monthly_revenue') ? 24 : 0)
          + (tableText.includes('sales') ? 28 : 0)
          + (tableText.includes('support') ? 12 : 0)
          + roles.filter(role => role === 'metric_source').length * 10
          + roles.filter(role => role === 'date').length * 8
          + roles.filter(role => role === 'dimension').length * 5
          - (tableText.startsWith('auth.') || tableText.startsWith('storage.') ? 100 : 0)
        return { tableKey, tableColumns, score }
      })
      .filter(table => table.score > 0)
      .sort((left, right) => right.score - left.score)

    const table = rankedTables[0]
    if (!table) {
      toast.error('No unmapped business-looking columns found')
      return
    }

    const entityName = titleFromColumn(table.tableKey.split('.').at(-1) ?? 'Business Entity')
    const entityType = inferEntityType(table.tableColumns)
    const nextSuggestions = table.tableColumns
      .map(column => {
        const role = inferRole(column)
        const fieldName = titleFromColumn(column.columnName)
        const suggestion: MappingSuggestion = {
          id: `${column.id}:${role}`,
          column,
          entityName,
          entityType,
          fieldName,
          role,
          confidence: role === 'attribute' ? 70 : role === 'hidden' ? 65 : 88,
          reason: role === 'metric_source'
            ? 'Numeric business measure detected.'
            : role === 'date'
              ? 'Date or time grain detected.'
              : role === 'dimension'
                ? 'Good filter or grouping column.'
                : role === 'identifier'
                  ? 'Identifier-style column detected.'
                  : role === 'hidden'
                    ? 'Technical or sensitive-looking column.'
                    : 'Useful descriptive attribute.',
        }
        if (role === 'metric_source') {
          suggestion.metricName = inferMetricName(column.columnName)
          suggestion.aggregation = column.columnName.toLowerCase().includes('count') ? 'count' : 'sum'
        }
        return suggestion
      })
      .filter(suggestion => suggestion.role !== 'hidden')
      .sort((left, right) => {
        const order: BusinessFieldRole[] = ['date', 'dimension', 'metric_source', 'identifier', 'attribute', 'hidden']
        return order.indexOf(left.role) - order.indexOf(right.role)
      })
      .slice(0, 12)

    setSuggestions(nextSuggestions)
    setSelectedSuggestionIds(new Set(nextSuggestions.map(suggestion => suggestion.id)))
    setColumnSearch(table.tableKey)
    toast.success(`Generated ${nextSuggestions.length} suggestions from ${table.tableKey}`)
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
      for (const { suggestion, payload } of mappingResults) {
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

      await Promise.all([fetchEntities(selectedModel.id), fetchMetrics(selectedModel.id)])
      setSuggestions(current => current.filter(suggestion => !selectedSuggestionIds.has(suggestion.id)))
      setSelectedSuggestionIds(new Set())
      toast.success(`Applied ${selectedSuggestions.length} mappings and ${createdMetricSources.length} starter metrics`)
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
        <h2 className="max-w-4xl text-2xl font-semibold tracking-tight text-white">
          Semantic Business Model
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
          Map scanned database columns into approved business language before datasets, widgets, reports, or AI touch them.
        </p>
      </section>

      <section className="overflow-hidden rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] text-[var(--dos-text-primary)] shadow-[0_18px_55px_rgba(0,0,0,0.18)]">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--dos-surface-muted)]"
          onClick={() => setGuideOpen(open => !open)}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="semantic-guide-orb mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] text-[var(--dos-accent-primary)]">
              <Zap className="h-4 w-4" />
            </span>
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--dos-text-primary)]">Engineer guide</p>
              <Badge variant="outline" className="border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] text-[var(--dos-accent-primary)]">electricity flow</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--dos-text-muted)]">
              Follow this path for the simple electricity demo: map customers, map monthly readings, create metrics, then approve.
            </p>
            </div>
          </div>
          {guideOpen ? <ChevronDown className="h-4 w-4 text-[var(--dos-accent-primary)]" /> : <ChevronRight className="h-4 w-4 text-[var(--dos-accent-primary)]" />}
        </button>

        {guideOpen ? (
          <div className="grid gap-5 border-t border-[color:var(--dos-border-soft)] bg-[linear-gradient(135deg,var(--dos-accent-primary-soft),transparent_38%,var(--dos-info-soft))] p-5 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--dos-text-primary)]">Semantic model flow chart</h3>
                <span className="rounded-full border border-[color:var(--dos-success)] bg-[var(--dos-success-soft)] px-3 py-1 text-[11px] font-medium text-[var(--dos-success-text)]">
                  Start here
                </span>
              </div>
              <div className="relative grid gap-3">
                <span className="semantic-flow-rail-vertical pointer-events-none absolute bottom-8 left-4 top-8 hidden w-px md:block" />
                {SEMANTIC_GUIDE_STEPS.map((step, index) => (
                  <div
                    key={step.title}
                    className="semantic-flow-node relative grid gap-3 rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-3 shadow-sm sm:grid-cols-[auto_1fr_auto]"
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold"
                        style={{
                          borderColor: step.accent,
                          backgroundColor: `color-mix(in srgb, ${step.accent} 18%, transparent)`,
                          color: step.accent,
                        }}
                      >
                      {index + 1}
                    </span>
                      <step.icon className="h-4 w-4" style={{ color: step.accent }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--dos-text-primary)]">{step.title}</p>
                      <p className="mt-2 text-xs leading-5 text-[var(--dos-text-muted)]">{step.body}</p>
                    </div>
                    {index < SEMANTIC_GUIDE_STEPS.length - 1 ? (
                      <ChevronDown className="hidden h-5 w-5 self-center rounded-full border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-1 text-[var(--dos-accent-primary)] sm:block" />
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] px-4 py-3 text-xs leading-5 text-[var(--dos-warning-text)]">
                Use one semantic model only. Do not mix old revenue fields with electricity metrics when creating datasets.
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--dos-text-primary)]">Electricity mapping checklist</h3>
              <p className="text-xs leading-5 text-[var(--dos-text-muted)]">
                Search for <span className="font-mono text-[var(--dos-text-secondary)]">electricity</span>, map these columns, then create metrics and approve the model.
              </p>
              <div className="grid gap-2">
                {ELECTRICITY_MAPPING_PLAN.map((item, index) => (
                  <div
                    key={item.raw}
                    className="semantic-mapping-row grid gap-2 rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-3 text-xs sm:grid-cols-[1fr_auto]"
                    style={{ animationDelay: `${120 + index * 45}ms` }}
                  >
                    <div>
                      <p className="break-all font-mono text-[var(--dos-text-primary)]">{item.raw}</p>
                      <p className="mt-1 text-[var(--dos-text-muted)]">{item.note}</p>
                    </div>
                    <Badge variant="outline" className="w-fit border-[color:var(--dos-info)] bg-[var(--dos-info-soft)] text-[var(--dos-info-text)]">{item.role}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
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

      <GuidedProgressStepper
        steps={guidedProgress}
        title="Continue guided flow"
        description="Approval writes a versioned semantic model asset before datasets can use it."
      />

      <section className="rounded-xl border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface-raised)] p-5 text-[var(--dos-text-primary)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[var(--dos-success-soft)] text-[var(--dos-success-text)] hover:bg-[var(--dos-success-soft)]">Guided mode</Badge>
              <Badge variant="outline" className="border-[color:var(--dos-border-soft)] text-[var(--dos-text-muted)]">Review exceptions first</Badge>
            </div>
            <h3 className="mt-3 text-lg font-semibold">Semantic auto-draft</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--dos-text-muted)]">
              DashboardOS drafts the obvious fields and metrics from scanned schema. Approval materializes this reviewed draft as an approved semantic model asset for datasets and dashboards.
            </p>
            <div className="mt-3 rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] px-3 py-2 text-xs text-[var(--dos-text-muted)]">
              {semanticAsset
                ? `Linked asset: ${semanticAsset.modelName} v${semanticAsset.modelVersion} / ${semanticAsset.fieldCount} fields / ${semanticAsset.metricCount} metrics`
                : 'Pending asset: approving this draft creates a governed semantic model version, not just a UI approval.'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className={SUGGESTION_BUTTON_CLASS} onClick={buildSuggestions} disabled={saving || !selectedModel || columns.length === 0}>
              <Sparkles className="mr-2 h-4 w-4" />
              Refresh draft
            </Button>
            <Button size="sm" onClick={handleApproveGuidedDraft} disabled={guidedSavingItemId === 'semantic-draft' || Boolean(semanticAsset) || semanticDraft.needsReview.length > 0 || semanticDraft.approvedFields.length === 0}>
              {guidedSavingItemId === 'semantic-draft' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Approve and create model
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {[
            ['Approved fields', semanticDraft.approvedFields.length, 'border-[color:var(--dos-success)] bg-[var(--dos-success-soft)] text-[var(--dos-success-text)]'],
            ['Suggested metrics', semanticDraft.suggestedMetrics.length, 'border-[color:var(--dos-info)] bg-[var(--dos-info-soft)] text-[var(--dos-info-text)]'],
            ['Suggested joins', semanticDraft.suggestedRelationships.length, 'border-[color:var(--dos-accent-primary)] bg-[var(--dos-accent-primary-soft)] text-[var(--dos-accent-primary)]'],
            ['Hidden sensitive', semanticDraft.hiddenSensitiveFields.length, 'border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] text-[var(--dos-warning-text)]'],
            ['Needs review', semanticDraft.needsReview.length, 'border-[color:var(--dos-chart-risk)] bg-[var(--dos-danger-soft)] text-[var(--dos-chart-risk)]'],
          ].map(([label, value, className]) => (
            <div key={String(label)} className={`rounded-lg border p-3 ${className}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
            <h4 className="text-sm font-semibold">Review queue</h4>
            <div className="mt-3 grid gap-2">
              {semanticDraft.needsReview.length === 0 ? (
                <p className="text-xs text-[var(--dos-text-muted)]">No low-confidence schema items yet. Scan a source or generate suggestions to continue.</p>
              ) : semanticDraft.needsReview.slice(0, 5).map(entry => (
                <div key={entry.id} className="grid gap-3 rounded-md border border-[color:var(--dos-border-soft)] bg-[var(--dos-surface)] px-3 py-2 text-xs sm:grid-cols-[1fr_auto]">
                  <span>
                    <span className="block font-medium text-[var(--dos-text-primary)]">{entry.label}</span>
                    <span className="mt-1 block text-[var(--dos-text-muted)]">{entry.reason}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="shrink-0 border-[color:var(--dos-border-soft)] text-[var(--dos-text-muted)]">{entry.confidence}%</Badge>
                    <Button size="sm" variant="outline" className="h-7 border-[color:var(--dos-success)] bg-transparent px-2 text-[10px] text-[var(--dos-success-text)]" disabled={guidedSavingItemId === entry.id} onClick={() => void handleGuidedDecision(entry.id, entry.kind === 'relationship_candidate' ? 'confirm_relationship' : 'approve')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 border-[color:var(--dos-warning)] bg-transparent px-2 text-[10px] text-[var(--dos-warning-text)]" disabled={guidedSavingItemId === entry.id} onClick={() => void handleGuidedDecision(entry.id, entry.kind === 'relationship_candidate' ? 'reject_relationship' : 'reject')}>
                      Reject
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[color:var(--dos-border-soft)] bg-[var(--dos-background-deep)] p-4">
            <h4 className="text-sm font-semibold">Protected by default</h4>
            <p className="mt-2 text-xs leading-5 text-[var(--dos-text-muted)]">
              Sensitive-looking fields are hidden from guided defaults. Admins can review them deliberately, but they are not recommended for dashboards or AI context.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {semanticDraft.hiddenSensitiveFields.slice(0, 4).map(entry => (
                <span key={entry.id} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--dos-warning)] bg-[var(--dos-warning-soft)] px-2 py-1 text-[11px] text-[var(--dos-warning-text)]">
                  {entry.label}
                  <button type="button" className="font-semibold underline-offset-2 hover:underline" disabled={guidedSavingItemId === entry.id} onClick={() => void handleGuidedDecision(entry.id, 'keep_hidden')}>
                    keep hidden
                  </button>
                </span>
              ))}
              {semanticDraft.hiddenSensitiveFields.length === 0 ? (
                <span className="text-xs text-[var(--dos-text-muted)]">No sensitive candidates detected in current scan.</span>
              ) : null}
            </div>
          </div>
        </div>
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
                <Button size="sm" variant="outline" className={SUGGESTION_BUTTON_CLASS} onClick={buildSuggestions} disabled={saving || !selectedModel || columns.length === 0}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Suggestions
                </Button>
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
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.length > 0 ? (
              <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-cyan-100">Smart mapping suggestions</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Review the generated fields, uncheck anything wrong, then apply. Starter metrics are created for selected metric sources.
                    </p>
                  </div>
                  <Button size="sm" onClick={handleApplySuggestions} disabled={saving || selectedSuggestions.length === 0}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Apply {selectedSuggestions.length}
                  </Button>
                </div>
                <div className="mt-4 grid gap-2">
                  {suggestions.map(suggestion => (
                    <label key={suggestion.id} className="grid cursor-pointer gap-3 rounded-md border border-white/10 bg-slate-950/55 p-3 text-xs sm:grid-cols-[auto_1fr_auto]">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-cyan-300"
                        checked={selectedSuggestionIds.has(suggestion.id)}
                        onChange={() => toggleSuggestion(suggestion.id)}
                      />
                      <span>
                        <span className="block font-medium text-slate-100">{suggestion.entityName} / {suggestion.fieldName}</span>
                        <span className="mt-1 block font-mono text-slate-500">
                          {suggestion.column.schemaName}.{suggestion.column.tableName}.{suggestion.column.columnName}
                        </span>
                        <span className="mt-1 block text-slate-400">{suggestion.reason}</span>
                      </span>
                      <span className="flex flex-wrap items-start gap-2">
                        <Badge variant="outline" className="border-cyan-300/30 text-cyan-100">{suggestion.role}</Badge>
                        <Badge variant="outline" className="border-white/15 text-slate-300">{suggestion.confidence}%</Badge>
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

        <Card className="border-white/10 bg-white/[0.03] text-slate-100">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-sm">Scanned schema columns</CardTitle>
              <Badge variant="outline" className="border-white/15 text-slate-300">
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
              placeholder="Search schema, table, or column, e.g. electricity readings"
            />
            <p className="text-xs leading-5 text-[var(--dos-text-muted)]">
              Tip: type <span className="font-mono text-[var(--dos-text-secondary)]">electricity</span>, then map customers, readings, metrics, and the customer relationship.
            </p>
          </CardHeader>
          <CardContent className="max-h-[620px] space-y-4 overflow-auto">
            {columns.length === 0 ? (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                <div className="flex gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Run schema introspection from Data Sources before mapping fields.</span>
                </div>
              </div>
            ) : groupedColumns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/15 bg-slate-950/50 p-6 text-sm text-slate-400">
                No scanned columns match this search.
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
