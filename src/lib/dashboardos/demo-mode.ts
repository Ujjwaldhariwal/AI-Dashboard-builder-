export const DASHBOARDOS_DEMO_COOKIE = 'dashboardos_demo'

export function isLocalDemoHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname)
}

export function isDashboardOsDemoMode() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const hasDemoParam = params.get('demo') === '1'
  const hasDemoCookie = document.cookie
    .split(';')
    .some(cookie => cookie.trim() === `${DASHBOARDOS_DEMO_COOKIE}=1`)
  return isLocalDemoHost(window.location.hostname) && (hasDemoParam || hasDemoCookie)
}

export function enableDashboardOsDemoMode() {
  if (typeof window === 'undefined' || !isLocalDemoHost(window.location.hostname)) return
  document.cookie = `${DASHBOARDOS_DEMO_COOKIE}=1; path=/; max-age=21600; SameSite=Lax`
}
