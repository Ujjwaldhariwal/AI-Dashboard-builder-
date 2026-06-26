// src/proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  hasSupabaseAuthCookieFootprint,
  SESSION_EXPIRED_COOKIE_NAME,
} from '@/lib/auth/session-expired-signal'
import {
  isTenantHostnamePolicy,
  normalizeRequestHostname,
  resolveHostnamePolicy,
} from '@/lib/routing/hostname-policy'
import { getSupabaseAnonKey, SUPABASE_URL } from '@/lib/supabase/config'

const PUBLIC_ROUTES = ['/view']
const ADMIN_ONLY = ['/settings']
const BUILDER_CANVAS_ROUTE = '/builder'
const DASHBOARDOS_HOME_ROUTE = '/admin'
const CLIENT_ROUTE = '/client'
const LEGACY_ROUTES = [
  '/api-config',
  '/auth-flow',
  '/builder',
  '/dashboard',
  '/monitoring',
  '/pdf-export',
  '/workspaces',
]

interface TenantDomainResolution {
  tenantId: string
  tenantSlug: string
}

function clearSessionExpiredSignal(response: NextResponse) {
  response.cookies.set(SESSION_EXPIRED_COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
  })
  return response
}

function normalizeHostname(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost ?? request.headers.get('host') ?? request.nextUrl.host
  return normalizeRequestHostname(host)
}

function tenantSlugFromDomainRow(row: Record<string, unknown>): TenantDomainResolution | null {
  const tenant = row.tenants
  if (!tenant || typeof tenant !== 'object' || Array.isArray(tenant)) return null
  const tenantRecord = tenant as Record<string, unknown>
  if (tenantRecord.status !== 'active') return null
  if (typeof tenantRecord.id !== 'string' || typeof tenantRecord.slug !== 'string') return null
  return {
    tenantId: tenantRecord.id,
    tenantSlug: tenantRecord.slug,
  }
}

async function resolveTenantDomain(
  supabase: ReturnType<typeof createServerClient>,
  hostname: string,
): Promise<TenantDomainResolution | null> {
  const { data, error } = await supabase
    .from('tenant_domains')
    .select('hostname, status, tenants(id, slug, status)')
    .eq('hostname', hostname)
    .eq('status', 'verified')
    .maybeSingle()

  if (error || !data) return null
  return tenantSlugFromDomainRow(data as Record<string, unknown>)
}

async function resolveTenantSubdomain(
  supabase: ReturnType<typeof createServerClient>,
  tenantSlug: string,
): Promise<TenantDomainResolution | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, status')
    .eq('slug', tenantSlug)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return null
  const tenant = data as Record<string, unknown>
  if (typeof tenant.id !== 'string' || typeof tenant.slug !== 'string') return null
  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  }
}

async function resolveTenantHostname(
  supabase: ReturnType<typeof createServerClient>,
  policy: ReturnType<typeof resolveHostnamePolicy>,
): Promise<TenantDomainResolution | null> {
  if (policy.kind === 'tenant-subdomain' && policy.tenantSlug) {
    return resolveTenantSubdomain(supabase, policy.tenantSlug)
  }

  if (policy.kind === 'external-tenant') {
    return resolveTenantDomain(supabase, policy.hostname)
  }

  return null
}

function tenantRewriteResponse(
  request: NextRequest,
  tenantDomain: TenantDomainResolution,
  pathname: string,
) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-dashboardos-tenant-id', tenantDomain.tenantId)
  requestHeaders.set('x-dashboardos-tenant-slug', tenantDomain.tenantSlug)

  const rewriteUrl = request.nextUrl.clone()
  rewriteUrl.pathname = `${CLIENT_ROUTE}/${tenantDomain.tenantSlug}${pathname === '/' ? '' : pathname}`
  return NextResponse.rewrite(rewriteUrl, {
    request: { headers: requestHeaders },
  })
}

function tenantRuntimePath(pathname: string, tenantSlug: string) {
  const expectedClientPrefix = `${CLIENT_ROUTE}/${tenantSlug}`
  if (pathname === expectedClientPrefix) return '/'
  if (pathname.startsWith(`${expectedClientPrefix}/`)) {
    return pathname.slice(expectedClientPrefix.length) || '/'
  }

  if (pathname === CLIENT_ROUTE || pathname.startsWith(`${CLIENT_ROUTE}/`)) {
    return '/'
  }

  return pathname
}

function unknownTenantHostResponse(hostname: string) {
  return new NextResponse(null, {
    status: 404,
    headers: {
      'x-dashboardos-hostname-policy': 'unrecognized',
      'x-dashboardos-hostname': hostname,
    },
  })
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = normalizeHostname(request)
  const hostnamePolicy = resolveHostnamePolicy(hostname)
  const isTenantHost = isTenantHostnamePolicy(hostnamePolicy)

  // Always allow /view/[token] public share links.
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  if (LEGACY_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.redirect(new URL(DASHBOARDOS_HOME_ROUTE, request.url))
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    SUPABASE_URL,
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const cookieNames = request.cookies.getAll().map(cookie => cookie.name)
  const hasAuthCookieFootprint = hasSupabaseAuthCookieFootprint(cookieNames)

  if (session) {
    clearSessionExpiredSignal(response)
  }

  const tenantDomain = session && isTenantHost
    ? await resolveTenantHostname(supabase, hostnamePolicy)
    : null

  if (isTenantHost && session && !tenantDomain) {
    return unknownTenantHostResponse(hostname)
  }

  if (tenantDomain && pathname === '/login') {
    return clearSessionExpiredSignal(
      tenantRewriteResponse(request, tenantDomain, '/'),
    )
  }

  if (tenantDomain && !pathname.startsWith('/api')) {
    const runtimePath = tenantRuntimePath(pathname, tenantDomain.tenantSlug)
    return clearSessionExpiredSignal(
      tenantRewriteResponse(request, tenantDomain, runtimePath),
    )
  }

  if (isTenantHost && !session && pathname === '/') {
    const url = new URL('/login', request.url)
    return clearSessionExpiredSignal(NextResponse.redirect(url))
  }

  // Root: authenticated -> DashboardOS admin, unauthenticated -> landing page.
  if (pathname === '/') {
    if (session) {
      return clearSessionExpiredSignal(
        NextResponse.redirect(new URL(DASHBOARDOS_HOME_ROUTE, request.url)),
      )
    }
    return NextResponse.next()
  }

  // /login: authenticated -> DashboardOS admin, unauthenticated -> login page.
  if (pathname === '/login') {
    if (session) {
      return clearSessionExpiredSignal(
        NextResponse.redirect(new URL(DASHBOARDOS_HOME_ROUTE, request.url)),
      )
    }
    return clearSessionExpiredSignal(NextResponse.next())
  }

  // No session on any other route -> redirect to login.
  if (!session) {
    const isBuilderCanvasRoute = pathname.startsWith(BUILDER_CANVAS_ROUTE)
    if (isBuilderCanvasRoute && hasAuthCookieFootprint) {
      response.cookies.set(SESSION_EXPIRED_COOKIE_NAME, '1', {
        path: '/',
        maxAge: 30,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false,
      })
      return response
    }

    const url = new URL('/login', request.url)
    url.searchParams.set('redirectTo', pathname)
    return clearSessionExpiredSignal(NextResponse.redirect(url))
  }

  // Admin-only routes.
  if (ADMIN_ONLY.some(route => pathname.startsWith(route))) {
    const role = session.user.user_metadata?.role ?? 'employee'
    if (role !== 'admin') {
      return NextResponse.redirect(new URL(DASHBOARDOS_HOME_ROUTE, request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
