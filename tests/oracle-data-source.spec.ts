import { expect, test } from '@playwright/test'

import { mapDataSource } from '../src/lib/data-sources/data-source-mapper'
import {
  oracleConnectString,
  resolveOracleSchemaScope,
} from '../src/lib/data-sources/oracle-runtime'
import { compileDatasetQueryPlan } from '../src/lib/semantic/dataset-query-compiler'
import type { OracleCredentialInput } from '../src/types/data-source'

const credential: OracleCredentialInput = {
  host: 'db.internal.example',
  port: 1521,
  database: 'MDMDB',
  username: 'dashuser',
  password: 'not-a-real-secret',
  connectType: 'sid',
  schemas: ['DASHUSER'],
}

const sourceField = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Account Status',
  source_column: {
    dataSourceId: '99999999-9999-4999-8999-999999999999',
    schemaName: 'DASHUSER',
    tableName: 'ACCOUNTS',
    columnName: 'STATUS',
    dataType: 'VARCHAR2',
  },
}

test.describe('Oracle data source adapter', () => {
  test('builds explicit SID and service-name connect descriptors', () => {
    expect(oracleConnectString(credential)).toContain('(SID=MDMDB)')
    expect(oracleConnectString({ ...credential, connectType: 'service_name' })).toContain('(SERVICE_NAME=MDMDB)')
    expect(oracleConnectString(credential)).not.toContain(credential.password)
  })

  test('normalizes and bounds the Oracle schema scope', () => {
    expect(resolveOracleSchemaScope({ username: 'dashuser' })).toEqual(['DASHUSER'])
    expect(resolveOracleSchemaScope({ username: 'dashuser', schemas: ['mdm', ' dashuser ', 'MDM'] }))
      .toEqual(['MDM', 'DASHUSER'])
    expect(() => resolveOracleSchemaScope({ username: 'dashuser', schemas: ['bad schema'] })).toThrow('Invalid Oracle schema')
  })

  test('compiles governed Oracle SQL with binds and Oracle row limiting', () => {
    const compiled = compileDatasetQueryPlan({
      fields: [sourceField],
      metrics: [],
      relationships: [],
      dialect: 'oracle',
      filters: [{ fieldId: sourceField.id, operator: 'contains', value: 'open' }],
    })

    expect(compiled.queryPlan.dialect).toBe('oracle')
    expect(compiled.queryPlan.executableSql).toContain('lower(cast("t1"."STATUS" as varchar2(4000)))')
    expect(compiled.queryPlan.executableSql).toContain('lower(:1)')
    expect(compiled.queryPlan.executableSql).toContain('fetch first 500 rows only')
    expect(compiled.queryPlan.executableSql).not.toContain(' ilike ')
    expect(compiled.queryPlan.executableSql).not.toContain(' limit ')
    expect(compiled.parameters).toEqual(['open'])
  })

  test('maps stored Oracle source configuration without exposing credentials', () => {
    const mapped = mapDataSource({
      id: 'source-id',
      tenant_id: 'tenant-id',
      project_id: 'project-id',
      name: 'UAT Oracle',
      type: 'oracle',
      connection_config: {
        host: 'db.internal.example',
        port: 1521,
        database: 'MDMDB',
        username: 'dashuser',
        connectType: 'sid',
        schemas: ['DASHUSER'],
      },
      credential_key_id: 'key-id',
      status: 'active',
      created_at: '2026-08-03T00:00:00.000Z',
      updated_at: '2026-08-03T00:00:00.000Z',
    })

    expect(mapped.type).toBe('oracle')
    expect(mapped.connectionConfig).toMatchObject({ database: 'MDMDB', connectType: 'sid' })
    expect(mapped.connectionConfig).not.toHaveProperty('password')
  })
})
