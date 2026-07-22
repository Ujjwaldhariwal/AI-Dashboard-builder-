export const IMMUTABLE_RELEASE_MIGRATION = '20260714160000_immutable_dashboard_releases.sql'

export const IMMUTABLE_RELEASE_SETUP_MESSAGE =
  `Apply ${IMMUTABLE_RELEASE_MIGRATION} in the AI Builder Supabase, then publish or reopen the dashboard.`

export function isMissingImmutableReleaseSchema(value: unknown) {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : null
  const code = typeof record?.code === 'string' ? record.code : ''
  const message = value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : typeof record?.message === 'string'
        ? record.message
        : ''
  const namesReleaseStorage = /dashboard_release_(chart|dataset)_snapshots|release_snapshot_status|publish_dashboard_version_immutable/i.test(message)

  return namesReleaseStorage && (
    code === 'PGRST204'
    || code === 'PGRST205'
    || /does not exist|schema cache|could not find/i.test(message)
  )
}
