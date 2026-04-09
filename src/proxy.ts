// src/proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  hasSupabaseAuthCookieFootprint,
  SESSION_EXPIRED_COOKIE_NAME,
} from '@/lib/auth/session-expired-signal'
import { getSupabaseAnonKey, SUPABASE_URL } from '@/lib/supabase/config'

const PUBLIC_ROUTES = ['/view']
const ADMIN_ONLY = ['/settings']
const BUILDER_CANVAS_ROUTE = '/builder'

function clearSessionExpiredSignal(response: NextResponse) {
  response.cookies.set(SESSION_EXPIRED_COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
  })
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow /view/[token] public share links.
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
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

  // Root: authenticated -> /workspaces, unauthenticated -> landing page.
  if (pathname === '/') {
    if (session) {
      return clearSessionExpiredSignal(
        NextResponse.redirect(new URL('/workspaces', request.url)),
      )
    }
    return NextResponse.next()
  }

  // /login: authenticated -> /workspaces, unauthenticated -> login page.
  if (pathname === '/login') {
    if (session) {
      return clearSessionExpiredSignal(
        NextResponse.redirect(new URL('/workspaces', request.url)),
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
      return NextResponse.redirect(new URL('/workspaces', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
