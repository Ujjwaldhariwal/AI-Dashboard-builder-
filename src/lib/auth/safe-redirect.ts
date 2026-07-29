export function resolveSafeInternalRedirect(
  value: string | null | undefined,
  fallback = '/admin',
): string {
  if (!value) return fallback

  const candidate = value.trim()
  if (
    !candidate.startsWith('/')
    || candidate.startsWith('//')
    || candidate.includes('\\')
    || /[\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return fallback
  }

  try {
    const parsed = new URL(candidate, 'https://dashboardos.invalid')
    if (parsed.origin !== 'https://dashboardos.invalid') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
