// src/store/monitoring-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LogLevel = 'info' | 'warn' | 'error' | 'success'
const STORE_VERSION = 1

export interface WidgetLog {
  id: string
  widgetId: string
  widgetTitle: string
  endpointId: string
  endpointUrl: string
  level: LogLevel
  message: string
  latencyMs?: number
  timestamp: string
  statusCode?: number
}

export interface EndpointHealth {
  endpointId: string
  endpointName: string
  url: string
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  lastChecked: string
  latencyMs?: number
  successCount: number
  errorCount: number
  lastError?: string
}

interface MonitoringStore {
  logs: WidgetLog[]
  endpointHealth: Record<string, EndpointHealth>

  // Log actions
  addLog: (log: Omit<WidgetLog, 'id' | 'timestamp'>) => void
  clearLogs: () => void
  clearWidgetLogs: (widgetId: string) => void

  // Health actions
  updateEndpointHealth: (
    endpointId: string,
    update: Partial<Omit<EndpointHealth, 'endpointId'>>,
  ) => void
  resetEndpointHealth: (endpointId: string) => void

  // Derived
  getLogsForWidget: (widgetId: string) => WidgetLog[]
  getLogsForEndpoint: (endpointId: string) => WidgetLog[]
  getErrorCount: () => number
}

export const useMonitoringStore = create<MonitoringStore>()(
  persist(
    (set, get) => ({
      logs: [],

      endpointHealth: {},

      addLog: (log) => {
        const entry: WidgetLog = {
          ...log,
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
        }
        set(state => ({
          // Keep max 500 logs — rolling window
          logs: [entry, ...state.logs].slice(0, 500),
        }))
      },

      clearLogs: () => set({ logs: [] }),

      clearWidgetLogs: (widgetId) =>
        set(state => ({
          logs: state.logs.filter(l => l.widgetId !== widgetId),
        })),

      updateEndpointHealth: (endpointId, update) =>
        set(state => ({
          endpointHealth: {
            ...state.endpointHealth,
            [endpointId]: {
              ...(state.endpointHealth[endpointId] ?? {
                endpointId,
                endpointName: '',
                url: '',
                status: 'unknown',
                lastChecked: new Date().toISOString(),
                successCount: 0,
                errorCount: 0,
              }),
              ...update,
              lastChecked: new Date().toISOString(),
            },
          },
        })),

      resetEndpointHealth: (endpointId) =>
        set(state => {
          const next = { ...state.endpointHealth }
          delete next[endpointId]
          return { endpointHealth: next }
        }),

      getLogsForWidget: (widgetId) =>
        get().logs.filter(l => l.widgetId === widgetId),

      getLogsForEndpoint: (endpointId) =>
        get().logs.filter(l => l.endpointId === endpointId),

      getErrorCount: () =>
        get().logs.filter(l => l.level === 'error').length,
    }),
    {
      name: 'monitoring-storage',
      version: STORE_VERSION,
      migrate: (persistedState: unknown) => {
        const state = persistedState as Partial<MonitoringStore> | undefined
        return {
          logs: Array.isArray(state?.logs) ? state.logs : [],
          endpointHealth:
            state?.endpointHealth && typeof state.endpointHealth === 'object'
              ? state.endpointHealth
              : {},
        }
      },
    }
  ),
)
