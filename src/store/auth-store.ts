// Module: AuthStore
// src/store/auth-store.ts
import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'

export type Role = 'admin' | 'employee'

export interface AuthUser {
  id: string          // Supabase auth.users UUID
  emp_id: string      // Company employee ID
  name: string
  email: string
  role: Role
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  checkSession: () => Promise<void>
  logout: () => Promise<void>
}

const supabase = createClient()

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  checkSession: async () => {
    set({ isLoading: true })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        // Fetch extended employee data, but don't fail if it doesn't exist yet
        const { data: empData } = await supabase
          .from('employees')
          .select('*')
          .eq('id', session.user.id)
          .single()

        // Bulletproof Fallback: Use DB data if exists, otherwise fallback to auth metadata
        set({
          user: {
            id: session.user.id,
            emp_id: empData?.emp_id || session.user.user_metadata?.emp_id || 'UNKNOWN',
            name: empData?.name || session.user.user_metadata?.name || 'Employee',
            email: session.user.email || '',
            role: (empData?.role as Role) || 'employee',
          },
          isAuthenticated: true,
        })
      } else {
        set({ user: null, isAuthenticated: false })
      }
    } catch (error) {
      console.error('Session check failed:', error)
      set({ user: null, isAuthenticated: false })
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, isAuthenticated: false })
    window.location.href = '/login'
  }
}))
