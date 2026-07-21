import { createHash } from 'node:crypto'

import type { PostgresTableMetadata } from '@/lib/data-sources/postgres-runtime'
import type {
  DataSourceRelationClassification,
  DataSourceRelationSelectionStatus,
  DataSourceRelationType,
  DataSourceSchemaInventorySummary,
  DataSourceSchemaScopeStatus,
} from '@/types/data-source'

const MIGRATION_RELATION_RE = /(^|_)(prisma|knex|sequelize|typeorm|flyway|liquibase|schema)_?migrations?($|_)/i
const SUPPORT_RELATION_RE = /(^|_)(audits?|events?|logs?|history|histories|staging|stage|temp|tmp|backups?|archives?|queues?|jobs?|caches?)($|_)/i

export interface SchemaRelationClassificationResult {
  classification: DataSourceRelationClassification
  suggestedStatus: DataSourceRelationSelectionStatus
  reasonCode: string
  reason: string
}

export interface SchemaInventoryRelationInput {
  schema_name: string
  relation_name: string
  relation_type: DataSourceRelationType
  column_count: number
  estimated_row_count: number | null
  comment: string | null
  fingerprint: string
  classification: DataSourceRelationClassification
  suggested_status: DataSourceRelationSelectionStatus
  reason_code: string
  reason: string
}

export function postgresRelationType(tableType: string, relationKind?: string | null): DataSourceRelationType {
  if (relationKind === 'p') return 'partitioned_table'
  if (relationKind === 'm') return 'materialized_view'
  if (relationKind === 'f') return 'foreign_table'
  if (relationKind === 'v' || /view/i.test(tableType)) return 'view'
  return 'table'
}

export function classifySchemaRelation({
  schemaName,
  relationName,
  relationType,
}: {
  schemaName: string
  relationName: string
  relationType: DataSourceRelationType
}): SchemaRelationClassificationResult {
  if (['pg_catalog', 'information_schema'].includes(schemaName) || schemaName.startsWith('pg_')) {
    return {
      classification: 'internal',
      suggestedStatus: 'excluded',
      reasonCode: 'system_schema',
      reason: 'PostgreSQL system metadata is not analytics data.',
    }
  }

  if (MIGRATION_RELATION_RE.test(relationName)) {
    return {
      classification: 'internal',
      suggestedStatus: 'excluded',
      reasonCode: 'migration_history',
      reason: 'Migration history tables are excluded from analytics by default.',
    }
  }

  if (relationType !== 'table' && relationType !== 'partitioned_table') {
    return {
      classification: 'needs_review',
      suggestedStatus: 'review',
      reasonCode: `${relationType}_review`,
      reason: 'Views and external relations require confirmation before semantic use.',
    }
  }

  if (SUPPORT_RELATION_RE.test(relationName)) {
    return {
      classification: 'needs_review',
      suggestedStatus: 'review',
      reasonCode: 'support_table_name',
      reason: 'The name suggests operational, historical, staging, or support data.',
    }
  }

  return {
    classification: 'business_candidate',
    suggestedStatus: 'review',
    reasonCode: 'base_table_candidate',
    reason: 'Readable base table; confirm that it belongs in the analytics scope.',
  }
}

export function relationFingerprint(table: PostgresTableMetadata) {
  const canonical = {
    schemaName: table.schemaName,
    tableName: table.tableName,
    relationType: postgresRelationType(table.tableType, table.relationKind),
    columns: table.columns.map(column => ({
      name: column.columnName,
      ordinal: column.ordinalPosition,
      dataType: column.dataType,
      udtName: column.udtName,
      nullable: column.isNullable,
      primaryKey: Boolean(column.isPrimaryKey),
      unique: Boolean(column.isUnique),
    })),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export function buildSchemaInventoryRelations(tables: PostgresTableMetadata[]): SchemaInventoryRelationInput[] {
  return tables.map(table => {
    const relationType = postgresRelationType(table.tableType, table.relationKind)
    const classification = classifySchemaRelation({
      schemaName: table.schemaName,
      relationName: table.tableName,
      relationType,
    })
    return {
      schema_name: table.schemaName,
      relation_name: table.tableName,
      relation_type: relationType,
      column_count: table.columns.length,
      estimated_row_count: table.estimatedRowCount ?? null,
      comment: table.comment ?? null,
      fingerprint: relationFingerprint(table),
      classification: classification.classification,
      suggested_status: classification.suggestedStatus,
      reason_code: classification.reasonCode,
      reason: classification.reason,
    }
  })
}

export function buildSchemaInventorySummary(relations: Array<{
  relationType: DataSourceRelationType
  columnCount: number
  selectionStatus: DataSourceRelationSelectionStatus
  available?: boolean
}>, scopeStatus?: DataSourceSchemaScopeStatus): DataSourceSchemaInventorySummary {
  const available = relations.filter(relation => relation.available !== false)
  const included = available.filter(relation => relation.selectionStatus === 'included')
  const excluded = available.filter(relation => relation.selectionStatus === 'excluded')
  const review = available.filter(relation => relation.selectionStatus === 'review')
  return {
    discoveredObjectCount: available.length,
    discoveredTableCount: available.filter(relation => relation.relationType === 'table' || relation.relationType === 'partitioned_table').length,
    discoveredViewCount: available.filter(relation => relation.relationType === 'view' || relation.relationType === 'materialized_view').length,
    discoveredColumnCount: available.reduce((total, relation) => total + relation.columnCount, 0),
    includedObjectCount: included.length,
    includedColumnCount: included.reduce((total, relation) => total + relation.columnCount, 0),
    excludedObjectCount: excluded.length,
    reviewObjectCount: review.length,
    scopeStatus: scopeStatus ?? (review.length > 0 ? 'review_required' : 'confirmed'),
  }
}
