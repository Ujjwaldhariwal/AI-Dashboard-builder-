export type HostnameKind = 'platform' | 'tenant-subdomain' | 'external-tenant' | 'local'

export interface HostnamePolicy {
  hostname: string
  kind: HostnameKind
  tenantSlug: string | null
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function normalizeConfiguredHostname(value: string) {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return stripPort(url.host)
  } catch {
    return stripPort(trimmed)
  }
}

function stripPort(host: string) {
  if (host.startsWith('[')) return host.replace(/^\[|\](?::\d+)?$/g, '')
  return host.split(':')[0] ?? ''
}

function splitHostnameList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map(normalizeConfiguredHostname)
    .filter((hostname): hostname is string => Boolean(hostname))
}

function getPlatformHostnames() {
  return new Set([
    ...splitHostnameList(process.env.DASHBOARDOS_PLATFORM_HOSTNAMES),
    ...splitHostnameList(process.env.NEXT_PUBLIC_APP_URL),
  ])
}

function getTenantRootDomains() {
  return splitHostnameList(process.env.DASHBOARDOS_TENANT_ROOT_DOMAINS)
}

function isLocalHostname(hostname: string) {
  if (!hostname) return true
  return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')
}

function tenantSlugFromSubdomain(hostname: string, rootDomain: string) {
  if (hostname === rootDomain || !hostname.endsWith(`.${rootDomain}`)) return null

  const prefix = hostname.slice(0, -rootDomain.length - 1)
  if (!prefix || prefix.includes('.')) return null
  if (!TENANT_SLUG_PATTERN.test(prefix)) return null
  return prefix
}

export function normalizeRequestHostname(host: string | null) {
  const firstHost = host?.split(',')[0]?.trim().toLowerCase() ?? ''
  if (!firstHost) return ''
  return stripPort(firstHost)
}

export function resolveHostnamePolicy(hostname: string): HostnamePolicy {
  if (isLocalHostname(hostname)) {
    return { hostname, kind: 'local', tenantSlug: null }
  }

  if (getPlatformHostnames().has(hostname)) {
    return { hostname, kind: 'platform', tenantSlug: null }
  }

  for (const rootDomain of getTenantRootDomains()) {
    const tenantSlug = tenantSlugFromSubdomain(hostname, rootDomain)
    if (tenantSlug) {
      return { hostname, kind: 'tenant-subdomain', tenantSlug }
    }
  }

  return { hostname, kind: 'external-tenant', tenantSlug: null }
}

export function isTenantHostnamePolicy(policy: HostnamePolicy) {
  return policy.kind === 'tenant-subdomain' || policy.kind === 'external-tenant'
}
