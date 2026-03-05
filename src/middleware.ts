// middleware.ts  ← create at project root (next to package.json)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ── Routes that never require auth ───────────────────────────
const PUBLIC_ROUTES = [
  '/login',
  '/view',          // /view/[token] — shared dashboard links
]

// ── Routes only admins can access ────────────────────────────
const ADMIN_ONLY_ROUTES = [
  '/settings',      // extend this list as needed
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 1. Always allow public routes ────────────────────────────
  const isPublic = PUBLIC_ROUTES.some(route => pathname.startsWith(route))
  if (isPublic) return NextResponse.next()

  // ── 2. Build a response we can attach cookies to ─────────────
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // ── 3. Create Supabase SSR client (reads cookies) ────────────
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
    },
  )

  // ── 4. Get session ────────────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession()

  // ── 5. No session → redirect to login ────────────────────────
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    // Preserve intended destination so we can redirect back after login
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── 6. Admin-only route check ─────────────────────────────────
  const isAdminRoute = ADMIN_ONLY_ROUTES.some(route => pathname.startsWith(route))
  if (isAdminRoute) {
    // Read role from user metadata (set during signup/employee creation)
    const role = session.user.user_metadata?.role ?? 'employee'
    if (role !== 'admin') {
      // Non-admin trying to access admin route → send to workspaces
      return NextResponse.redirect(new URL('/workspaces', request.url))
    }
  }

  // ── 7. Logged-in user hitting /login → send to workspaces ────
  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/workspaces', request.url))
  }

  return response
}

// ── Which routes this middleware runs on ─────────────────────
export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico
     * - api routes    (handled separately)
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
