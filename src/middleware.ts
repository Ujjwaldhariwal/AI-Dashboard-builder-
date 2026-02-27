// Module: Middleware
import { NextRequest, NextResponse } from 'next/server'

// For now, middleware does NOT enforce auth.
// Auth is handled on the client via Zustand.
// Later, when backend + JWT cookies exist, we re-enable this.
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [], // match nothing for now
}
