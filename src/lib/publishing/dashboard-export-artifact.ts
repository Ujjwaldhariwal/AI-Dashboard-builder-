import type { SupabaseClient } from '@supabase/supabase-js'

import {
  mapDashboardChartSlot,
  mapDashboardPage,
  mapDashboardVersion,
  mapPublishedDashboard,
} from '@/lib/publishing/dashboard-publishing'

export type DashboardExportType = 'manifest_json'
export type DashboardExportStatus = 'succeeded' | 'failed'

export interface DashboardExportArtifact {
  id: string
  tenantId: string
  projectId: string
  dashboardId: string
  versionId: string | null
  jobId: string | null
  requestedBy: string | null
  exportType: DashboardExportType
  status: DashboardExportStatus
  artifactName: string
  contentType: string
  artifact: Record<string, unknown>
  metadata: Record<string, unknown>
  errorMessage: string | null
  createdAt: string
}

interface CreateDashboardManifestExportInput {
  supabase: SupabaseClient
  dashboardId?: string | null
  versionId?: string | null
  requestedBy?: string | null
  jobId?: string | null
}

interface ListDashboardExportArtifactsInput {
  supabase: SupabaseClient
  tenantId?: string | null
  projectId?: string | null
  dashboardId?: string | null
  limit?: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function toArtifactRecord(value: unknown): Record<string, unknown> {
  return asRecord(value)
}

function makeArtifactName(slug: string, versionNumber: number) {
  const safeSlug = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dashboard'
  return `${safeSlug}-v${versionNumber}-manifest.json`
}

export function mapDashboardExportArtifact(row: Record<string, unknown>): DashboardExportArtifact {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    dashboardId: String(row.dashboard_id),
    versionId: typeof row.version_id === 'string' ? row.version_id : null,
    jobId: typeof row.job_id === 'string' ? row.job_id : null,
    requestedBy: typeof row.requested_by === 'string' ? row.requested_by : null,
    exportType: String(row.export_type ?? 'manifest_json') as DashboardExportType,
    status: String(row.status ?? 'succeeded') as DashboardExportStatus,
    artifactName: String(row.artifact_name ?? ''),
    contentType: String(row.content_type ?? 'application/json'),
    artifact: toArtifactRecord(row.artifact),
    metadata: toArtifactRecord(row.metadata),
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

async function loadExportTarget({
  supabase,
  dashboardId,
  versionId,
}: {
  supabase: SupabaseClient
  dashboardId?: string | null
  versionId?: string | null
}) {
  if (!dashboardId && !versionId) throw new Error('Export requires dashboardId or versionId')

  if (versionId) {
    const { data: versionRow, error: versionError } = await supabase
      .from('dashboard_versions')
      .select('*')
      .eq('id', versionId)
      .single()

    if (versionError || !versionRow) throw new Error(versionError?.message ?? 'Dashboard version not found')
    const version = mapDashboardVersion(versionRow as Record<string, unknown>)

    const { data: dashboardRow, error: dashboardError } = await supabase
      .from('published_dashboards')
      .select('*')
      .eq('id', version.dashboardId)
      .single()

    if (dashboardError || !dashboardRow) throw new Error(dashboardError?.message ?? 'Published dashboard not found')
    return {
      dashboard: mapPublishedDashboard(dashboardRow as Record<string, unknown>),
      version,
    }
  }

  const { data: dashboardRow, error: dashboardError } = await supabase
    .from('published_dashboards')
    .select('*')
    .eq('id', dashboardId)
    .neq('status', 'archived')
    .single()

  if (dashboardError || !dashboardRow) throw new Error(dashboardError?.message ?? 'Published dashboard not found')
  const dashboard = mapPublishedDashboard(dashboardRow as Record<string, unknown>)
  const resolvedVersionId = dashboard.currentVersionId
  if (!resolvedVersionId) throw new Error('Published dashboard has no current version to export')

  const { data: versionRow, error: versionError } = await supabase
    .from('dashboard_versions')
    .select('*')
    .eq('id', resolvedVersionId)
    .eq('dashboard_id', dashboard.id)
    .single()

  if (versionError || !versionRow) throw new Error(versionError?.message ?? 'Dashboard version not found')
  return {
    dashboard,
    version: mapDashboardVersion(versionRow as Record<string, unknown>),
  }
}

async function loadVersionBundle(supabase: SupabaseClient, versionId: string) {
  const [pagesResult, slotsResult] = await Promise.all([
    supabase
      .from('dashboard_pages')
      .select('*')
      .eq('version_id', versionId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('dashboard_chart_slots')
      .select('*')
      .eq('version_id', versionId)
      .order('row_index', { ascending: true })
      .order('column_index', { ascending: true }),
  ])

  if (pagesResult.error) throw new Error(pagesResult.error.message)
  if (slotsResult.error) throw new Error(slotsResult.error.message)

  const pages = ((pagesResult.data ?? []) as Record<string, unknown>[]).map(mapDashboardPage)
  const slots = ((slotsResult.data ?? []) as Record<string, unknown>[]).map(mapDashboardChartSlot)
  const chartIds = Array.from(new Set(slots.map(slot => slot.chartConfigId)))

  const { data: chartRows, error: chartError } = chartIds.length > 0
    ? await supabase
      .from('dashboard_chart_configs')
      .select('id, tenant_id, project_id, dataset_id, name, description, status, template_id, encoding, presentation, interactions, layout, validation_state, last_validated_at, published_at, created_at, updated_at')
      .in('id', chartIds)
    : { data: [], error: null }

  if (chartError) throw new Error(chartError.message)
  const charts = (chartRows ?? []) as Record<string, unknown>[]
  const datasetIds = Array.from(new Set(charts.map(chart => String(chart.dataset_id)).filter(Boolean)))

  const { data: datasetRows, error: datasetError } = datasetIds.length > 0
    ? await supabase
      .from('semantic_datasets')
      .select('id, tenant_id, project_id, model_id, name, description, status, selection, cache_policy, created_at, updated_at')
      .in('id', datasetIds)
    : { data: [], error: null }

  if (datasetError) throw new Error(datasetError.message)
  return {
    pages,
    slots,
    charts,
    datasets: (datasetRows ?? []) as Record<string, unknown>[],
  }
}

export async function createDashboardManifestExport({
  supabase,
  dashboardId,
  versionId,
  requestedBy = null,
  jobId = null,
}: CreateDashboardManifestExportInput): Promise<DashboardExportArtifact> {
  const { dashboard, version } = await loadExportTarget({ supabase, dashboardId, versionId })
  const bundle = await loadVersionBundle(supabase, version.id)
  const slotsByPageId = new Map<string, typeof bundle.slots>()
  for (const slot of bundle.slots) {
    const existing = slotsByPageId.get(slot.pageId) ?? []
    existing.push(slot)
    slotsByPageId.set(slot.pageId, existing)
  }

  const artifact = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    dashboard,
    version,
    pages: bundle.pages.map(page => ({
      ...page,
      slots: (slotsByPageId.get(page.id) ?? []).map(slot => ({
        ...slot,
        chartConfigId: slot.chartConfigId,
      })),
    })),
    charts: bundle.charts.map(chart => ({
      id: String(chart.id),
      tenantId: String(chart.tenant_id),
      projectId: String(chart.project_id),
      datasetId: String(chart.dataset_id),
      name: String(chart.name ?? ''),
      description: typeof chart.description === 'string' ? chart.description : null,
      status: String(chart.status ?? 'draft'),
      templateId: String(chart.template_id ?? ''),
      encoding: asRecord(chart.encoding),
      presentation: asRecord(chart.presentation),
      interactions: asRecord(chart.interactions),
      layout: asRecord(chart.layout),
      validationState: String(chart.validation_state ?? 'unknown'),
      lastValidatedAt: typeof chart.last_validated_at === 'string' ? chart.last_validated_at : null,
      publishedAt: typeof chart.published_at === 'string' ? chart.published_at : null,
      createdAt: String(chart.created_at ?? ''),
      updatedAt: String(chart.updated_at ?? ''),
    })),
    datasets: bundle.datasets.map(dataset => ({
      id: String(dataset.id),
      tenantId: String(dataset.tenant_id),
      projectId: String(dataset.project_id),
      modelId: String(dataset.model_id),
      name: String(dataset.name ?? ''),
      description: typeof dataset.description === 'string' ? dataset.description : null,
      status: String(dataset.status ?? 'draft'),
      selection: asRecord(dataset.selection),
      cachePolicy: asRecord(dataset.cache_policy),
      createdAt: String(dataset.created_at ?? ''),
      updatedAt: String(dataset.updated_at ?? ''),
    })),
    runtime: {
      tenantId: dashboard.tenantId,
      projectId: dashboard.projectId,
      readOnly: true,
    },
  }

  const { data, error } = await supabase
    .from('dashboard_export_artifacts')
    .insert({
      tenant_id: dashboard.tenantId,
      project_id: dashboard.projectId,
      dashboard_id: dashboard.id,
      version_id: version.id,
      job_id: jobId,
      requested_by: requestedBy,
      export_type: 'manifest_json',
      status: 'succeeded',
      artifact_name: makeArtifactName(dashboard.slug, version.versionNumber),
      content_type: 'application/json',
      artifact,
      metadata: {
        pageCount: bundle.pages.length,
        slotCount: bundle.slots.length,
        chartCount: bundle.charts.length,
        datasetCount: bundle.datasets.length,
      },
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Unable to create dashboard export artifact')
  return mapDashboardExportArtifact(data as Record<string, unknown>)
}

export async function listDashboardExportArtifacts({
  supabase,
  tenantId,
  projectId,
  dashboardId,
  limit = 50,
}: ListDashboardExportArtifactsInput): Promise<DashboardExportArtifact[]> {
  const clampedLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  let query = supabase
    .from('dashboard_export_artifacts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(clampedLimit)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (projectId) query = query.eq('project_id', projectId)
  if (dashboardId) query = query.eq('dashboard_id', dashboardId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(mapDashboardExportArtifact)
}
