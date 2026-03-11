// src/proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_ROUTES = ['/view']
const ADMIN_ONLY = ['/settings']

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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Root: authenticated -> /workspaces, unauthenticated -> landing page.
  if (pathname === '/') {
    if (session) {
      return NextResponse.redirect(new URL('/workspaces', request.url))
    }
    return NextResponse.next()
  }

  // /login: authenticated -> /workspaces, unauthenticated -> login page.
  if (pathname === '/login') {
    if (session) {
      return NextResponse.redirect(new URL('/workspaces', request.url))
    }
    return NextResponse.next()
  }

  // No session on any other route -> redirect to login.
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
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
