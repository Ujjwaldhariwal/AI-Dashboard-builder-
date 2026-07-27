import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260727074113_provision_default_tenant_capabilities.sql',
)

test.describe('tenant capability provisioning migration', () => {
  test('provisions every runtime capability for newly active tenants', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('security invoker')
    expect(migration).not.toContain('security definer')
    expect(migration).toContain('after insert or update of status on public.tenants')
    expect(migration).toContain("when (new.status = 'active')")

    for (const capability of [
      'ai_chat',
      'client_runtime',
      'dataset_preview',
      'report_exports',
    ]) {
      expect(migration).toContain(`'${capability}'`)
    }
  })

  test('backfills active tenants without overwriting explicit feature flags', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('from public.tenants as tenant')
    expect(migration).toContain("where tenant.status = 'active'")
    expect(migration).toContain('on conflict (tenant_id, capability) do nothing')
    expect(migration).not.toContain('do update set enabled')
  })
})
