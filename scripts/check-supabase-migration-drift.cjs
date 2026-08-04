/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process')

const SUPABASE_CLI_VERSION = '2.109.1'
const VERSION_PATTERN = /^\d{14}$/

function clean(value) {
  return value
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/`/g, '')
    .trim()
}

function parseMigrationList(output) {
  const jsonPayload = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.startsWith('{"migrations":'))
  let rows
  if (jsonPayload) {
    const parsed = JSON.parse(jsonPayload)
    rows = Array.isArray(parsed.migrations)
      ? parsed.migrations.map(row => ({
          local: VERSION_PATTERN.test(String(row.local ?? '')) ? String(row.local) : null,
          remote: VERSION_PATTERN.test(String(row.remote ?? '')) ? String(row.remote) : null,
        })).filter(row => row.local || row.remote)
      : []
  } else {
    rows = output
      .split(/\r?\n/)
      .filter(line => line.includes('|'))
      .map(line => line.split('|').map(clean))
      .filter(parts => parts.length >= 2)
      .map(([local, remote]) => ({
        local: VERSION_PATTERN.test(local) ? local : null,
        remote: VERSION_PATTERN.test(remote) ? remote : null,
      }))
      .filter(row => row.local || row.remote)
  }

  return {
    rows,
    localOnly: rows.filter(row => row.local && !row.remote).map(row => row.local),
    remoteOnly: rows.filter(row => row.remote && !row.local).map(row => row.remote),
    mismatched: rows
      .filter(row => row.local && row.remote && row.local !== row.remote)
      .map(row => ({ local: row.local, remote: row.remote })),
  }
}

function printVersions(label, versions) {
  if (versions.length === 0) return
  console.error(`${label} (${versions.length}):`)
  for (const version of versions) console.error(`  - ${version}`)
}

function main() {
  const result = spawnSync(
    'npx',
    [
      '--yes',
      `supabase@${SUPABASE_CLI_VERSION}`,
      '--output-format',
      'json',
      'migration',
      'list',
      '--linked',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  if (result.error || result.status !== 0) {
    console.error('Unable to inspect linked Supabase migration history.')
    console.error(result.error?.message ?? (result.stderr.trim() || 'Supabase CLI exited without diagnostics.'))
    process.exit(2)
  }

  const parsed = parseMigrationList(`${result.stdout}\n${result.stderr}`)
  if (parsed.rows.length === 0) {
    console.error('Supabase returned no parseable migration rows; refusing to report a false clean state.')
    console.error((result.stderr || result.stdout).trim() || 'The CLI produced no output.')
    process.exit(2)
  }

  if (
    parsed.localOnly.length > 0
    || parsed.remoteOnly.length > 0
    || parsed.mismatched.length > 0
  ) {
    console.error('Supabase migration drift detected.')
    printVersions('Local-only versions', parsed.localOnly)
    printVersions('Remote-only versions', parsed.remoteOnly)
    for (const mismatch of parsed.mismatched) {
      console.error(`Mismatched row: local ${mismatch.local}, remote ${mismatch.remote}`)
    }
    console.error('Do not run db push until schema equivalence is verified and history is reconciled deliberately.')
    process.exit(1)
  }

  console.log(`Supabase migration history is aligned (${parsed.rows.length} versions).`)
}

module.exports = { parseMigrationList }

if (require.main === module) main()
