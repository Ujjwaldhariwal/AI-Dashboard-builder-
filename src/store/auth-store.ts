'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Role = 'admin' | 'employee'

export interface AuthUser {
  id: string          // emp id
  name: string
  email: string
  role: Role
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (user: AuthUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user) =>
        set({
          user,
          isAuthenticated: true,
        }),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'auth-store',
    }
  )
)
