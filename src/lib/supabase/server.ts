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
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components cannot always mutate cookies; Route Handlers can.
          }
        },
      },
    },
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  const userId = userError ? null : user?.id
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
