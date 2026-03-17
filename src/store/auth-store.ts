// src/store/auth-store.ts
import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'

export type Role = 'admin' | 'employee'

export interface AuthUser {
  id:     string   // Supabase auth.users UUID
  emp_id: string   // Company employee ID
  name:   string
  email:  string
  role:   Role
}

interface AuthState {
  user:            AuthUser | null
  isAuthenticated: boolean
  isLoading:       boolean
  checkSession:    () => Promise<void>
  logout:          () => Promise<void>
}

const supabase = createClient()

function isNetworkFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)
}

// ── Initial state extracted — used in logout reset ────────────
const INITIAL_STATE = {
  user:            null,
  isAuthenticated: false,
  isLoading:       false,
}

export const useAuthStore = create<AuthState>((set) => ({
  ...INITIAL_STATE,
  isLoading: true,  // true on first load until checkSession resolves

  checkSession: async () => {
    set({ isLoading: true })
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        // Fetch extended employee data — don't fail if row doesn't exist yet
        const { data: empData } = await supabase
          .from('employees')
          .select('*')
          .eq('id', session.user.id)
          .single()

        // Bulletproof fallback: DB first, then auth metadata
        set({
          user: {
            id:     session.user.id,
            emp_id: empData?.emp_id   || session.user.user_metadata?.emp_id || 'UNKNOWN',
            name:   empData?.name     || session.user.user_metadata?.name   || 'Employee',
            email:  session.user.email ?? '',
            role:   (empData?.role as Role) ?? 'employee',
          },
          isAuthenticated: true,
          isLoading:       false,   // ✅ single set call instead of two
        })
      } else {
        set({ ...INITIAL_STATE })
      }
    } catch (error) {
      if (!isNetworkFetchError(error)) {
        console.error('Session check failed:', error)
      }
      set({ ...INITIAL_STATE })
    }
  },

  // ✅ S1-1 — logout clears ALL persisted stores + try/catch/finally
  logout: async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      // signOut failed server-side — still clear everything locally
      if (!isNetworkFetchError(error)) {
        console.error('Supabase signOut error:', error)
      }
    } finally {
      // ✅ Lazy imports inside finally — avoids circular dep at module level
      const { useDashboardStore }    = await import('@/store/builder-store')
      const { useMonitoringStore }   = await import('@/store/monitoring-store')
      const { useNotificationStore } = await import('@/store/notification-store')

      // Clear persisted localStorage keys
      useDashboardStore.persist.clearStorage()
      useMonitoringStore.persist.clearStorage()
      useNotificationStore.persist.clearStorage()

      // Reset in-memory Zustand state
      useDashboardStore.setState({
        dashboards:         [],
        widgets:            [],
        endpoints:          [],
        projectConfigs:     {},
        chartGroups:        [],
        currentDashboardId: null,
      })
      useMonitoringStore.setState({
        logs:            [],
        endpointHealth:  {},
      })
      useNotificationStore.setState({
        notifications: [],
      })

      // Reset auth state
      set({ ...INITIAL_STATE })

      // Hard redirect — clears all React component state
      window.location.href = '/login'
    }
  },
}))

// ── Global auth state listener ────────────────────────────────
// Catches session expiry, token refresh, external sign-out
// without requiring manual checkSession calls
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    useAuthStore.setState({ ...INITIAL_STATE })
  }
  if (event === 'TOKEN_REFRESHED' && session?.user) {
    // Keep user data fresh on token refresh without full DB refetch
    useAuthStore.setState({ isAuthenticated: true })
  }
})
