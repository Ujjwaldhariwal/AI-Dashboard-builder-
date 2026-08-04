import { expect, test } from '@playwright/test'

import { parseMigrationList } from '../scripts/check-supabase-migration-drift.cjs'

test.describe('Supabase migration drift guard', () => {
  test('parses aligned CLI migration output', () => {
    const parsed = parseMigrationList(`
      Local            | Remote           | Time (UTC)
      -----------------|------------------|--------------------
      20260312140252   | 20260312140252   | 2026-03-12 14:02:52
      \`20260318153000\` | \`20260318153000\` | 2026-03-18 15:30:00
    `)

    expect(parsed.rows).toHaveLength(2)
    expect(parsed.localOnly).toEqual([])
    expect(parsed.remoteOnly).toEqual([])
    expect(parsed.mismatched).toEqual([])
  })

  test('separates local-only, remote-only, and mismatched versions', () => {
    const parsed = parseMigrationList(`
      Local            | Remote
      20260716090000   |
                       | 20260724064840
      20260724080106   | 20260724080133
    `)

    expect(parsed.localOnly).toEqual(['20260716090000'])
    expect(parsed.remoteOnly).toEqual(['20260724064840'])
    expect(parsed.mismatched).toEqual([
      { local: '20260724080106', remote: '20260724080133' },
    ])
  })
})
