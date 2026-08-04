import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

test.describe('Supabase trigger function hardening', () => {
  test('removes trigger-only functions from the Data API RPC surface', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260724064718_harden_trigger_function_execution.sql'),
      'utf8',
    )

    expect(migration).toContain('alter function public.handle_new_user()')
    expect(migration).toContain('set search_path = public, pg_temp')
    expect(migration).toContain('revoke all on function public.handle_new_user()')
    expect(migration).toContain('revoke all on function public.set_ai_workflow_updated_at()')
    expect(migration).toContain('revoke all on function public.audit_ai_workflow_change()')
    expect(migration).toContain('revoke all on function public.set_schema_profile_updated_at()')
    expect(migration.match(/from public, anon, authenticated/g)).toHaveLength(4)
  })
})
