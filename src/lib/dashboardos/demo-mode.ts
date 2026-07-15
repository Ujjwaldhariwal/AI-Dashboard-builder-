export const DASHBOARDOS_DEMO_COOKIE = 'dashboardos_demo'
export const DASHBOARDOS_PREPARED_DEMO_HOSTS = [
  'ai-dashboard-builder-1hbh.vercel.app',
] as const

export function isLocalDemoHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname)
}

export function isDashboardOsDemoHost(
  hostname: string,
  hostedDemoEnabled = process.env.NEXT_PUBLIC_DASHBOARDOS_DEMO_ENABLED === 'true',
) {
  const normalizedHostname = hostname.trim().toLowerCase()
  return isLocalDemoHost(normalizedHostname)
    || DASHBOARDOS_PREPARED_DEMO_HOSTS.includes(normalizedHostname as typeof DASHBOARDOS_PREPARED_DEMO_HOSTS[number])
    || hostedDemoEnabled
}

export function shouldUseDashboardOsDemoRuntime({
  hostname,
  cookieValue,
  tenantSlug,
  isAuthenticated,
  hostedDemoEnabled,
}: {
  hostname: string
  cookieValue?: string
  tenantSlug: string
  isAuthenticated: boolean
  hostedDemoEnabled?: boolean
}) {
  return isAuthenticated
    && cookieValue === '1'
    && ['demo', 'northstar-retail'].includes(tenantSlug)
    && isDashboardOsDemoHost(hostname, hostedDemoEnabled)
}

export function isDashboardOsDemoMode() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const hasDemoParam = params.get('demo') === '1'
  const hasDemoCookie = document.cookie
    .split(';')
    .some(cookie => cookie.trim() === `${DASHBOARDOS_DEMO_COOKIE}=1`)
  return isDashboardOsDemoHost(window.location.hostname) && (hasDemoParam || hasDemoCookie)
}

export function enableDashboardOsDemoMode() {
  if (typeof window === 'undefined' || !isDashboardOsDemoHost(window.location.hostname)) return
  if (new URLSearchParams(window.location.search).get('demo') !== '1') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${DASHBOARDOS_DEMO_COOKIE}=1; path=/; max-age=21600; SameSite=Lax${secure}`
}
