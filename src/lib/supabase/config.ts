export const SUPABASE_URL = 'https://fmhwxggejoerbpawejro.supabase.co'

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  }
  return key
}
