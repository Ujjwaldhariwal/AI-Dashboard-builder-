// Module: Client
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, SUPABASE_URL } from '@/lib/supabase/config'
import { createSupabaseRetryableFetch } from '@/lib/supabase/retryable-fetch'

let browserClient: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (browserClient) {
    return browserClient
  }

  browserClient = createBrowserClient(
    SUPABASE_URL,
    getSupabaseAnonKey(),
    {
      global: {
        fetch: createSupabaseRetryableFetch(),
      },
      auth: {
        detectSessionInUrl: false,
      },
    },
  )

  return browserClient
}
