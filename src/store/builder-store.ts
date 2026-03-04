// src/store/builder-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Widget, WidgetConfigInput, WidgetStyle, DEFAULT_STYLE } from '@/types/widget'
import { ProjectConfig, ChartGroup, DEFAULT_PROJECT_CONFIG } from '@/types/project-config'

interface Dashboard {
  id:          string
  name:        string
  description: string
  createdAt:   Date
  ownerId?:    string
}

interface APIEndpoint {
  id:              string
  name:            string
  url:             string
  method:          'GET' | 'POST'
  authType:        'none' | 'api-key' | 'bearer' | 'basic'
  headers?:        Record<string, string>
  refreshInterval: number
  status:          'active' | 'inactive'
}

interface DashboardStore {
  // Dashboards
  dashboards:           Dashboard[]
  currentDashboardId:   string | null
  addDashboard:         (d: Omit<Dashboard, 'id' | 'createdAt'>) => string
  removeDashboard:      (id: string) => void
  updateDashboard:      (id: string, patch: Partial<Dashboard>) => void
  deleteDashboard:      (id: string) => void
  setCurrentDashboard:  (id: string | null) => void
  duplicateDashboard:   (id: string) => string

  // Endpoints
  endpoints:      APIEndpoint[]
  addEndpoint:    (e: Omit<APIEndpoint, 'id'>) => string
  removeEndpoint: (id: string) => void
  updateEndpoint: (id: string, updates: Partial<APIEndpoint>) => void

  // Widgets
  widgets:              Widget[]
  addWidget:            (config: WidgetConfigInput) => void
  removeWidget:         (id: string) => void
  updateWidget:         (id: string, updates: Partial<Widget>) => void
  getWidgetsByDashboard:(dashboardId: string) => Widget[]
  reorderWidgets:       (dashboardId: string, activeId: string, overId: string) => void

  // Style Actions (Layer 3)
  updateWidgetStyle: (id: string, style: Partial<WidgetStyle>) => void
  resetWidgetStyle:  (id: string) => void

  // ── NEW: Project Config ──────────────────────────────────
  projectConfigs:      Record<string, ProjectConfig>  // keyed by dashboardId
  setProjectConfig:    (dashboardId: string, config: Partial<Omit<ProjectConfig, 'dashboardId'>>) => void
  getProjectConfig:    (dashboardId: string) => ProjectConfig
  resetProjectConfig:  (dashboardId: string) => void

  // ── NEW: Chart Groups ────────────────────────────────────
  chartGroups:         ChartGroup[]
  addChartGroup:       (dashboardId: string, name: string) => string
  removeChartGroup:    (groupId: string) => void
  updateChartGroup:    (groupId: string, patch: Partial<Pick<ChartGroup, 'name' | 'order'>>) => void
  assignWidgetToGroup: (widgetId: string, groupId: string | null) => void
  getGroupsByDashboard:(dashboardId: string) => ChartGroup[]
  reorderGroups:       (dashboardId: string, groupId: string, direction: 'up' | 'down') => void
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({

      // ── Dashboards ─────────────────────────────────────────────
      dashboards: [],
      currentDashboardId: null,

      addDashboard: (dashboard) => {
        const id = `dashboard-${Date.now()}`
        set(s => ({ dashboards: [...s.dashboards, { ...dashboard, id, createdAt: new Date() }] }))
        return id
      },

      removeDashboard: (id) => set(s => ({
        dashboards:        s.dashboards.filter(d => d.id !== id),
        currentDashboardId: s.currentDashboardId === id ? null : s.currentDashboardId,
        widgets:           s.widgets.filter(w => w.dashboardId !== id),
        chartGroups:       s.chartGroups.filter(g => g.dashboardId !== id),
        projectConfigs:    Object.fromEntries(Object.entries(s.projectConfigs).filter(([k]) => k !== id)),
      })),

      updateDashboard: (id, patch) => set(s => ({
        dashboards: s.dashboards.map(d => d.id === id ? { ...d, ...patch } : d),
      })),

      deleteDashboard: (id) => get().removeDashboard(id),

      duplicateDashboard: (id) => {
        const { dashboards, widgets, chartGroups, projectConfigs } = get()
        const source = dashboards.find(d => d.id === id)
        if (!source) return ''
        const newId  = `dashboard-${Date.now()}`
        const now    = new Date()
        const idMap  = new Map<string, string>()

        const clonedWidgets = widgets
          .filter(w => w.dashboardId === id)
          .map(w => {
            const newWid = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
            idMap.set(w.id, newWid)
            return { ...w, id: newWid, dashboardId: newId, createdAt: now.toISOString(), updatedAt: now.toISOString() }
          })

        const clonedGroups = chartGroups
          .filter(g => g.dashboardId === id)
          .map(g => ({
            ...g,
            id:        `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            dashboardId: newId,
            widgetIds: g.widgetIds.map(wid => idMap.get(wid) ?? wid),
          }))

        const sourceConfig = projectConfigs[id]
        const clonedConfig = sourceConfig
          ? { ...sourceConfig, dashboardId: newId, projectTitle: `${sourceConfig.projectTitle} (copy)` }
          : undefined

        set(s => ({
          dashboards:    [...s.dashboards, { ...source, id: newId, name: `${source.name} (copy)`, createdAt: now }],
          widgets:       [...s.widgets, ...clonedWidgets],
          chartGroups:   [...s.chartGroups, ...clonedGroups],
          projectConfigs: clonedConfig ? { ...s.projectConfigs, [newId]: clonedConfig } : s.projectConfigs,
        }))
        return newId
      },

      setCurrentDashboard: (id) => set({ currentDashboardId: id }),

      // ── Endpoints ──────────────────────────────────────────────
      endpoints: [],

      addEndpoint: (endpoint) => {
        const id = `endpoint-${Date.now()}`
        set(s => ({ endpoints: [...s.endpoints, { ...endpoint, id }] }))
        return id
      },

      removeEndpoint: (id) => set(s => ({
        endpoints: s.endpoints.filter(e => e.id !== id),
        widgets:   s.widgets.filter(w => w.endpointId !== id),
      })),

      updateEndpoint: (id, updates) => set(s => ({
        endpoints: s.endpoints.map(e => e.id === id ? { ...e, ...updates } : e),
      })),

      // ── Widgets ────────────────────────────────────────────────
      widgets: [],

      addWidget: (config) => {
        const { currentDashboardId, widgets } = get()
        if (!currentDashboardId) return

        const resolvedMapping = config.dataMapping ?? { xAxis: config.xAxis ?? '', yAxis: config.yAxis }
        if (!resolvedMapping.xAxis) return

        const id  = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        if (widgets.some(w => w.id === id)) return
        const now = new Date().toISOString()

        const newWidget: Widget = {
          id,
          dashboardId: currentDashboardId,
          title:       config.title,
          type:        config.type,
          deps:        'echarts',
          endpointId:  config.endpointId,
          dataMapping: resolvedMapping,
          style:       { ...DEFAULT_STYLE, ...config.style },
          groupId:     config.groupId,
          position:    { x: 0, y: 0, w: 6, h: 4 },
          createdAt:   now,
          updatedAt:   now,
        }
        set(s => ({ widgets: [...s.widgets, newWidget] }))

        // Auto-add to group if groupId provided
        if (config.groupId) {
          get().assignWidgetToGroup(id, config.groupId)
        }
      },

      removeWidget: (id) => {
        set(s => ({
          widgets:     s.widgets.filter(w => w.id !== id),
          chartGroups: s.chartGroups.map(g => ({ ...g, widgetIds: g.widgetIds.filter(wid => wid !== id) })),
        }))
      },

      updateWidget: (id, updates) => {
        const now = new Date().toISOString()
        set(s => ({ widgets: s.widgets.map(w => w.id === id ? { ...w, ...updates, updatedAt: now } : w) }))
      },

      reorderWidgets: (dashboardId, activeId, overId) => {
        set(s => {
          const dash = s.widgets.filter(w => w.dashboardId === dashboardId)
          const rest = s.widgets.filter(w => w.dashboardId !== dashboardId)
          const oi   = dash.findIndex(w => w.id === activeId)
          const ni   = dash.findIndex(w => w.id === overId)
          if (oi === -1 || ni === -1) return s
          const r = [...dash]
          const [m] = r.splice(oi, 1)
          r.splice(ni, 0, m)
          return { widgets: [...rest, ...r] }
        })
      },

      getWidgetsByDashboard: (dashboardId) => get().widgets.filter(w => w.dashboardId === dashboardId),

      updateWidgetStyle: (id, styleUpdate) => {
        const now = new Date().toISOString()
        set(s => ({
          widgets: s.widgets.map(w =>
            w.id === id ? { ...w, style: { ...w.style, ...styleUpdate }, updatedAt: now } : w
          ),
        }))
      },

      resetWidgetStyle: (id) => {
        const now = new Date().toISOString()
        set(s => ({
          widgets: s.widgets.map(w => w.id === id ? { ...w, style: { ...DEFAULT_STYLE }, updatedAt: now } : w),
        }))
      },

      // ── Project Config ─────────────────────────────────────────
      projectConfigs: {},

      setProjectConfig: (dashboardId, config) => {
        set(s => {
          const existing = s.projectConfigs[dashboardId] ?? { ...DEFAULT_PROJECT_CONFIG, dashboardId }
          return {
            projectConfigs: {
              ...s.projectConfigs,
              [dashboardId]: { ...existing, ...config, dashboardId },
            },
          }
        })
      },

      getProjectConfig: (dashboardId) => {
        const c = get().projectConfigs[dashboardId]
        return c ?? { ...DEFAULT_PROJECT_CONFIG, dashboardId }
      },

      resetProjectConfig: (dashboardId) => {
        set(s => ({
          projectConfigs: {
            ...s.projectConfigs,
            [dashboardId]: { ...DEFAULT_PROJECT_CONFIG, dashboardId },
          },
        }))
      },

      // ── Chart Groups ───────────────────────────────────────────
      chartGroups: [],

      addChartGroup: (dashboardId, name) => {
        const { chartGroups } = get()
        const existing = chartGroups.filter(g => g.dashboardId === dashboardId)
        const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        set(s => ({
          chartGroups: [...s.chartGroups, {
            id,
            name,
            dashboardId,
            order:     existing.length,
            widgetIds: [],
          }],
        }))
        return id
      },

      removeChartGroup: (groupId) => {
        set(s => ({
          chartGroups: s.chartGroups.filter(g => g.id !== groupId),
          widgets:     s.widgets.map(w => w.groupId === groupId ? { ...w, groupId: undefined } : w),
        }))
      },

      updateChartGroup: (groupId, patch) => {
        set(s => ({
          chartGroups: s.chartGroups.map(g => g.id === groupId ? { ...g, ...patch } : g),
        }))
      },

      assignWidgetToGroup: (widgetId, groupId) => {
        const now = new Date().toISOString()
        set(s => ({
          // Remove from all groups first
          chartGroups: s.chartGroups.map(g => ({
            ...g,
            widgetIds: g.id === groupId
              ? [...new Set([...g.widgetIds, widgetId])]
              : g.widgetIds.filter(id => id !== widgetId),
          })),
          widgets: s.widgets.map(w =>
            w.id === widgetId ? { ...w, groupId: groupId ?? undefined, updatedAt: now } : w
          ),
        }))
      },

      getGroupsByDashboard: (dashboardId) =>
        get().chartGroups
          .filter(g => g.dashboardId === dashboardId)
          .sort((a, b) => a.order - b.order),

      reorderGroups: (dashboardId, groupId, direction) => {
        set(s => {
          const groups = s.chartGroups
            .filter(g => g.dashboardId === dashboardId)
            .sort((a, b) => a.order - b.order)
          const idx  = groups.findIndex(g => g.id === groupId)
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1
          if (swapIdx < 0 || swapIdx >= groups.length) return s

          const updated = [...groups]
          ;[updated[idx].order, updated[swapIdx].order] = [updated[swapIdx].order, updated[idx].order]

          return {
            chartGroups: s.chartGroups.map(g => {
              const match = updated.find(u => u.id === g.id)
              return match ? { ...g, order: match.order } : g
            }),
          }
        })
      },
    }),
    { name: 'dashboard-storage' },
  ),
)
