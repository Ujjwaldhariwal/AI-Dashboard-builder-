import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Widget, WidgetConfigInput } from '@/types/widget'

interface Dashboard {
  id: string
  name: string
  description: string
  createdAt: Date
  ownerId?: string            // ✅ add this line
}

interface APIEndpoint {
  id: string
  name: string
  url: string
  method: 'GET' | 'POST'
  authType: 'none' | 'api-key' | 'bearer' | 'basic'
  headers?: Record<string, string>
  refreshInterval: number
  status: 'active' | 'inactive'
}

interface DashboardStore {
  // Dashboards
  dashboards: Dashboard[]
  currentDashboardId: string | null
  addDashboard: (dashboard: Omit<Dashboard, 'id' | 'createdAt'>) => string
  removeDashboard: (id: string) => void
  deleteDashboard: (id: string) => void   // ✅ alias — same as removeDashboard
  setCurrentDashboard: (id: string | null) => void

  // Endpoints
  endpoints: APIEndpoint[]
  addEndpoint: (endpoint: Omit<APIEndpoint, 'id'>) => void
  removeEndpoint: (id: string) => void
  updateEndpoint: (id: string, updates: Partial<APIEndpoint>) => void

  // Widgets
  widgets: Widget[]
  addWidget: (config: WidgetConfigInput) => void
  removeWidget: (id: string) => void
  updateWidget: (id: string, updates: Partial<Widget>) => void
  reorderWidgets: (dashboardId: string, newOrder: Widget[]) => void
  getWidgetsByDashboard: (dashboardId: string) => Widget[]
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({
      // ─── Dashboards ───────────────────────────────────────────
      dashboards: [],
      currentDashboardId: null,

      addDashboard: (dashboard) => {
        const id = `dashboard-${Date.now()}`
        set((state) => ({
          dashboards: [
            ...state.dashboards,
            { ...dashboard, id, createdAt: new Date() },
          ],
        }))
        return id
      },

      removeDashboard: (id) => {
        set((state) => ({
          dashboards: state.dashboards.filter((d) => d.id !== id),
          currentDashboardId:
            state.currentDashboardId === id ? null : state.currentDashboardId,
          widgets: state.widgets.filter((w) => w.dashboardId !== id),
        }))
      },

      // ✅ alias so old code calling deleteDashboard still works
      deleteDashboard: (id) => {
        set((state) => ({
          dashboards: state.dashboards.filter((d) => d.id !== id),
          currentDashboardId:
            state.currentDashboardId === id ? null : state.currentDashboardId,
          widgets: state.widgets.filter((w) => w.dashboardId !== id),
        }))
      },

      setCurrentDashboard: (id) => set({ currentDashboardId: id }),

      // ─── Endpoints ────────────────────────────────────────────
      endpoints: [],

      addEndpoint: (endpoint) => {
        const id = `endpoint-${Date.now()}`
        set((state) => ({
          endpoints: [...state.endpoints, { ...endpoint, id }],
        }))
      },

      removeEndpoint: (id) => {
        set((state) => ({
          endpoints: state.endpoints.filter((e) => e.id !== id),
          widgets: state.widgets.filter((w) => w.endpointId !== id),
        }))
      },

      updateEndpoint: (id, updates) => {
        set((state) => ({
          endpoints: state.endpoints.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        }))
      },

      // ─── Widgets ──────────────────────────────────────────────
      widgets: [],

      addWidget: (config) => {
        const { currentDashboardId } = get()
        if (!currentDashboardId) return

        const id = `widget-${Date.now()}`
        const now = new Date().toISOString()

        const newWidget: Widget = {
          id,
          dashboardId: currentDashboardId,
          title: config.title,
          type: config.type,
          endpointId: config.endpointId,
          dataMapping: {
            xAxis: config.xAxis,
            yAxis: config.yAxis,
          },
          position: { x: 0, y: 0, w: 6, h: 4 },
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          widgets: [...state.widgets, newWidget],
        }))
      },

      removeWidget: (id) => {
        set((state) => ({
          widgets: state.widgets.filter((w) => w.id !== id),
        }))
      },

      updateWidget: (id, updates) => {
        const now = new Date().toISOString()
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: now } : w
          ),
        }))
      },

       reorderWidgets: (dashboardId, newOrder) => {
        set((state) => {
          // Keep widgets from OTHER dashboards untouched
          const others = state.widgets.filter((w) => w.dashboardId !== dashboardId)
          // Add the newly ordered widgets for THIS dashboard
          return {
            widgets: [...others, ...newOrder],
          }
        })
      },
      

      getWidgetsByDashboard: (dashboardId) => {
        return get().widgets.filter((w) => w.dashboardId === dashboardId)
      },
    }),
    {
      name: 'dashboard-storage',
    }
  )
)
