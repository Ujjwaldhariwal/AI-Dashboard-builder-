import type { DashboardChartConfig, DashboardChartEncoding } from '@/types/dashboard-chart'

interface ReleaseSemanticSelection {
  fieldIds: string[]
  metricIds: string[]
  relationshipIds: string[]
}

export type DashboardReleaseSnapshotOrigin = 'publish' | 'legacy_backfill'

export interface DashboardReleaseDatasetSnapshot {
  id: string
  versionId: string
  dashboardId: string
  tenantId: string
  projectId: string
  sourceDatasetId: string
  sourceModelId: string
  datasetConfig: Record<string, unknown>
  semanticSnapshot: Record<string, unknown>
  sourceDatasetUpdatedAt: string | null
  sourceModelVersion: number
  snapshotOrigin: DashboardReleaseSnapshotOrigin
  createdAt: string
}

export interface DashboardReleaseChartSnapshot {
  id: string
  versionId: string
  dashboardId: string
  tenantId: string
  projectId: string
  slotId: string
  datasetSnapshotId: string
  sourceChartConfigId: string
  chartConfig: Record<string, unknown>
  sourceChartUpdatedAt: string | null
  snapshotOrigin: DashboardReleaseSnapshotOrigin
  createdAt: string
}

export interface ReleasedSemanticResolution {
  ok: boolean
  error?: string
  fields: Record<string, unknown>[]
  metrics: Record<string, unknown>[]
  relationships: Record<string, unknown>[]
  metricSourceFields: Record<string, unknown>[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown>[]
    : []
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter(item => typeof item === 'string') as string[]))
    : []
}

function releaseEncoding(value: unknown): DashboardChartEncoding {
  const encoding = asRecord(value)
  return {
    xAxisFieldId: typeof encoding.xAxisFieldId === 'string' ? encoding.xAxisFieldId : undefined,
    yMetricIds: stringArray(encoding.yMetricIds),
    seriesFieldId: typeof encoding.seriesFieldId === 'string' ? encoding.seriesFieldId : undefined,
    stackMetricIds: stringArray(encoding.stackMetricIds),
    tooltipFieldIds: stringArray(encoding.tooltipFieldIds),
    labelById: asRecord(encoding.labelById) as Record<string, string>,
    colorById: asRecord(encoding.colorById) as Record<string, string>,
    sort: Object.keys(asRecord(encoding.sort)).length > 0
      ? asRecord(encoding.sort) as DashboardChartEncoding['sort']
      : undefined,
    limit: typeof encoding.limit === 'number' ? encoding.limit : null,
    filters: Array.isArray(encoding.filters)
      ? encoding.filters as DashboardChartEncoding['filters']
      : [],
  }
}

function releaseSelection(datasetConfig: Record<string, unknown>): ReleaseSemanticSelection {
  const selection = asRecord(datasetConfig.selection)
  return {
    fieldIds: stringArray(selection.fieldIds),
    metricIds: stringArray(selection.metricIds),
    relationshipIds: stringArray(selection.relationshipIds),
  }
}

export function mapDashboardReleaseDatasetSnapshot(row: Record<string, unknown>): DashboardReleaseDatasetSnapshot {
  return {
    id: String(row.id),
    versionId: String(row.version_id),
    dashboardId: String(row.dashboard_id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    sourceDatasetId: String(row.source_dataset_id),
    sourceModelId: String(row.source_model_id),
    datasetConfig: asRecord(row.dataset_config),
    semanticSnapshot: asRecord(row.semantic_snapshot),
    sourceDatasetUpdatedAt: typeof row.source_dataset_updated_at === 'string' ? row.source_dataset_updated_at : null,
    sourceModelVersion: Number(row.source_model_version ?? 0),
    snapshotOrigin: String(row.snapshot_origin ?? 'publish') as DashboardReleaseSnapshotOrigin,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export function mapDashboardReleaseChartSnapshot(row: Record<string, unknown>): DashboardReleaseChartSnapshot {
  return {
    id: String(row.id),
    versionId: String(row.version_id),
    dashboardId: String(row.dashboard_id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    slotId: String(row.slot_id),
    datasetSnapshotId: String(row.dataset_snapshot_id),
    sourceChartConfigId: String(row.source_chart_config_id),
    chartConfig: asRecord(row.chart_config),
    sourceChartUpdatedAt: typeof row.source_chart_updated_at === 'string' ? row.source_chart_updated_at : null,
    snapshotOrigin: String(row.snapshot_origin ?? 'publish') as DashboardReleaseSnapshotOrigin,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export function mapReleasedChartConfig(snapshot: DashboardReleaseChartSnapshot): DashboardChartConfig {
  const row = snapshot.chartConfig
  const presentation = asRecord(row.presentation)
  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    projectId: snapshot.projectId,
    datasetId: snapshot.datasetSnapshotId,
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: 'published',
    templateId: String(row.template_id) as DashboardChartConfig['templateId'],
    encoding: releaseEncoding(row.encoding),
    presentation: {
      size: String(presentation.size ?? 'standard') as DashboardChartConfig['presentation']['size'],
      showLegend: presentation.showLegend !== false,
      showLabels: presentation.showLabels === true,
      valueFormat: typeof presentation.valueFormat === 'string' ? presentation.valueFormat : null,
    },
    interactions: asRecord(row.interactions) as DashboardChartConfig['interactions'],
    layout: asRecord(row.layout) as DashboardChartConfig['layout'],
    validationState: String(row.validation_state ?? 'invalid') as DashboardChartConfig['validationState'],
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
    publishedAt: snapshot.createdAt,
  }
}

export function releasedDatasetSelection(snapshot: DashboardReleaseDatasetSnapshot) {
  return releaseSelection(snapshot.datasetConfig)
}

export function resolveReleasedSemanticReferences(snapshot: DashboardReleaseDatasetSnapshot): ReleasedSemanticResolution {
  const selection = releaseSelection(snapshot.datasetConfig)
  const entities = asRecords(snapshot.semanticSnapshot.entities)
  const allFields = asRecords(snapshot.semanticSnapshot.fields)
  const allMetrics = asRecords(snapshot.semanticSnapshot.metrics)
  const allRelationships = asRecords(snapshot.semanticSnapshot.relationships)
  const entityIds = new Set(entities.map(entity => String(entity.id)))
  const fieldById = new Map(allFields.map(field => [String(field.id), field]))
  const metricById = new Map(allMetrics.map(metric => [String(metric.id), metric]))
  const relationshipById = new Map(allRelationships.map(relationship => [String(relationship.id), relationship]))
  const fields = selection.fieldIds.map(id => fieldById.get(id)).filter((field): field is Record<string, unknown> => Boolean(field))
  const metrics = selection.metricIds.map(id => metricById.get(id)).filter((metric): metric is Record<string, unknown> => Boolean(metric))
  const relationships = selection.relationshipIds
    .map(id => relationshipById.get(id))
    .filter((relationship): relationship is Record<string, unknown> => Boolean(relationship))

  if (fields.length !== selection.fieldIds.length) {
    return { ok: false, error: 'Released dataset snapshot is missing selected semantic fields', fields, metrics, relationships, metricSourceFields: [] }
  }
  if (metrics.length !== selection.metricIds.length) {
    return { ok: false, error: 'Released dataset snapshot is missing selected semantic metrics', fields, metrics, relationships, metricSourceFields: [] }
  }
  if (relationships.length !== selection.relationshipIds.length) {
    return { ok: false, error: 'Released dataset snapshot is missing selected semantic relationships', fields, metrics, relationships, metricSourceFields: [] }
  }

  const selectedFieldIds = new Set(fields.map(field => String(field.id)))
  const metricSourceFieldIds = Array.from(new Set(metrics.map(metric => {
    const expression = asRecord(metric.expression)
    return typeof expression.fieldId === 'string' ? expression.fieldId : ''
  }).filter(Boolean)))
  const metricSourceFields = metricSourceFieldIds
    .filter(fieldId => !selectedFieldIds.has(fieldId))
    .map(fieldId => fieldById.get(fieldId))
    .filter((field): field is Record<string, unknown> => Boolean(field))

  if (metricSourceFields.length !== metricSourceFieldIds.filter(fieldId => !selectedFieldIds.has(fieldId)).length) {
    return { ok: false, error: 'Released semantic snapshot is missing metric source fields', fields, metrics, relationships, metricSourceFields }
  }

  const resolvedFieldById = new Map([...fields, ...metricSourceFields].map(field => [String(field.id), field]))
  for (const metric of metrics) {
    const expression = asRecord(metric.expression)
    const fieldId = typeof expression.fieldId === 'string' ? expression.fieldId : null
    const entityId = typeof metric.entity_id === 'string' ? metric.entity_id : null
    if (!fieldId || !resolvedFieldById.has(fieldId) || (entityId && !entityIds.has(entityId))) {
      return { ok: false, error: 'Released metric references invalid semantic inputs', fields, metrics, relationships, metricSourceFields }
    }
  }

  for (const relationship of relationships) {
    const joinConfig = asRecord(relationship.join_config)
    const fromEntityId = String(relationship.from_entity_id ?? '')
    const toEntityId = String(relationship.to_entity_id ?? '')
    const leftField = resolvedFieldById.get(String(joinConfig.leftFieldId ?? ''))
    const rightField = resolvedFieldById.get(String(joinConfig.rightFieldId ?? ''))
    if (!entityIds.has(fromEntityId)
      || !entityIds.has(toEntityId)
      || !leftField
      || !rightField
      || String(leftField.entity_id) !== fromEntityId
      || String(rightField.entity_id) !== toEntityId) {
      return { ok: false, error: 'Released relationship references invalid semantic inputs', fields, metrics, relationships, metricSourceFields }
    }
  }

  const sourceSchemaHashes = asRecord(snapshot.semanticSnapshot.sourceSchemaHashes)
  for (const field of resolvedFieldById.values()) {
    const sourceColumn = asRecord(field.source_column)
    const requiredKeys = ['dataSourceId', 'schemaName', 'tableName', 'columnName']
    if (!requiredKeys.every(key => typeof sourceColumn[key] === 'string' && String(sourceColumn[key]).trim().length > 0)) {
      return { ok: false, error: 'Released semantic fields contain incomplete source-column lineage', fields, metrics, relationships, metricSourceFields }
    }
    const dataSourceId = String(sourceColumn.dataSourceId)
    if (typeof sourceSchemaHashes[dataSourceId] !== 'string' || !String(sourceSchemaHashes[dataSourceId]).trim()) {
      return { ok: false, error: 'Released semantic fields are missing a captured source-schema contract', fields, metrics, relationships, metricSourceFields }
    }
  }

  return { ok: true, fields, metrics, relationships, metricSourceFields }
}

export function releasedSourceSchemaHash(snapshot: DashboardReleaseDatasetSnapshot, dataSourceId: string) {
  const hashes = releasedSourceSchemaContracts(snapshot)
  return typeof hashes[dataSourceId] === 'string' ? String(hashes[dataSourceId]) : null
}

export function releasedSourceSchemaContracts(snapshot: DashboardReleaseDatasetSnapshot) {
  const hashes = asRecord(snapshot.semanticSnapshot.sourceSchemaHashes)
  return Object.fromEntries(Object.entries(hashes)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0))
}

export function releasedDatasetCacheTtl(snapshot: DashboardReleaseDatasetSnapshot) {
  const cachePolicy = asRecord(snapshot.datasetConfig.cache_policy)
  return typeof cachePolicy.ttlSeconds === 'number' ? cachePolicy.ttlSeconds : 300
}
