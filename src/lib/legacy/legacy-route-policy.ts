export const LEGACY_UI_ROUTES = [
  '/api-config',
  '/auth-flow',
  '/builder',
  '/dashboard',
  '/monitoring',
  '/pdf-export',
  '/view',
  '/workspaces',
] as const

export const LEGACY_PUBLIC_SHARE_ROUTES = ['/view'] as const

export function legacyUiRoutesEnabled() {
  return process.env.DASHBOARDOS_ENABLE_LEGACY_ROUTES === 'true'
}

export function isLegacyUiRoute(pathname: string) {
  return LEGACY_UI_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
}

export function isLegacyPublicShareRoute(pathname: string) {
  return LEGACY_PUBLIC_SHARE_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
}
