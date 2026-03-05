// src/store/notification-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotifType = 'success' | 'warning' | 'error' | 'info'
const STORE_VERSION = 1

export interface AppNotification {
  id: string
  type: NotifType
  title: string
  message: string
  timestamp: string
  read: boolean
  link?: string  // optional deep-link e.g. '/monitoring'
}

interface NotificationStore {
  notifications: AppNotification[]
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void
  markAllRead: () => void
  markRead: (id: string) => void
  dismiss: (id: string) => void
  clearAll: () => void
  unreadCount: () => number
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],

      addNotification: (n) => {
        const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        set(state => ({
          // Max 50 notifications rolling
          notifications: [
            { ...n, id, timestamp: new Date().toISOString(), read: false },
            ...state.notifications,
          ].slice(0, 50),
        }))
      },

      markAllRead: () =>
        set(state => ({
          notifications: state.notifications.map(n => ({ ...n, read: true })),
        })),

      markRead: (id) =>
        set(state => ({
          notifications: state.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n,
          ),
        })),

      dismiss: (id) =>
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id),
        })),

      clearAll: () => set({ notifications: [] }),

      unreadCount: () => get().notifications.filter(n => !n.read).length,
    }),
    {
      name: 'notification-storage',
      version: STORE_VERSION,
    },
  ),
)
