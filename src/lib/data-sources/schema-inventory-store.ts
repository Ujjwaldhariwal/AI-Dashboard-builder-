import type { SupabaseClient } from '@supabase/supabase-js'

import { buildSchemaInventorySummary } from '@/lib/data-sources/schema-inventory'
import type {
  DataSourceRelationInventoryItem,
  DataSourceRelationSelectionStatus,
  DataSourceRelationType,
  DataSourceSchemaInventory,
  DataSourceSchemaScopeStatus,
} from '@/types/data-source'

export function isMissingSchemaInventory(message: string) {
  return /data_source_relations|data_source_relation_selections|schema_scope_status|schema_object_count/i.test(message)
    && /does not exist|schema cache|could not find/i.test(message)
}

export async function loadDataSourceSchemaInventory({
  supabase,
  dataSourceId,
}: {
  supabase: SupabaseClient
  dataSourceId: string
}): Promise<DataSourceSchemaInventory> {
  const [sourceResult, relationResult, selectionResult, columnResult] = await Promise.all([
    supabase
      .from('data_sources')
      .select('id, schema_hash, schema_scope_status, connection_config')
      .eq('id', dataSourceId)
      .single(),
    supabase
      .from('data_source_relations')
      .select('id, data_source_id, schema_name, relation_name, relation_type, column_count, estimated_row_count, comment, fingerprint, classification, reason_code, reason, is_available, first_discovered_at, last_discovered_at')
      .eq('data_source_id', dataSourceId)
      .order('schema_name', { ascending: true })
      .order('relation_name', { ascending: true }),
    supabase
      .from('data_source_relation_selections')
      .select('relation_id, status, decision_source, reason_code, reason_note')
      .eq('data_source_id', dataSourceId),
    supabase
      .from('data_source_columns')
      .select('id, relation_id, column_name, data_type, ordinal_position')
      .eq('data_source_id', dataSourceId)
      .order('ordinal_position', { ascending: true }),
  ])

  if (sourceResult.error || !sourceResult.data) throw new Error(sourceResult.error?.message ?? 'Data source not found')
  if (relationResult.error) throw new Error(relationResult.error.message)
  if (selectionResult.error) throw new Error(selectionResult.error.message)
  if (columnResult.error) throw new Error(columnResult.error.message)

  const selections = new Map((selectionResult.data ?? []).map(row => [String(row.relation_id), row as Record<string, unknown>]))
  const columnsByRelation = new Map<string, DataSourceRelationInventoryItem['columns']>()
  for (const row of columnResult.data ?? []) {
    if (!row.relation_id) continue
    const relationId = String(row.relation_id)
    columnsByRelation.set(relationId, [...(columnsByRelation.get(relationId) ?? []), {
      id: String(row.id),
      name: String(row.column_name ?? ''),
      dataType: String(row.data_type ?? ''),
      ordinalPosition: Number(row.ordinal_position ?? 0),
    }])
  }
  const relations: DataSourceRelationInventoryItem[] = (relationResult.data ?? []).map(row => {
    const selection = selections.get(String(row.id)) ?? {}
    return {
      id: String(row.id),
      dataSourceId: String(row.data_source_id),
      schemaName: String(row.schema_name ?? ''),
      relationName: String(row.relation_name ?? ''),
      relationType: String(row.relation_type ?? 'table') as DataSourceRelationType,
      columnCount: Number(row.column_count ?? 0),
      estimatedRowCount: row.estimated_row_count === null ? null : Number(row.estimated_row_count),
      comment: typeof row.comment === 'string' ? row.comment : null,
      fingerprint: String(row.fingerprint ?? ''),
      classification: String(row.classification ?? 'needs_review') as DataSourceRelationInventoryItem['classification'],
      reasonCode: String(selection.reason_code ?? row.reason_code ?? 'unclassified'),
      reason: String(selection.reason_note ?? row.reason ?? 'Review this database object.'),
      selectionStatus: String(selection.status ?? 'review') as DataSourceRelationSelectionStatus,
      decisionSource: String(selection.decision_source ?? 'system_rule') as DataSourceRelationInventoryItem['decisionSource'],
      available: Boolean(row.is_available),
      firstDiscoveredAt: String(row.first_discovered_at ?? new Date().toISOString()),
      lastDiscoveredAt: String(row.last_discovered_at ?? new Date().toISOString()),
      columns: columnsByRelation.get(String(row.id)) ?? [],
    }
  })

  const source = sourceResult.data as Record<string, unknown>
  const config = source.connection_config && typeof source.connection_config === 'object' && !Array.isArray(source.connection_config)
    ? source.connection_config as Record<string, unknown>
    : {}
  const scopeStatus = String(source.schema_scope_status ?? 'unconfirmed') as DataSourceSchemaScopeStatus
  const summary = buildSchemaInventorySummary(relations, scopeStatus)

  return {
    dataSourceId,
    inventoryHash: typeof source.schema_hash === 'string' ? source.schema_hash : null,
    selectedSchemas: Array.isArray(config.schemas) ? config.schemas.map(String) : ['public'],
    summary,
    relations,
    reviewRequired: scopeStatus !== 'confirmed'
      || summary.reviewObjectCount > 0
      || relations.some(relation => relation.available && relation.decisionSource === 'compatibility_migration'),
  }
}
