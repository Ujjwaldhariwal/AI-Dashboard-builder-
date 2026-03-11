// src/store/builder-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Widget, WidgetConfigInput, WidgetStyle } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import type { ProjectConfig, ChartGroup } from '@/types/project-config'
import { DEFAULT_PROJECT_CONFIG } from '@/types/project-config'
import type { DashboardFilter, FilterOperator } from '@/types/filter'

interface Dashboard {
  id:          string
  name:        string
  description: string
  // ── Fix #3 — store as ISO string, not Date object ──────────
  createdAt:   string
  ownerId?:    string
}

interface APIEndpoint {
  id:              string
  name:            string
  url:             string
  method:          'GET' | 'POST'
  authType:        'none' | 'api-key' | 'bearer' | 'basic' | 'custom-headers'
  headers?:        Record<string, string>
  refreshInterval: number
  status:          'active' | 'inactive'
}

// ── Fix #8 — version field for future migrations ──────────────
const STORE_VERSION = 3

interface DashboardStore {
  dashboards:            Dashboard[]
  currentDashboardId:    string | null
  addDashboard:          (d: Omit<Dashboard, 'id' | 'createdAt'>) => string
  removeDashboard:       (id: string) => void
  updateDashboard:       (id: string, patch: Partial<Dashboard>) => void
  // ── Fix #6 — removed deleteDashboard alias ─────────────────
  setCurrentDashboard:   (id: string | null) => void
  duplicateDashboard:    (id: string) => string

  endpoints:             APIEndpoint[]
  addEndpoint:           (e: Omit<APIEndpoint, 'id'>) => string
  removeEndpoint:        (id: string) => void
  updateEndpoint:        (id: string, updates: Partial<APIEndpoint>) => void

  widgets:               Widget[]
  addWidget:             (config: WidgetConfigInput) => void
  removeWidget:          (id: string) => void
  updateWidget:          (id: string, updates: Partial<Widget>) => void
  getWidgetsByDashboard: (dashboardId: string) => Widget[]
  reorderWidgets:        (dashboardId: string, activeId: string, overId: string) => void

  updateWidgetStyle:     (id: string, style: Partial<WidgetStyle>) => void
  resetWidgetStyle:      (id: string) => void

  projectConfigs:        Record<string, ProjectConfig>
  setProjectConfig:      (dashboardId: string, config: Partial<Omit<ProjectConfig, 'dashboardId'>>) => void
  getProjectConfig:      (dashboardId: string) => ProjectConfig
  resetProjectConfig:    (dashboardId: string) => void

  chartGroups:           ChartGroup[]
  addChartGroup:         (dashboardId: string, name: string) => string
  removeChartGroup:      (groupId: string) => void
  updateChartGroup:      (groupId: string, patch: Partial<Pick<ChartGroup, 'name' | 'order'>>) => void
  assignWidgetToGroup:   (widgetId: string, groupId: string | null) => void
  getGroupsByDashboard:  (dashboardId: string) => ChartGroup[]
  reorderGroups:         (dashboardId: string, groupId: string, direction: 'up' | 'down') => void

  dashboardFilters:      DashboardFilter[]
  addDashboardFilter:    (dashboardId: string) => string
  updateDashboardFilter: (
    filterId: string,
    patch: Partial<Pick<DashboardFilter, 'field' | 'operator' | 'value' | 'active'>>,
  ) => void
  removeDashboardFilter: (filterId: string) => void
  clearDashboardFilters: (dashboardId: string) => void
  getFiltersByDashboard: (dashboardId: string) => DashboardFilter[]
}

// ── Shared ID generators ──────────────────────────────────────
const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({

      // ── Dashboards ───────────────────────────────────────────
      dashboards:         [],
      currentDashboardId: null,

      addDashboard: (dashboard) => {
        const id = uid('dashboard')
        set(s => ({
          dashboards: [
            ...s.dashboards,
            // ── Fix #3 — ISO string, not new Date() ──────────
            { ...dashboard, id, createdAt: new Date().toISOString() },
          ],
        }))
        return id
      },

      removeDashboard: (id) => set(s => ({
        dashboards:         s.dashboards.filter(d => d.id !== id),
        currentDashboardId: s.currentDashboardId === id ? null : s.currentDashboardId,
        widgets:            s.widgets.filter(w => w.dashboardId !== id),
        chartGroups:        s.chartGroups.filter(g => g.dashboardId !== id),
        dashboardFilters:   s.dashboardFilters.filter(f => f.dashboardId !== id),
        projectConfigs:     Object.fromEntries(
                              Object.entries(s.projectConfigs).filter(([k]) => k !== id)
                            ),
      })),

      updateDashboard: (id, patch) => set(s => ({
        dashboards: s.dashboards.map(d => d.id === id ? { ...d, ...patch } : d),
      })),

      // ── Fix #6 — deleteDashboard removed, use removeDashboard ─

      setCurrentDashboard: (id) => set({ currentDashboardId: id }),

      duplicateDashboard: (id) => {
        const { dashboards, widgets, chartGroups, projectConfigs } = get()
        const source = dashboards.find(d => d.id === id)
        if (!source) return ''

        const newId  = uid('dashboard')
        const now    = new Date().toISOString()
        const idMap  = new Map<string, string>()

        // ── Fix #2 — unique ID per widget, not same Date.now() ─
        const clonedWidgets = widgets
          .filter(w => w.dashboardId === id)
          .map(w => {
            const newWid = uid('widget')
            idMap.set(w.id, newWid)
            return { ...w, id: newWid, dashboardId: newId, createdAt: now, updatedAt: now }
          })

        const clonedGroups = chartGroups
          .filter(g => g.dashboardId === id)
          .map(g => ({
            ...g,
            id:         uid('group'),
            dashboardId: newId,
            widgetIds:  g.widgetIds.map(wid => idMap.get(wid) ?? wid),
          }))

        const sourceConfig = projectConfigs[id]
        const clonedConfig = sourceConfig
          ? { ...sourceConfig, dashboardId: newId, projectTitle: `${sourceConfig.projectTitle} (copy)` }
          : undefined
        const clonedFilters = get().dashboardFilters
          .filter(f => f.dashboardId === id)
          .map(f => ({ ...f, id: uid('filter'), dashboardId: newId }))

        set(s => ({
          dashboards: [
            ...s.dashboards,
            // ── Fix #3 — consistent ISO string ───────────────
            { ...source, id: newId, name: `${source.name} (copy)`, createdAt: now },
          ],
          widgets:        [...s.widgets, ...clonedWidgets],
          chartGroups:    [...s.chartGroups, ...clonedGroups],
          dashboardFilters: [...s.dashboardFilters, ...clonedFilters],
          projectConfigs: clonedConfig
            ? { ...s.projectConfigs, [newId]: clonedConfig }
            : s.projectConfigs,
        }))
        return newId
      },

      // ── Endpoints ────────────────────────────────────────────
      endpoints: [],

      addEndpoint: (endpoint) => {
        const id = uid('endpoint')
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

      // ── Widgets ──────────────────────────────────────────────
      widgets: [],

addWidget: (config) => {
  const { currentDashboardId } = get()
  if (!currentDashboardId) return

  const resolvedMapping = config.dataMapping ?? {
    xAxis: config.xAxis ?? '',
    yAxis: config.yAxis,
  }

  // ✅ Fix: gauge and status-card don't need xAxis
  const needsXAxis = !['gauge', 'ring-gauge', 'status-card'].includes(config.type)
  if (needsXAxis && !resolvedMapping.xAxis) return

  const id  = uid('widget')
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

  if (config.groupId) {
    get().assignWidgetToGroup(id, config.groupId)
  }
},


      removeWidget: (id) => set(s => ({
        widgets:     s.widgets.filter(w => w.id !== id),
        chartGroups: s.chartGroups.map(g => ({
          ...g,
          widgetIds: g.widgetIds.filter(wid => wid !== id),
        })),
      })),

      updateWidget: (id, updates) => {
        const now = new Date().toISOString()
        set(s => ({
          widgets: s.widgets.map(w =>
            w.id === id ? { ...w, ...updates, updatedAt: now } : w
          ),
        }))
      },

      reorderWidgets: (dashboardId, activeId, overId) => {
        set(s => {
          const dash = s.widgets.filter(w => w.dashboardId === dashboardId)
          const rest = s.widgets.filter(w => w.dashboardId !== dashboardId)
          const oi   = dash.findIndex(w => w.id === activeId)
          const ni   = dash.findIndex(w => w.id === overId)
          if (oi === -1 || ni === -1) return s
          const r   = [...dash]
          const [m] = r.splice(oi, 1)
          r.splice(ni, 0, m)
          return { widgets: [...rest, ...r] }
        })
      },

      getWidgetsByDashboard: (dashboardId) =>
        get().widgets.filter(w => w.dashboardId === dashboardId),

      updateWidgetStyle: (id, styleUpdate) => {
        const now = new Date().toISOString()
        set(s => ({
          widgets: s.widgets.map(w =>
            w.id === id
              ? { ...w, style: { ...w.style, ...styleUpdate }, updatedAt: now }
              : w
          ),
        }))
      },

      resetWidgetStyle: (id) => {
        const now = new Date().toISOString()
        set(s => ({
          widgets: s.widgets.map(w =>
            w.id === id ? { ...w, style: { ...DEFAULT_STYLE }, updatedAt: now } : w
          ),
        }))
      },

      // ── Project Config ───────────────────────────────────────
      projectConfigs: {},

      setProjectConfig: (dashboardId, config) => {
        set(s => {
          const existing = s.projectConfigs[dashboardId] ?? {
            ...DEFAULT_PROJECT_CONFIG,
            dashboardId,
          }
          return {
            projectConfigs: {
              ...s.projectConfigs,
              [dashboardId]: { ...existing, ...config, dashboardId },
            },
          }
        })
      },

      getProjectConfig: (dashboardId) =>
        get().projectConfigs[dashboardId] ?? { ...DEFAULT_PROJECT_CONFIG, dashboardId },

      resetProjectConfig: (dashboardId) => {
        set(s => ({
          projectConfigs: {
            ...s.projectConfigs,
            [dashboardId]: { ...DEFAULT_PROJECT_CONFIG, dashboardId },
          },
        }))
      },

      // ── Chart Groups ─────────────────────────────────────────
      chartGroups: [],

      addChartGroup: (dashboardId, name) => {
        const existing = get().chartGroups.filter(g => g.dashboardId === dashboardId)
        const id       = uid('group')
        set(s => ({
          chartGroups: [
            ...s.chartGroups,
            { id, name, dashboardId, order: existing.length, widgetIds: [] },
          ],
        }))
        return id
      },

      removeChartGroup: (groupId) => set(s => ({
        chartGroups: s.chartGroups.filter(g => g.id !== groupId),
        widgets:     s.widgets.map(w =>
          w.groupId === groupId ? { ...w, groupId: undefined } : w
        ),
      })),

      updateChartGroup: (groupId, patch) => set(s => ({
        chartGroups: s.chartGroups.map(g => g.id === groupId ? { ...g, ...patch } : g),
      })),

      assignWidgetToGroup: (widgetId, groupId) => {
        const now = new Date().toISOString()
        set(s => ({
          chartGroups: s.chartGroups.map(g => ({
            ...g,
            widgetIds: g.id === groupId
              ? [...new Set([...g.widgetIds, widgetId])]
              : g.widgetIds.filter(id => id !== widgetId),
          })),
          widgets: s.widgets.map(w =>
            w.id === widgetId
              ? { ...w, groupId: groupId ?? undefined, updatedAt: now }
              : w
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

          const idx     = groups.findIndex(g => g.id === groupId)
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1
          if (swapIdx < 0 || swapIdx >= groups.length) return s

          // ── Fix #5 — copy, don't mutate objects in place ────
          const updated = groups.map(g => ({ ...g }))
          const tmpOrder        = updated[idx].order
          updated[idx].order    = updated[swapIdx].order
          updated[swapIdx].order = tmpOrder

          const orderMap = new Map(updated.map(g => [g.id, g.order]))
          return {
            chartGroups: s.chartGroups.map(g =>
              orderMap.has(g.id) ? { ...g, order: orderMap.get(g.id)! } : g
            ),
          }
        })
      },

      dashboardFilters: [],

      addDashboardFilter: (dashboardId) => {
        const id = uid('filter')
        const next: DashboardFilter = {
          id,
          dashboardId,
          field: '',
          operator: 'contains',
          value: '',
          active: true,
        }
        set(s => ({ dashboardFilters: [...s.dashboardFilters, next] }))
        return id
      },

      updateDashboardFilter: (filterId, patch) => {
        const safePatch = patch.operator
          ? { ...patch, operator: patch.operator as FilterOperator }
          : patch
        set(s => ({
          dashboardFilters: s.dashboardFilters.map(f =>
            f.id === filterId ? { ...f, ...safePatch } : f,
          ),
        }))
      },

      removeDashboardFilter: (filterId) => {
        set(s => ({
          dashboardFilters: s.dashboardFilters.filter(f => f.id !== filterId),
        }))
      },

      clearDashboardFilters: (dashboardId) => {
        set(s => ({
          dashboardFilters: s.dashboardFilters.filter(f => f.dashboardId !== dashboardId),
        }))
      },

      getFiltersByDashboard: (dashboardId) =>
        get().dashboardFilters.filter(f => f.dashboardId === dashboardId),
    }),
    {
      name: 'dashboard-storage',
      version: STORE_VERSION,
      migrate: (persistedState: any, fromVersion: number) => {
        if (!persistedState) {
          return {
            dashboards:         [],
            widgets:            [],
            endpoints:          [],
            projectConfigs:     {},
            chartGroups:        [],
            dashboardFilters:   [],
            currentDashboardId: null,
          }
        }
        // Keep existing data while introducing new fields in v3.
        if (fromVersion < STORE_VERSION) {
          return {
            ...persistedState,
            dashboards: persistedState.dashboards ?? [],
            widgets: persistedState.widgets ?? [],
            endpoints: persistedState.endpoints ?? [],
            projectConfigs: persistedState.projectConfigs ?? {},
            chartGroups: persistedState.chartGroups ?? [],
            dashboardFilters: persistedState.dashboardFilters ?? [],
            currentDashboardId: persistedState.currentDashboardId ?? null,
          }
        }
        return {
          ...persistedState,
          dashboardFilters: persistedState.dashboardFilters ?? [],
        }
      },
    }

  ),
)
