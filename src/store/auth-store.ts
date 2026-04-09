import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import {
  SUPABASE_AUTH_EXPIRED_EVENT,
  SUPABASE_AUTH_NETWORK_ERROR_EVENT,
} from '@/lib/supabase/auth-events'

export type Role = 'admin' | 'employee'
export type AuthIssue = 'ok' | 'network_error' | 'expired'

export interface AuthUser {
  id: string
  emp_id: string
  name: string
  email: string
  role: Role
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  authIssue: AuthIssue
  showSessionExpiredModal: boolean
  checkSession: () => Promise<void>
  markExpired: () => void
  setNetworkError: () => void
  clearAuthIssue: () => void
  closeSessionExpiredModal: () => void
  logout: (redirectTo?: string) => Promise<void>
}

const supabase = createClient()

let manualLogoutInProgress = false
let authBrowserListenersBound = false

function isNetworkFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|aborted/i.test(message)
}

const INITIAL_STATE = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  authIssue: 'ok' as AuthIssue,
  showSessionExpiredModal: false,
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...INITIAL_STATE,
  isLoading: true,

  checkSession: async () => {
    set({ isLoading: true })

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        set(state => ({
          ...state,
          user: state.authIssue === 'expired' ? state.user : null,
          isAuthenticated: false,
          isLoading: false,
        }))
        return
      }

      const { data: employeeRow } = await supabase
        .from('employees')
        .select('*')
        .eq('id', session.user.id)
        .single()

      set({
        user: {
          id: session.user.id,
          emp_id: employeeRow?.emp_id || session.user.user_metadata?.emp_id || 'UNKNOWN',
          name: employeeRow?.name || session.user.user_metadata?.name || 'Employee',
          email: session.user.email ?? '',
          role: (employeeRow?.role as Role) ?? 'employee',
        },
        isAuthenticated: true,
        isLoading: false,
        authIssue: 'ok',
        showSessionExpiredModal: false,
      })
    } catch (error) {
      if (isNetworkFetchError(error)) {
        set(state => ({
          ...state,
          isLoading: false,
          authIssue: state.authIssue === 'expired' ? 'expired' : 'network_error',
          showSessionExpiredModal: state.authIssue === 'expired' ? true : state.showSessionExpiredModal,
        }))
        return
      }

      console.error('Session check failed:', error)
      set({
        ...INITIAL_STATE,
        isLoading: false,
      })
    }
  },

  markExpired: () => {
    set(state => ({
      ...state,
      isAuthenticated: false,
      authIssue: 'expired',
      showSessionExpiredModal: true,
    }))
  },

  setNetworkError: () => {
    set(state => {
      if (state.authIssue === 'expired') return state
      return {
        ...state,
        authIssue: 'network_error',
      }
    })
  },

  clearAuthIssue: () => {
    set(state => ({
      ...state,
      authIssue: 'ok',
      showSessionExpiredModal: false,
    }))
  },

  closeSessionExpiredModal: () => {
    set({ showSessionExpiredModal: false })
  },

  logout: async (redirectTo = '/login') => {
    manualLogoutInProgress = true
    try {
      await supabase.auth.signOut()
    } catch (error) {
      if (!isNetworkFetchError(error)) {
        console.error('Supabase signOut error:', error)
      }
    } finally {
      const { useDashboardStore } = await import('@/store/builder-store')
      const { useMonitoringStore } = await import('@/store/monitoring-store')
      const { useNotificationStore } = await import('@/store/notification-store')

      useDashboardStore.persist.clearStorage()
      useMonitoringStore.persist.clearStorage()
      useNotificationStore.persist.clearStorage()

      useDashboardStore.setState({
        dashboards: [],
        widgets: [],
        endpoints: [],
        projectConfigs: {},
        chartGroups: [],
        chartSubgroups: [],
        currentDashboardId: null,
      })
      useMonitoringStore.setState({
        logs: [],
        endpointHealth: {},
      })
      useNotificationStore.setState({
        notifications: [],
      })

      set({ ...INITIAL_STATE })

      if (typeof window !== 'undefined') {
        window.location.href = redirectTo
      }

      globalThis.setTimeout(() => {
        manualLogoutInProgress = false
      }, 1000)
    }
  },
}))

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    if (manualLogoutInProgress) {
      useAuthStore.setState({
        ...INITIAL_STATE,
      })
      return
    }

    useAuthStore.getState().markExpired()
    return
  }

  if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
    useAuthStore.setState(state => ({
      ...state,
      isAuthenticated: true,
      authIssue: 'ok',
      showSessionExpiredModal: false,
    }))
    if (event === 'SIGNED_IN') {
      void useAuthStore.getState().checkSession()
    }
  }
})

if (typeof window !== 'undefined' && !authBrowserListenersBound) {
  authBrowserListenersBound = true

  window.addEventListener(SUPABASE_AUTH_NETWORK_ERROR_EVENT, () => {
    useAuthStore.getState().setNetworkError()
  })

  window.addEventListener(SUPABASE_AUTH_EXPIRED_EVENT, () => {
    useAuthStore.getState().markExpired()
  })
}
