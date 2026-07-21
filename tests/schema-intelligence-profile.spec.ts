import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

import {
  buildPostgresSchemaIntrospectionResult,
  resolvePostgresSchemaScope,
  type PostgresSchemaRow,
  type PostgresTableMetadata,
} from '../src/lib/data-sources/postgres-runtime'
import {
  buildSchemaColumnProfile,
  buildSchemaIntelligenceProfile,
  maskSchemaSampleValue,
  type SchemaForeignKeyEvidence,
  type SchemaProfileTableInput,
} from '../src/lib/data-sources/schema-profile'
import { schemaHashForTables } from '../src/lib/data-sources/schema-introspection-runner'

function electricityTables(): SchemaProfileTableInput[] {
  return [
    {
      schemaName: 'public',
      tableName: 'electricity_customers',
      tableType: 'BASE TABLE',
      comment: 'Customer master data',
      estimatedRowCount: 5,
      columns: [
        { schemaName: 'public', tableName: 'electricity_customers', columnName: 'customer_id', dataType: 'integer', udtName: 'int4', isNullable: false, isPrimaryKey: true, isUnique: true, isIndexed: true },
        { schemaName: 'public', tableName: 'electricity_customers', columnName: 'customer_name', dataType: 'text', udtName: 'text', isNullable: false },
        { schemaName: 'public', tableName: 'electricity_customers', columnName: 'email', dataType: 'text', udtName: 'text', isNullable: true },
        { schemaName: 'public', tableName: 'electricity_customers', columnName: 'city', dataType: 'text', udtName: 'text', isNullable: false },
      ],
    },
    {
      schemaName: 'public',
      tableName: 'electricity_readings',
      tableType: 'BASE TABLE',
      estimatedRowCount: 20,
      columns: [
        { schemaName: 'public', tableName: 'electricity_readings', columnName: 'reading_id', dataType: 'bigint', udtName: 'int8', isNullable: false, isPrimaryKey: true, isUnique: true, isIndexed: true },
        { schemaName: 'public', tableName: 'electricity_readings', columnName: 'customer_id', dataType: 'integer', udtName: 'int4', isNullable: false, isIndexed: true },
        { schemaName: 'public', tableName: 'electricity_readings', columnName: 'reading_at', dataType: 'timestamp with time zone', udtName: 'timestamptz', isNullable: false },
        { schemaName: 'public', tableName: 'electricity_readings', columnName: 'kwh', dataType: 'numeric', udtName: 'numeric', isNullable: true },
      ],
    },
  ]
}

const electricityForeignKey: SchemaForeignKeyEvidence = {
  constraintName: 'electricity_readings_customer_id_fkey',
  sourceSchema: 'public',
  sourceTable: 'electricity_readings',
  sourceColumn: 'customer_id',
  targetSchema: 'public',
  targetTable: 'electricity_customers',
  targetColumn: 'customer_id',
}

test.describe('schema intelligence profiling', () => {
  test('defaults schema discovery to public and validates explicit allowlists', () => {
    expect(resolvePostgresSchemaScope({})).toEqual(['public'])
    expect(resolvePostgresSchemaScope({ schemas: ['analytics', 'public', 'analytics'] })).toEqual(['analytics', 'public'])
    expect(() => resolvePostgresSchemaScope({ schemas: ['public; drop schema public'] })).toThrow(/Invalid Postgres schema name/)
  })

  test('preserves structural key, comment, and scope evidence in introspection results', () => {
    const rows: PostgresSchemaRow[] = [{
      schemaName: 'public',
      tableName: 'electricity_customers',
      tableType: 'BASE TABLE',
      tableComment: 'Customer master data',
      estimatedRowCount: 5,
      columnName: 'customer_id',
      ordinalPosition: 1,
      dataType: 'integer',
      udtName: 'int4',
      isNullable: false,
      columnDefault: null,
      comment: 'Stable customer key',
      isPrimaryKey: true,
      isUnique: true,
      isIndexed: true,
    }]
    const result = buildPostgresSchemaIntrospectionResult(rows, {}, {
      selectedSchemas: ['public'],
      foreignKeys: [electricityForeignKey],
    })
    expect(result.selectedSchemas).toEqual(['public'])
    expect(result.tables).toHaveLength(1)
    expect(result.tables[0].comment).toBe('Customer master data')
    expect(result.tables[0].columns[0]).toMatchObject({ isPrimaryKey: true, isUnique: true, isIndexed: true })
    expect(result.foreignKeys).toEqual([electricityForeignKey])
  })

  test('computes bounded statistics while masking identifiers and personal values', () => {
    const emailColumn = electricityTables()[0].columns[2]
    const profile = buildSchemaColumnProfile(emailColumn, [
      { email: 'alice@example.com' },
      { email: 'bob@example.com' },
      { email: null },
    ])
    expect(profile.sensitivity).toBe('personal')
    expect(profile.nullPercent).toBeCloseTo(33.33, 2)
    expect(profile.approximateDistinctCount).toBe(2)
    expect(profile.maskedExamples).toEqual(['a***@example.com', 'b***@example.com'])
    expect(JSON.stringify(profile)).not.toContain('alice@example.com')
    expect(maskSchemaSampleValue('super-secret', 'secret')).toBe('[REDACTED]')
  })

  test('profiles the two-table electricity schema and uses declared foreign-key evidence', () => {
    const profile = buildSchemaIntelligenceProfile({
      selectedSchemas: ['public'],
      tables: electricityTables(),
      foreignKeys: [electricityForeignKey],
      sampledRows: new Map([
        ['public.electricity_customers', [
          { customer_id: 1, customer_name: 'Green Homes', email: 'ops@green.example', city: 'Lucknow' },
          { customer_id: 2, customer_name: 'Metro Mall', email: null, city: 'Kanpur' },
        ]],
        ['public.electricity_readings', [
          { reading_id: 10, customer_id: 1, reading_at: '2026-07-01T00:00:00Z', kwh: 18.5 },
          { reading_id: 11, customer_id: 1, reading_at: '2026-07-02T00:00:00Z', kwh: 21.25 },
          { reading_id: 12, customer_id: 2, reading_at: '2026-07-02T00:00:00Z', kwh: null },
        ]],
      ]),
    })
    expect(profile.summary).toMatchObject({ tableCount: 2, columnCount: 8, explicitJoinCount: 1 })
    expect(profile.joinCandidates[0]).toMatchObject({
      sourceTable: 'electricity_readings',
      targetTable: 'electricity_customers',
      evidence: 'foreign_key',
      confidence: 100,
      relationship: 'many_to_one',
    })
    const kwh = profile.columnProfiles.find(column => column.columnName === 'kwh')
    expect(kwh).toMatchObject({ semanticType: 'numeric', minimum: '18.5', maximum: '21.25' })

    const inferredProfile = buildSchemaIntelligenceProfile({
      selectedSchemas: ['public'],
      tables: electricityTables(),
      foreignKeys: [],
      sampledRows: new Map([
        ['public.electricity_customers', [{ customer_id: 1 }, { customer_id: 2 }]],
        ['public.electricity_readings', [{ customer_id: 1 }, { customer_id: 1 }, { customer_id: 2 }]],
      ]),
    })
    expect(inferredProfile.joinCandidates[0]).toMatchObject({ evidence: 'name_and_type', confidence: 90 })
    expect(inferredProfile.joinCandidates[0].reasons).toContain('100% sampled key overlap')
  })

  test('changes the structural schema hash when key evidence changes', () => {
    const base = electricityTables() as PostgresTableMetadata[]
    const changed = structuredClone(base)
    changed[0].columns[0].isPrimaryKey = false
    changed[0].columns[0].isUnique = false
    expect(schemaHashForTables(base)).not.toBe(schemaHashForTables(changed))
    expect(schemaHashForTables(base)).not.toBe(schemaHashForTables(base, [electricityForeignKey]))
  })

  test('migration stores versioned masked profiles behind scoped RLS without authenticated delete', () => {
    const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260716110000_schema_intelligence_profiles.sql'), 'utf8')
    expect(migration).toContain('create table if not exists data_source_schema_profiles')
    expect(migration).toContain('unique (data_source_id, schema_hash, profile_version)')
    expect(migration).toContain('alter table data_source_schema_profiles enable row level security')
    expect(migration).toContain('has_project_access(project_id)')
    expect(migration).toContain('can_publish_project(project_id)')
    expect(migration).toContain('Only bounded statistics and masked examples are stored')
    expect(migration).not.toMatch(/grant\s+delete\s+on\s+data_source_schema_profiles\s+to\s+authenticated/i)
  })
})
