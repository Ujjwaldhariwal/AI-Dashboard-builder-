import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

import type { PostgresTableMetadata } from '../src/lib/data-sources/postgres-runtime'
import {
  buildSchemaInventoryRelations,
  buildSchemaInventorySummary,
  classifySchemaRelation,
  postgresRelationType,
  relationFingerprint,
} from '../src/lib/data-sources/schema-inventory'
import { validateSelectedSourceColumn } from '../src/lib/semantic/semantic-hardening'

function relation(
  tableName: string,
  columnCount: number,
  options: { tableType?: string; relationKind?: string } = {},
): PostgresTableMetadata {
  return {
    schemaName: 'public',
    tableName,
    tableType: options.tableType ?? 'BASE TABLE',
    relationKind: options.relationKind ?? 'r',
    columns: Array.from({ length: columnCount }, (_, index) => ({
      schemaName: 'public',
      tableName,
      columnName: index === 0 ? 'id' : `column_${index + 1}`,
      ordinalPosition: index + 1,
      dataType: index === 0 ? 'bigint' : 'text',
      udtName: index === 0 ? 'int8' : 'text',
      isNullable: index !== 0,
      isPrimaryKey: index === 0,
      isUnique: index === 0,
    })),
  }
}

const elevenObjectFixture = [
  relation('electricity_customers', 8),
  relation('electricity_readings', 8),
  relation('_prisma_migrations', 6),
  relation('knex_migrations', 6),
  relation('flyway_schema_history', 6),
  relation('customer_summary_view', 8, { tableType: 'VIEW', relationKind: 'v' }),
  relation('monthly_usage_view', 8, { tableType: 'VIEW', relationKind: 'v' }),
  relation('billing_status_view', 8, { tableType: 'VIEW', relationKind: 'v' }),
  relation('audit_events', 5),
  relation('import_logs', 5),
  relation('reading_history', 4),
]

test.describe('trustworthy schema discovery', () => {
  test('reconciles eleven fetched objects and seventy-two columns', () => {
    const inventory = buildSchemaInventoryRelations(elevenObjectFixture)
    expect(inventory).toHaveLength(11)
    expect(inventory.reduce((total, item) => total + item.column_count, 0)).toBe(72)

    const recommendedDecisions = inventory.map(item => ({
      relationType: item.relation_type,
      columnCount: item.column_count,
      selectionStatus: item.classification === 'business_candidate' ? 'included' as const : 'excluded' as const,
    }))
    const summary = buildSchemaInventorySummary(recommendedDecisions, 'confirmed')
    expect(summary).toEqual({
      discoveredObjectCount: 11,
      discoveredTableCount: 8,
      discoveredViewCount: 3,
      discoveredColumnCount: 72,
      includedObjectCount: 2,
      includedColumnCount: 16,
      excludedObjectCount: 9,
      reviewObjectCount: 0,
      scopeStatus: 'confirmed',
    })
  })

  test('uses deterministic explainable classification', () => {
    expect(classifySchemaRelation({ schemaName: 'public', relationName: 'electricity_readings', relationType: 'table' })).toMatchObject({
      classification: 'business_candidate',
      suggestedStatus: 'review',
      reasonCode: 'base_table_candidate',
    })
    expect(classifySchemaRelation({ schemaName: 'public', relationName: '_prisma_migrations', relationType: 'table' })).toMatchObject({
      classification: 'internal',
      suggestedStatus: 'excluded',
      reasonCode: 'migration_history',
    })
    expect(classifySchemaRelation({ schemaName: 'public', relationName: 'monthly_usage', relationType: 'view' })).toMatchObject({
      classification: 'needs_review',
      suggestedStatus: 'review',
      reasonCode: 'view_review',
    })
  })

  test('preserves Postgres relation kinds and structural fingerprints', () => {
    expect(postgresRelationType('BASE TABLE', 'p')).toBe('partitioned_table')
    expect(postgresRelationType('VIEW', 'v')).toBe('view')
    expect(postgresRelationType('BASE TABLE', 'f')).toBe('foreign_table')

    const base = relation('electricity_readings', 4)
    expect(relationFingerprint(base)).toBe(relationFingerprint(structuredClone(base)))
    const changed = structuredClone(base)
    changed.columns[1].dataType = 'numeric'
    expect(relationFingerprint(changed)).not.toBe(relationFingerprint(base))
  })

  test('migration separates inventory from governed selection and provides atomic RPCs', () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20260721120000_trustworthy_schema_inventory.sql'),
      'utf8',
    )
    expect(migration).toContain('create table if not exists data_source_relations')
    expect(migration).toContain('create table if not exists data_source_relation_selections')
    expect(migration).toContain('apply_data_source_schema_inventory_atomic')
    expect(migration).toContain('confirm_data_source_schema_selection')
    expect(migration).toContain('schema_scope_status')
    expect(migration).toContain('enable row level security')
  })

  test('semantic mapping accepts only columns from included relations', async () => {
    function fakeSupabase(status: 'included' | 'excluded' | 'review') {
      return {
        from(table: string) {
          const result = table === 'data_source_columns'
            ? { data: { id: 'column-id', relation_id: 'relation-id' }, error: null }
            : { data: { status }, error: null }
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => result,
          }
          return chain
        },
      }
    }

    const input = {
      tenantId: 'tenant-id',
      projectId: 'project-id',
      dataSourceId: 'source-id',
      schemaName: 'public',
      tableName: 'electricity_readings',
      columnName: 'kwh',
    }
    await expect(validateSelectedSourceColumn({ ...input, supabase: fakeSupabase('included') as never })).resolves.toMatchObject({ ok: true })
    await expect(validateSelectedSourceColumn({ ...input, supabase: fakeSupabase('excluded') as never })).resolves.toEqual({
      ok: false,
      error: 'Table is not included in the confirmed analytics scope: public.electricity_readings',
    })
  })
})
