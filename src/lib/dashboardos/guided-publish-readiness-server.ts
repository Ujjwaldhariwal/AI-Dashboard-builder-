import type { SupabaseClient } from '@supabase/supabase-js'

import {
  buildGuidedPublishReadiness,
  type GuidedPublishReadinessResult,
  type GuidedReviewState,
} from '@/lib/dashboardos/guided-review'
import {
  mapDashboardChartSlot,
  mapDashboardPage,
  mapDashboardVersion,
  mapPublishedDashboard,
} from '@/lib/publishing/dashboard-publishing'
import type { DashboardChartConfig } from '@/types/dashboard-chart'
import type { SemanticDataset } from '@/types/semantic-dataset'

export interface GuidedPublishPreflightMetadata {
  strategy: 'recomputed'
  projectId: string
  tenantId: string
  tenantSlug: string | null
  selectedDashboardId: string | null
  selectedVersionId: string | null
  semanticModelId: string | null
  semanticDraftVersion: number | null
  datasetCount: number
  chartCount: number
  dashboardCount: number
  versionCount: number
  pageCount: number
  slotCount: number
}

export interface GuidedPublishPreflightResult {
  readiness: GuidedPublishReadinessResult
  metadata: GuidedPublishPreflightMetadata
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : []
}

function mapSelection(value: unknown): SemanticDataset['selection'] {
  const selection = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return {
    fieldIds: stringArray(selection.fieldIds),
    metricIds: stringArray(selection.metricIds),
    relationshipIds: stringArray(selection.relationshipIds),
  }
}

function mapDataset(row: Record<string, unknown>): Pick<SemanticDataset, 'id' | 'modelId' | 'status' | 'selection'> & { description?: string | null } {
  return {
    id: String(row.id),
    modelId: String(row.model_id),
    status: String(row.status ?? 'draft') as SemanticDataset['status'],
    description: typeof row.description === 'string' ? row.description : null,
    selection: mapSelection(row.selection),
  }
}

function mapChart(row: Record<string, unknown>): Pick<DashboardChartConfig, 'id' | 'datasetId' | 'status' | 'validationState' | 'encoding' | 'templateId'> {
  return {
    id: String(row.id),
    datasetId: String(row.dataset_id),
    status: String(row.status ?? 'draft') as DashboardChartConfig['status'],
    validationState: String(row.validation_state ?? 'unknown') as DashboardChartConfig['validationState'],
    templateId: String(row.template_id) as DashboardChartConfig['templateId'],
    encoding: row.encoding && typeof row.encoding === 'object'
      ? row.encoding as DashboardChartConfig['encoding']
      : { yMetricIds: [], tooltipFieldIds: [], labelById: {}, colorById: {} },
  }
}

function profileStateFromRows(rows: unknown): GuidedReviewState | null {
  if (!Array.isArray(rows)) return null
  const state = rows[0]?.state
  return state && typeof state === 'object' && !Array.isArray(state)
    ? state as GuidedReviewState
    : null
}

export async function evaluateGuidedPublishReadinessForProject({
  supabase,
  projectId,
  selectedDashboardId,
  selectedVersionId,
  evaluatedAt = new Date().toISOString(),
}: {
  supabase: SupabaseClient
  projectId: string
  selectedDashboardId?: string | null
  selectedVersionId?: string | null
  evaluatedAt?: string
}): Promise<GuidedPublishPreflightResult> {
  const { data: projectRow, error: projectError } = await supabase
    .from('dashboard_projects')
    .select('id, tenant_id, active_business_model_id, tenant:tenants(slug)')
    .eq('id', projectId)
    .single()

  if (projectError || !projectRow) throw new Error(projectError?.message ?? 'Project not found')

  const project = projectRow as Record<string, unknown>
  const tenant = project.tenant && typeof project.tenant === 'object' && !Array.isArray(project.tenant)
    ? project.tenant as Record<string, unknown>
    : {}
  const tenantId = String(project.tenant_id)
  const tenantSlug = typeof tenant.slug === 'string' ? tenant.slug : null

  const [
    profileResult,
    modelsResult,
    datasetsResult,
    chartsResult,
    dashboardsResult,
    dataSourcesResult,
  ] = await Promise.all([
    supabase
      .from('guided_schema_profiles')
      .select('state')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('business_models')
      .select('id, status, version')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId),
    supabase
      .from('semantic_datasets')
      .select('id, model_id, status, selection, description')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId),
    supabase
      .from('dashboard_chart_configs')
      .select('id, dataset_id, status, validation_state, encoding, template_id')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId),
    supabase
      .from('published_dashboards')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('data_sources')
      .select('id, schema_last_status, schema_last_error, schema_hash, schema_scope_status')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId),
  ])

  if (profileResult.error) throw new Error(profileResult.error.message)
  if (modelsResult.error) throw new Error(modelsResult.error.message)
  if (datasetsResult.error) throw new Error(datasetsResult.error.message)
  if (chartsResult.error) throw new Error(chartsResult.error.message)
  if (dashboardsResult.error) throw new Error(dashboardsResult.error.message)
  if (dataSourcesResult.error) throw new Error(dataSourcesResult.error.message)

  const profileState = profileStateFromRows(profileResult.data)
  const profileDataSourceId = profileState?.lineage?.schemaProfile.dataSourceId ?? null
  const schemaSource = ((dataSourcesResult.data ?? []) as Record<string, unknown>[])
    .find(source => String(source.id) === profileDataSourceId)
    ?? null
  const dashboards = ((dashboardsResult.data ?? []) as Record<string, unknown>[]).map(mapPublishedDashboard)
  const selectedDashboard = selectedDashboardId
    ? dashboards.find(dashboard => dashboard.id === selectedDashboardId) ?? null
    : dashboards.find(dashboard => dashboard.currentVersionId) ?? dashboards[0] ?? null
  const dashboardIds = dashboards.map(dashboard => dashboard.id)

  const [versionsResult, pagesResult, slotsResult] = await Promise.all([
    dashboardIds.length > 0
      ? supabase.from('dashboard_versions').select('*').in('dashboard_id', dashboardIds).order('version_number', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    dashboardIds.length > 0
      ? supabase.from('dashboard_pages').select('*').in('dashboard_id', dashboardIds)
      : Promise.resolve({ data: [], error: null }),
    dashboardIds.length > 0
      ? supabase.from('dashboard_chart_slots').select('*').in('dashboard_id', dashboardIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (versionsResult.error) throw new Error(versionsResult.error.message)
  if (pagesResult.error) throw new Error(pagesResult.error.message)
  if (slotsResult.error) throw new Error(slotsResult.error.message)

  const versions = ((versionsResult.data ?? []) as Record<string, unknown>[]).map(mapDashboardVersion)
  const pages = ((pagesResult.data ?? []) as Record<string, unknown>[]).map(mapDashboardPage)
  const slots = ((slotsResult.data ?? []) as Record<string, unknown>[]).map(mapDashboardChartSlot)
  const selectedVersion = selectedVersionId
    ? versions.find(version => version.id === selectedVersionId && version.dashboardId === selectedDashboard?.id) ?? null
    : selectedDashboard?.currentVersionId
      ? versions.find(version => version.id === selectedDashboard.currentVersionId) ?? null
      : versions.find(version => version.dashboardId === selectedDashboard?.id) ?? null
  const readiness = buildGuidedPublishReadiness({
    evaluatedAt,
    profileState,
    schemaIntrospection: schemaSource ? {
      dataSourceId: String(schemaSource.id),
      status: typeof schemaSource.schema_last_status === 'string' ? schemaSource.schema_last_status : null,
      error: typeof schemaSource.schema_last_error === 'string' ? schemaSource.schema_last_error : null,
      schemaHash: typeof schemaSource.schema_hash === 'string' ? schemaSource.schema_hash : null,
      scopeStatus: typeof schemaSource.schema_scope_status === 'string' ? schemaSource.schema_scope_status : null,
    } : null,
    models: (modelsResult.data ?? []).map(row => ({
      id: String(row.id),
      status: typeof row.status === 'string' ? row.status : null,
      version: typeof row.version === 'number' ? row.version : Number(row.version ?? 0),
    })),
    activeSemanticModelId: typeof project.active_business_model_id === 'string' ? project.active_business_model_id : null,
    datasets: ((datasetsResult.data ?? []) as Record<string, unknown>[]).map(mapDataset),
    charts: ((chartsResult.data ?? []) as Record<string, unknown>[]).map(mapChart),
    dashboards,
    versions,
    pages,
    slots,
    selectedDashboardId: selectedDashboardId ?? selectedDashboard?.id ?? null,
    selectedVersionId: selectedVersionId ?? selectedVersion?.id ?? null,
    clientUrl: tenantSlug ? `/client/${tenantSlug}` : null,
  })

  return {
    readiness,
    metadata: {
      strategy: 'recomputed',
      projectId,
      tenantId,
      tenantSlug,
      selectedDashboardId: selectedDashboard?.id ?? null,
      selectedVersionId: selectedVersion?.id ?? null,
      semanticModelId: profileState?.semanticAsset?.modelId ?? null,
      semanticDraftVersion: profileState?.semanticDraftVersion ?? null,
      datasetCount: ((datasetsResult.data ?? []) as unknown[]).length,
      chartCount: ((chartsResult.data ?? []) as unknown[]).length,
      dashboardCount: dashboards.length,
      versionCount: versions.length,
      pageCount: pages.length,
      slotCount: slots.length,
    },
  }
}
