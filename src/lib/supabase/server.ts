import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseAnonKey, SUPABASE_URL } from '@/lib/supabase/config'

export interface AuthedSupabaseContext {
  supabase: SupabaseClient
  userId: string
  role: 'admin' | 'employee'
}

export async function getAuthedSupabase(): Promise<AuthedSupabaseContext | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    SUPABASE_URL,
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(cookie => ({
            name: cookie.name,
            value: cookie.value,
          }))
        },
        setAll() {
          // Route handlers use this helper for authenticated DB access, not cookie mutation.
        },
      },
    },
  )

  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return null

  const { data: employeeRow } = await supabase
    .from('employees')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  const role = employeeRow?.role === 'admin' ? 'admin' : 'employee'
  return { supabase, userId, role }
}

export async function requirePlatformAdmin(): Promise<AuthedSupabaseContext | Response> {
  const auth = await getAuthedSupabase()
  if (!auth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (auth.role !== 'admin') {
    return Response.json({ error: 'Platform admin access is required' }, { status: 403 })
  }

  return auth
}
