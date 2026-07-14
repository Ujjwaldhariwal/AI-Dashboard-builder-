import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

import { renderDashboardBundleZip, renderDashboardReportPdf } from '@/lib/publishing/dashboard-export-renderers'
import {
  mapDashboardChartSlot,
  mapDashboardPage,
  mapDashboardVersion,
  mapPublishedDashboard,
} from '@/lib/publishing/dashboard-publishing'

export type DashboardExportType = 'manifest_json' | 'report_pdf' | 'bundle_zip'
export type DashboardExportStatus = 'succeeded' | 'failed'
export type DashboardExportStorageStatus = 'inline' | 'uploaded' | 'failed' | 'skipped'

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
  storageBucket: string | null
  storagePath: string | null
  storageStatus: DashboardExportStorageStatus
  storageError: string | null
  byteSize: number | null
  checksumSha256: string | null
  errorMessage: string | null
  createdAt: string
}

interface CreateDashboardExportInput {
  supabase: SupabaseClient
  exportType?: DashboardExportType
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

function makeArtifactName(slug: string, versionNumber: number, exportType: DashboardExportType) {
  const safeSlug = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dashboard'
  if (exportType === 'report_pdf') return `${safeSlug}-v${versionNumber}-report.pdf`
  if (exportType === 'bundle_zip') return `${safeSlug}-v${versionNumber}-bundle.zip`
  return `${safeSlug}-v${versionNumber}-manifest.json`
}

function contentTypeForExport(exportType: DashboardExportType) {
  if (exportType === 'report_pdf') return 'application/pdf'
  if (exportType === 'bundle_zip') return 'application/zip'
  return 'application/json'
}

function exportStorageBucket() {
  return process.env.DASHBOARDOS_EXPORT_BUCKET?.trim() || process.env.SUPABASE_EXPORT_BUCKET?.trim() || ''
}

function exportStoragePath({
  tenantId,
  projectId,
  dashboardId,
  versionId,
  artifactName,
}: {
  tenantId: string
  projectId: string
  dashboardId: string
  versionId: string
  artifactName: string
}) {
  return [
    tenantId,
    projectId,
    dashboardId,
    versionId,
    artifactName,
  ].join('/')
}

function serializeArtifactBody(value: string | Buffer) {
  const body = value
  return {
    body,
    byteSize: typeof body === 'string' ? Buffer.byteLength(body, 'utf8') : body.byteLength,
    checksumSha256: createHash('sha256').update(body).digest('hex'),
  }
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
    storageBucket: typeof row.storage_bucket === 'string' ? row.storage_bucket : null,
    storagePath: typeof row.storage_path === 'string' ? row.storage_path : null,
    storageStatus: String(row.storage_status ?? 'inline') as DashboardExportStorageStatus,
    storageError: typeof row.storage_error === 'string' ? row.storage_error : null,
    byteSize: typeof row.byte_size === 'number' ? row.byte_size : null,
    checksumSha256: typeof row.checksum_sha256 === 'string' ? row.checksum_sha256 : null,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

async function persistArtifactToStorage({
  supabase,
  storageBody,
  artifactRecord,
}: {
  supabase: SupabaseClient
  storageBody: string | Buffer
  artifactRecord: DashboardExportArtifact
}) {
  const serialized = serializeArtifactBody(storageBody)
  const bucket = exportStorageBucket()
  const storagePath = exportStoragePath({
    tenantId: artifactRecord.tenantId,
    projectId: artifactRecord.projectId,
    dashboardId: artifactRecord.dashboardId,
    versionId: artifactRecord.versionId ?? 'current',
    artifactName: artifactRecord.artifactName,
  })

  if (!bucket) {
    const { data, error } = await supabase
      .from('dashboard_export_artifacts')
      .update({
        storage_status: 'inline',
        storage_error: null,
        byte_size: serialized.byteSize,
        checksum_sha256: serialized.checksumSha256,
      })
      .eq('id', artifactRecord.id)
      .select('*')
      .single()

    if (error || !data) throw new Error(error?.message ?? 'Unable to update export storage metadata')
    return mapDashboardExportArtifact(data as Record<string, unknown>)
  }

  const upload = await supabase.storage.from(bucket).upload(storagePath, serialized.body, {
    contentType: artifactRecord.contentType,
    upsert: true,
  })

  const updatePayload = upload.error
    ? {
      storage_bucket: bucket,
      storage_path: storagePath,
      storage_status: 'failed',
      storage_error: upload.error.message,
      byte_size: serialized.byteSize,
      checksum_sha256: serialized.checksumSha256,
    }
    : {
      storage_bucket: bucket,
      storage_path: storagePath,
      storage_status: 'uploaded',
      storage_error: null,
      byte_size: serialized.byteSize,
      checksum_sha256: serialized.checksumSha256,
    }

  const { data, error } = await supabase
    .from('dashboard_export_artifacts')
    .update(updatePayload)
    .eq('id', artifactRecord.id)
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Unable to update export storage metadata')
  return mapDashboardExportArtifact(data as Record<string, unknown>)
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
  const [pagesResult, slotsResult, chartSnapshotsResult, datasetSnapshotsResult] = await Promise.all([
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
    supabase
      .from('dashboard_release_chart_snapshots')
      .select('*')
      .eq('version_id', versionId),
    supabase
      .from('dashboard_release_dataset_snapshots')
      .select('*')
      .eq('version_id', versionId),
  ])

  if (pagesResult.error) throw new Error(pagesResult.error.message)
  if (slotsResult.error) throw new Error(slotsResult.error.message)
  if (chartSnapshotsResult.error) throw new Error(chartSnapshotsResult.error.message)
  if (datasetSnapshotsResult.error) throw new Error(datasetSnapshotsResult.error.message)

  const pages = ((pagesResult.data ?? []) as Record<string, unknown>[]).map(mapDashboardPage)
  const slots = ((slotsResult.data ?? []) as Record<string, unknown>[]).map(mapDashboardChartSlot)
  const charts = (chartSnapshotsResult.data ?? []) as Record<string, unknown>[]
  const datasets = (datasetSnapshotsResult.data ?? []) as Record<string, unknown>[]
  if (slots.length === 0 || charts.length !== slots.length) {
    throw new Error('Dashboard export requires a complete immutable chart snapshot for every released slot')
  }
  const datasetSnapshotIds = new Set(datasets.map(dataset => String(dataset.id)))
  if (charts.some(chart => !datasetSnapshotIds.has(String(chart.dataset_snapshot_id)))) {
    throw new Error('Dashboard export requires an immutable dataset snapshot for every released chart')
  }
  const chartSnapshotIdBySlotId = new Map(charts.map(chart => [String(chart.slot_id), String(chart.id)]))
  return {
    pages,
    slots,
    charts,
    datasets,
    chartSnapshotIdBySlotId,
  }
}

function buildDashboardExportManifest({
  dashboard,
  version,
  bundle,
}: {
  dashboard: ReturnType<typeof mapPublishedDashboard>
  version: ReturnType<typeof mapDashboardVersion>
  bundle: Awaited<ReturnType<typeof loadVersionBundle>>
}) {
  const slotsByPageId = new Map<string, typeof bundle.slots>()
  for (const slot of bundle.slots) {
    const existing = slotsByPageId.get(slot.pageId) ?? []
    existing.push(slot)
    slotsByPageId.set(slot.pageId, existing)
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    dashboard,
    version,
    pages: bundle.pages.map(page => ({
      ...page,
      slots: (slotsByPageId.get(page.id) ?? []).map(slot => ({
        ...slot,
        chartConfigId: bundle.chartSnapshotIdBySlotId.get(slot.id),
        sourceChartConfigId: slot.chartConfigId,
      })),
    })),
    charts: bundle.charts.map(chart => {
      const config = asRecord(chart.chart_config)
      return {
        id: String(chart.id),
        sourceChartConfigId: String(chart.source_chart_config_id),
        slotId: String(chart.slot_id),
        tenantId: String(chart.tenant_id),
        projectId: String(chart.project_id),
        datasetId: String(chart.dataset_snapshot_id),
        name: String(config.name ?? ''),
        description: typeof config.description === 'string' ? config.description : null,
        status: 'released',
        templateId: String(config.template_id ?? ''),
        encoding: asRecord(config.encoding),
        presentation: asRecord(config.presentation),
        interactions: asRecord(config.interactions),
        layout: asRecord(config.layout),
        validationState: String(config.validation_state ?? 'unknown'),
        snapshotOrigin: String(chart.snapshot_origin ?? 'publish'),
        createdAt: String(chart.created_at ?? ''),
      }
    }),
    datasets: bundle.datasets.map(dataset => {
      const config = asRecord(dataset.dataset_config)
      return {
        id: String(dataset.id),
        sourceDatasetId: String(dataset.source_dataset_id),
        tenantId: String(dataset.tenant_id),
        projectId: String(dataset.project_id),
        modelId: String(dataset.source_model_id),
        sourceModelVersion: Number(dataset.source_model_version ?? 0),
        name: String(config.name ?? ''),
        description: typeof config.description === 'string' ? config.description : null,
        status: 'released',
        selection: asRecord(config.selection),
        cachePolicy: asRecord(config.cache_policy),
        semanticSnapshot: asRecord(dataset.semantic_snapshot),
        snapshotOrigin: String(dataset.snapshot_origin ?? 'publish'),
        createdAt: String(dataset.created_at ?? ''),
      }
    }),
    runtime: {
      tenantId: dashboard.tenantId,
      projectId: dashboard.projectId,
      readOnly: true,
    },
  }
}

async function buildDashboardExportPayload(exportType: DashboardExportType, manifest: ReturnType<typeof buildDashboardExportManifest>) {
  if (exportType === 'manifest_json') {
    return {
      artifact: manifest,
      storageBody: JSON.stringify(manifest, null, 2),
    }
  }

  const pdfBuffer = await renderDashboardReportPdf(manifest)
  if (exportType === 'report_pdf') {
    return {
      artifact: {
        schemaVersion: 1,
        format: 'pdf',
        generatedAt: new Date().toISOString(),
        manifest,
        base64: pdfBuffer.toString('base64'),
      },
      storageBody: pdfBuffer,
    }
  }

  const zipBuffer = await renderDashboardBundleZip({ manifest, pdfBuffer })
  return {
    artifact: {
      schemaVersion: 1,
      format: 'zip',
      generatedAt: new Date().toISOString(),
      files: ['manifest.json', 'dashboard-report.pdf', 'README.md'],
      manifest,
      base64: zipBuffer.toString('base64'),
    },
    storageBody: zipBuffer,
  }
}

export async function createDashboardExport({
  supabase,
  exportType = 'manifest_json',
  dashboardId,
  versionId,
  requestedBy = null,
  jobId = null,
}: CreateDashboardExportInput): Promise<DashboardExportArtifact> {
  const { dashboard, version } = await loadExportTarget({ supabase, dashboardId, versionId })
  if (version.releaseSnapshotStatus === 'pending') {
    throw new Error('Dashboard exports require an immutable published release')
  }
  const bundle = await loadVersionBundle(supabase, version.id)
  const manifest = buildDashboardExportManifest({ dashboard, version, bundle })
  const { artifact, storageBody } = await buildDashboardExportPayload(exportType, manifest)

  const { data, error } = await supabase
    .from('dashboard_export_artifacts')
    .insert({
      tenant_id: dashboard.tenantId,
      project_id: dashboard.projectId,
      dashboard_id: dashboard.id,
      version_id: version.id,
      job_id: jobId,
      requested_by: requestedBy,
      export_type: exportType,
      status: 'succeeded',
      artifact_name: makeArtifactName(dashboard.slug, version.versionNumber, exportType),
      content_type: contentTypeForExport(exportType),
      artifact,
      metadata: {
        pageCount: bundle.pages.length,
        slotCount: bundle.slots.length,
        chartCount: bundle.charts.length,
        datasetCount: bundle.datasets.length,
        exportType,
      },
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Unable to create dashboard export artifact')
  const artifactRecord = mapDashboardExportArtifact(data as Record<string, unknown>)
  return persistArtifactToStorage({ supabase, storageBody, artifactRecord })
}

export async function createDashboardManifestExport(input: Omit<CreateDashboardExportInput, 'exportType'>): Promise<DashboardExportArtifact> {
  return createDashboardExport({ ...input, exportType: 'manifest_json' })
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
