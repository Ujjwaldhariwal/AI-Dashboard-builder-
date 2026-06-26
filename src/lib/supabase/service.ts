import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseServiceRoleKey, SUPABASE_URL } from '@/lib/supabase/config'

let serviceClient: SupabaseClient | null = null

export function getServiceSupabase() {
  if (!serviceClient) {
    serviceClient = createClient(SUPABASE_URL, getSupabaseServiceRoleKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return serviceClient
}
