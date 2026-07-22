export const GUIDED_REVIEW_STATE_MIGRATION = '20260713090000_guided_review_state.sql'

export const GUIDED_REVIEW_SETUP_MESSAGE =
  `Apply ${GUIDED_REVIEW_STATE_MIGRATION} in the AI Builder Supabase, then retry.`

export function isMissingGuidedReviewSchema(value: unknown) {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : null
  const code = typeof record?.code === 'string' ? record.code : ''
  const message = value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : typeof record?.message === 'string'
        ? record.message
        : ''

  return code === 'PGRST205'
    || /relation .*guided_schema_profiles.* does not exist|could not find the table .*guided_schema_profiles.*schema cache/i.test(message)
}
