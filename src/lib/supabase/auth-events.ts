export const SUPABASE_AUTH_NETWORK_ERROR_EVENT = 'supabase-auth-network-error'
export const SUPABASE_AUTH_EXPIRED_EVENT = 'supabase-auth-expired'

function dispatchBrowserEvent(name: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name))
}

export function dispatchSupabaseAuthNetworkError() {
  dispatchBrowserEvent(SUPABASE_AUTH_NETWORK_ERROR_EVENT)
}

export function dispatchSupabaseAuthExpired() {
  dispatchBrowserEvent(SUPABASE_AUTH_EXPIRED_EVENT)
}
