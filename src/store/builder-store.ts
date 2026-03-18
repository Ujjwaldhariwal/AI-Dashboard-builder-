// src/store/builder-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Widget, WidgetConfigInput, WidgetStyle, ChartType } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import type { ProjectConfig, ChartGroup } from '@/types/project-config'
import { DEFAULT_PROJECT_CONFIG } from '@/types/project-config'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth-store'

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
  dashboardId?:    string
  name:            string
  url:             string
  method:          'GET' | 'POST'
  authType:        'none' | 'api-key' | 'bearer' | 'basic' | 'custom-headers'
  headers?:        Record<string, string>
  body?:           unknown
  refreshInterval: number
  status:          'active' | 'inactive'
}

interface DragState {
  isDragging: boolean
  activeWidgetId: string | null
  overWidgetId: string | null
}

// ── Fix #8 — version field for future migrations ──────────────
const STORE_VERSION = 3
const supabase = createClient()
const CHART_TYPES: readonly ChartType[] = [
  'bar',
  'line',
  'area',
  'pie',
  'donut',
  'horizontal-bar',
  'horizontal-stacked-bar',
  'grouped-bar',
  'drilldown-bar',
  'gauge',
  'ring-gauge',
  'status-card',
  'table',
]
const DEFAULT_DRAG_STATE: DragState = {
  isDragging: false,
  activeWidgetId: null,
  overWidgetId: null,
}
const DEFAULT_WIDGET_POSITION = { x: 0, y: 0, w: 6, h: 4 } as const

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const getUserId = () => useAuthStore.getState().user?.id ?? null

const isChartType = (value: unknown): value is ChartType =>
  typeof value === 'string' && CHART_TYPES.includes(value as ChartType)

const normalizeHeaders = (value: unknown): Record<string, string> => {
  const record = asRecord(value)
  if (!record) return {}
  return Object.fromEntries(
    Object.entries(record).map(([key, val]) => [key, String(val)]),
  )
}

const normalizeWidgetPosition = (row: Record<string, unknown>) => {
  const positionRecord = asRecord(row.position)
  const sizeRecord = asRecord(row.size)
  const numericY =
    typeof row.position === 'number'
      ? row.position
      : typeof row.position === 'string'
        ? Number(row.position)
        : null

  const source = positionRecord ?? sizeRecord ?? {}
  const x = Number(source.x ?? 0)
  const fallbackY = numericY !== null && Number.isFinite(numericY) ? numericY : 0
  const yFromObject = Number(source.y ?? fallbackY)
  const w = Number(source.w ?? 6)
  const h = Number(source.h ?? 4)

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(yFromObject) ? yFromObject : 0,
    w: Number.isFinite(w) && w > 0 ? w : 6,
    h: Number.isFinite(h) && h > 0 ? h : 4,
  }
}

const updateWidgetRecordWithLayoutFallback = async (
  id: string,
  _userId: string,
  payload: Record<string, unknown>,
  position: { x: number; y: number; w: number; h: number },
) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
    }

    const response = await fetch('/api/widgets/update', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id,
        payload,
        position,
      }),
    })

    if (response.ok) return null

    const parsed = await response.json().catch(() => null)
    const message =
      typeof parsed?.error === 'string'
        ? parsed.error
        : `Widget update failed (${response.status})`
    return { message }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { message }
  }
}

interface DashboardStore {
  dashboards:            Dashboard[]
  currentDashboardId:    string | null
  selectedDashboardId:   string | null
  activeWidgetId:        string | null
  dragState:             DragState
  isHydrating:           boolean
  isSyncing:             boolean
  hasLoadedRemote:       boolean
  lastSyncError:         string | null
  initializeFromSupabase: () => Promise<void>
  syncFromSupabase:      () => Promise<void>
  setActiveWidgetId:     (id: string | null) => void
  setDragState:          (patch: Partial<DragState>) => void
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
}

// ── Shared ID generators ──────────────────────────────────────
const generateUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : ((random & 0x3) | 0x8)
    return value.toString(16)
  })
}

const dbId = () => generateUuid()
const localId = (prefix: string) => `${prefix}-${generateUuid()}`

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({

      // ── Dashboards ───────────────────────────────────────────
      dashboards:         [],
      currentDashboardId: null,
      selectedDashboardId: null,
      activeWidgetId: null,
      dragState: { ...DEFAULT_DRAG_STATE },
      isHydrating: false,
      isSyncing: false,
      hasLoadedRemote: false,
      lastSyncError: null,

      initializeFromSupabase: async () => {
        if (get().hasLoadedRemote || get().isHydrating) return
        await get().syncFromSupabase()
      },

      syncFromSupabase: async () => {
        const userId = getUserId()
        if (!userId) {
          set({
            dashboards: [],
            endpoints: [],
            widgets: [],
            currentDashboardId: null,
            selectedDashboardId: null,
            hasLoadedRemote: true,
            isHydrating: false,
          })
          return
        }

        set({ isHydrating: true, lastSyncError: null })

        try {
          const [dashRes, endpointRes, widgetRes] = await Promise.all([
            supabase
              .from('dashboards')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: true }),
            supabase
              .from('endpoints')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: true }),
            supabase
              .from('widgets')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: true }),
          ])

          if (dashRes.error) throw dashRes.error
          if (endpointRes.error) throw endpointRes.error
          if (widgetRes.error) throw widgetRes.error

          const dashboards = (dashRes.data ?? []).map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description ?? '',
            createdAt: row.created_at ?? new Date().toISOString(),
            ownerId: row.user_id,
          }))

          const endpoints = (endpointRes.data ?? []).map((row: any) => {
            const body = asRecord(row.body)
            const payload = body && 'payload' in body ? body.payload : row.body
            const metaStatus = body && typeof body.__meta_status === 'string'
              ? body.__meta_status
              : null
            return {
              id: row.id,
              dashboardId: row.dashboard_id ?? undefined,
              name: row.name ?? 'Untitled Endpoint',
              url: row.url ?? '',
              method: row.method === 'POST' ? 'POST' : 'GET',
              authType: row.auth_type === 'api-key'
                || row.auth_type === 'bearer'
                || row.auth_type === 'basic'
                || row.auth_type === 'custom-headers'
                ? row.auth_type
                : 'none',
              headers: normalizeHeaders(row.headers),
              body: payload === null ? undefined : payload,
              refreshInterval: typeof row.refresh_interval === 'number' ? row.refresh_interval : 30,
              status: metaStatus === 'inactive' ? 'inactive' : 'active',
            } as APIEndpoint
          })

          const widgets = (widgetRes.data ?? []).map((row: any) => {
            const normalizedPosition = normalizeWidgetPosition(row as Record<string, unknown>)
            return {
              id: row.id,
              dashboardId: row.dashboard_id ?? '',
              title: row.title ?? 'Untitled Widget',
              type: isChartType(row.type) ? row.type : 'bar',
              deps: 'echarts' as const,
              endpointId: row.endpoint_id ?? '',
              dataMapping: (asRecord(row.data_mapping) ?? { xAxis: '' }) as any,
              style: { ...DEFAULT_STYLE, ...(asRecord(row.style) ?? {}) },
              position: normalizedPosition,
              createdAt: row.created_at ?? new Date().toISOString(),
              updatedAt: row.created_at ?? new Date().toISOString(),
            } as Widget
          })

          const preferred = get().selectedDashboardId ?? get().currentDashboardId
          const resolvedDashboardId = preferred && dashboards.some(d => d.id === preferred)
            ? preferred
            : (dashboards[0]?.id ?? null)

          set({
            dashboards,
            endpoints,
            widgets,
            currentDashboardId: resolvedDashboardId,
            selectedDashboardId: resolvedDashboardId,
            hasLoadedRemote: true,
            isHydrating: false,
            lastSyncError: null,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          set({
            lastSyncError: message,
            hasLoadedRemote: true,
            isHydrating: false,
          })
        }
      },

      setActiveWidgetId: (id) => set({ activeWidgetId: id }),

      setDragState: (patch) => set((s) => ({
        dragState: { ...s.dragState, ...patch },
      })),

      addDashboard: (dashboard) => {
        const id = dbId()
        const createdAt = new Date().toISOString()
        set(s => ({
          dashboards: [
            ...s.dashboards,
            // ── Fix #3 — ISO string, not new Date() ──────────
            { ...dashboard, id, createdAt },
          ],
          currentDashboardId: s.currentDashboardId ?? id,
          selectedDashboardId: s.selectedDashboardId ?? id,
        }))

        const userId = getUserId()
        if (!userId) {
          set({ lastSyncError: 'Dashboard created locally but no authenticated user is available for persistence.' })
          return id
        }

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('dashboards')
              .insert({
                id,
                user_id: userId,
                name: dashboard.name,
                description: dashboard.description || null,
                created_at: createdAt,
                updated_at: createdAt,
              })
            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()

        return id
      },

      removeDashboard: (id) => {
        set(s => {
          return {
            dashboards:         s.dashboards.filter(d => d.id !== id),
            currentDashboardId: s.currentDashboardId === id ? null : s.currentDashboardId,
            selectedDashboardId: s.selectedDashboardId === id ? null : s.selectedDashboardId,
            widgets:            s.widgets.filter(w => w.dashboardId !== id),
            endpoints:          s.endpoints.filter(e => e.dashboardId !== id),
            chartGroups:        s.chartGroups.filter(g => g.dashboardId !== id),
            projectConfigs:     Object.fromEntries(
                                  Object.entries(s.projectConfigs).filter(([k]) => k !== id)
                                ),
          }
        })

        const userId = getUserId()
        if (!userId) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('dashboards')
              .delete()
              .eq('id', id)
              .eq('user_id', userId)
            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
      },

      updateDashboard: (id, patch) => {
        set(s => ({
          dashboards: s.dashboards.map(d => d.id === id ? { ...d, ...patch } : d),
        }))

        const userId = getUserId()
        if (!userId) return

        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (patch.name !== undefined) payload.name = patch.name
        if (patch.description !== undefined) payload.description = patch.description

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('dashboards')
              .upsert(
                {
                  id,
                  user_id: userId,
                  ...payload,
                },
                { onConflict: 'id' },
              )
            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
      },

      // ── Fix #6 — deleteDashboard removed, use removeDashboard ─

      setCurrentDashboard: (id) => set({
        currentDashboardId: id,
        selectedDashboardId: id,
      }),

      duplicateDashboard: (id) => {
        const { dashboards, endpoints, widgets, chartGroups, projectConfigs } = get()
        const source = dashboards.find(d => d.id === id)
        if (!source) return ''

        const newId  = dbId()
        const now    = new Date().toISOString()
        const widgetIdMap = new Map<string, string>()
        const endpointIdMap = new Map<string, string>()

        const clonedEndpoints = endpoints
          .filter(endpoint => endpoint.dashboardId === id)
          .map(endpoint => {
            const newEndpointId = dbId()
            endpointIdMap.set(endpoint.id, newEndpointId)
            return {
              ...endpoint,
              id: newEndpointId,
              dashboardId: newId,
            }
          })

        const clonedWidgets = widgets
          .filter(w => w.dashboardId === id)
          .map(w => {
            const newWid = dbId()
            widgetIdMap.set(w.id, newWid)
            return {
              ...w,
              id: newWid,
              dashboardId: newId,
              endpointId: endpointIdMap.get(w.endpointId) ?? w.endpointId,
              createdAt: now,
              updatedAt: now,
            }
          })

        const clonedGroups = chartGroups
          .filter(g => g.dashboardId === id)
          .map(g => ({
            ...g,
            id:         localId('group'),
            dashboardId: newId,
            widgetIds:  g.widgetIds.map(wid => widgetIdMap.get(wid) ?? wid),
          }))

        const sourceConfig = projectConfigs[id]
        const clonedConfig = sourceConfig
          ? { ...sourceConfig, dashboardId: newId, projectTitle: `${sourceConfig.projectTitle} (copy)` }
          : undefined

        set(s => ({
          dashboards: [
            ...s.dashboards,
            { ...source, id: newId, name: `${source.name} (copy)`, createdAt: now },
          ],
          endpoints:      [...s.endpoints, ...clonedEndpoints],
          widgets:        [...s.widgets, ...clonedWidgets],
          chartGroups:    [...s.chartGroups, ...clonedGroups],
          projectConfigs: clonedConfig
            ? { ...s.projectConfigs, [newId]: clonedConfig }
            : s.projectConfigs,
        }))

        const userId = getUserId()
        if (userId) {
          set({ isSyncing: true })
          void (async () => {
            try {
              const { error: dashboardError } = await supabase
                .from('dashboards')
                .insert({
                  id: newId,
                  user_id: userId,
                  name: `${source.name} (copy)`,
                  description: source.description || null,
                  created_at: now,
                  updated_at: now,
                })
              if (dashboardError) throw dashboardError

              if (clonedEndpoints.length > 0) {
                const endpointPayload = clonedEndpoints.map(endpoint => ({
                  id: endpoint.id,
                  dashboard_id: newId,
                  user_id: userId,
                  name: endpoint.name,
                  url: endpoint.url,
                  method: endpoint.method,
                  auth_type: endpoint.authType,
                  headers: endpoint.headers ?? {},
                  body: {
                    payload: endpoint.body ?? null,
                    __meta_status: endpoint.status,
                  },
                  refresh_interval: endpoint.refreshInterval,
                  created_at: now,
                }))
                const { error: endpointsError } = await supabase
                  .from('endpoints')
                  .insert(endpointPayload)
                if (endpointsError) throw endpointsError
              }

              if (clonedWidgets.length > 0) {
                const payload = clonedWidgets.map(widget => ({
                  id: widget.id,
                  dashboard_id: newId,
                  endpoint_id: widget.endpointId,
                  user_id: userId,
                  title: widget.title,
                  type: widget.type,
                  data_mapping: widget.dataMapping,
                  style: widget.style,
                  position: widget.position ?? { x: 0, y: 0, w: 6, h: 4 },
                  size: widget.position ?? { x: 0, y: 0, w: 6, h: 4 },
                  created_at: now,
                }))
                const { error: widgetsError } = await supabase
                  .from('widgets')
                  .insert(payload)
                if (widgetsError) throw widgetsError
              }
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error)
              set({ lastSyncError: message })
              await get().syncFromSupabase()
            } finally {
              set({ isSyncing: false })
            }
          })()
        }

        return newId
      },

      endpoints: [],

      addEndpoint: (endpoint) => {
        const id = dbId()
        const dashboardId = endpoint.dashboardId ?? get().currentDashboardId
        if (!dashboardId) return ''

        const nextEndpoint: APIEndpoint = {
          ...endpoint,
          id,
          dashboardId,
          status: endpoint.status ?? 'active',
        }
        set(s => ({ endpoints: [...s.endpoints, nextEndpoint] }))

        const userId = getUserId()
        if (!userId) {
          set({ lastSyncError: 'Endpoint created locally but no authenticated user is available for persistence.' })
          return id
        }

        const body = {
          payload: nextEndpoint.body ?? null,
          __meta_status: nextEndpoint.status,
        }

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('endpoints')
              .insert({
                id,
                dashboard_id: dashboardId,
                user_id: userId,
                name: nextEndpoint.name,
                url: nextEndpoint.url,
                method: nextEndpoint.method,
                auth_type: nextEndpoint.authType,
                headers: nextEndpoint.headers ?? {},
                body,
                refresh_interval: nextEndpoint.refreshInterval,
              })
            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
        return id
      },

      removeEndpoint: (id) => {
        set(s => ({
          endpoints: s.endpoints.filter(e => e.id !== id),
          widgets:   s.widgets.filter(w => w.endpointId !== id),
        }))

        const userId = getUserId()
        if (!userId) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('endpoints')
              .delete()
              .eq('id', id)
              .eq('user_id', userId)
            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
      },

      updateEndpoint: (id, updates) => {
        set(s => ({
          endpoints: s.endpoints.map(e => e.id === id ? { ...e, ...updates } : e),
        }))

        const userId = getUserId()
        if (!userId) return

        const endpoint = get().endpoints.find(e => e.id === id)
        if (!endpoint) return

        const body = {
          payload: endpoint.body ?? null,
          __meta_status: endpoint.status,
        }

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('endpoints')
              .upsert(
                {
                  id,
                  user_id: userId,
                  name: endpoint.name,
                  url: endpoint.url,
                  method: endpoint.method,
                  auth_type: endpoint.authType,
                  headers: endpoint.headers ?? {},
                  body,
                  refresh_interval: endpoint.refreshInterval,
                },
                { onConflict: 'id' },
              )
            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
      },

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

  const id  = dbId()
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
    position:    config.position ?? { x: 0, y: 0, w: 6, h: 4 },
    createdAt:   now,
    updatedAt:   now,
  }
  set(s => ({ widgets: [...s.widgets, newWidget] }))

  if (config.groupId) {
    get().assignWidgetToGroup(id, config.groupId)
  }

  const userId = getUserId()
  if (!userId) {
    set({ lastSyncError: 'Widget created locally but no authenticated user is available for persistence.' })
    return
  }

  set({ isSyncing: true })
  void (async () => {
    try {
      const baseInsert = {
        id,
        dashboard_id: currentDashboardId,
        endpoint_id: newWidget.endpointId,
        user_id: userId,
        title: newWidget.title,
        type: newWidget.type,
        data_mapping: newWidget.dataMapping,
        style: newWidget.style,
        created_at: now,
      }
      const layout = newWidget.position ?? { ...DEFAULT_WIDGET_POSITION }
      const attempts: Array<Record<string, unknown>> = [
        { ...baseInsert, position: layout, size: layout },
        { ...baseInsert, position: layout },
        { ...baseInsert, position: layout.y, size: layout },
        { ...baseInsert, position: layout.y },
      ]

      let insertError: { message: string } | null = null
      for (const attempt of attempts) {
        const { error } = await supabase.from('widgets').insert(attempt)
        if (!error) {
          insertError = null
          break
        }
        insertError = error
      }

      if (insertError) {
        set({ lastSyncError: insertError.message })
        void get().syncFromSupabase()
      } else {
        set({ lastSyncError: null })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      set({ lastSyncError: message })
      void get().syncFromSupabase()
    } finally {
      set({ isSyncing: false })
    }
  })()
},


      removeWidget: (id) => {
        set(s => ({
          widgets:     s.widgets.filter(w => w.id !== id),
          chartGroups: s.chartGroups.map(g => ({
            ...g,
            widgetIds: g.widgetIds.filter(wid => wid !== id),
          })),
        }))

        const userId = getUserId()
        if (!userId) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('widgets')
              .delete()
              .eq('id', id)
              .eq('user_id', userId)
            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
      },

      updateWidget: (id, updates) => {
        const now = new Date().toISOString()
        set(s => ({
          widgets: s.widgets.map(w =>
            w.id === id ? { ...w, ...updates, updatedAt: now } : w
          ),
        }))

        const userId = getUserId()
        if (!userId) return

        const widget = get().widgets.find(w => w.id === id)
        if (!widget) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const layout = widget.position ?? { ...DEFAULT_WIDGET_POSITION }
            const error = await updateWidgetRecordWithLayoutFallback(
              id,
              userId,
              {
                title: widget.title,
                type: widget.type,
                endpoint_id: widget.endpointId,
                data_mapping: widget.dataMapping,
                style: widget.style,
              },
              layout,
            )

            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            } else {
              set({ lastSyncError: null })
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
      },

      reorderWidgets: (dashboardId, activeId, overId) => {
        const previousWidgets = get().widgets
        set(s => {
          const dash = s.widgets.filter(w => w.dashboardId === dashboardId)
          const rest = s.widgets.filter(w => w.dashboardId !== dashboardId)
          const oi   = dash.findIndex(w => w.id === activeId)
          const ni   = dash.findIndex(w => w.id === overId)
          if (oi === -1 || ni === -1) return s
          const r   = [...dash]
          const [m] = r.splice(oi, 1)
          r.splice(ni, 0, m)
          return {
            widgets: [...rest, ...r.map((w, index) => ({
              ...w,
              position: {
                ...(w.position ?? { x: 0, y: 0, w: 6, h: 4 }),
                y: index,
              },
            }))],
          }
        })

        const userId = getUserId()
        if (!userId) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const ordered = get()
              .widgets
              .filter(w => w.dashboardId === dashboardId)
              .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))

            const updates = await Promise.all(
              ordered.map(async (w, index) => {
                const layout = {
                  ...(w.position ?? { ...DEFAULT_WIDGET_POSITION }),
                  y: index,
                }
                const error = await updateWidgetRecordWithLayoutFallback(
                  w.id,
                  userId,
                  {},
                  layout,
                )
                return { error }
              }),
            )

            const failed = updates.find(res => res.error)
            if (failed?.error) {
              set({ lastSyncError: failed.error.message, widgets: previousWidgets })
              await get().syncFromSupabase()
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message, widgets: previousWidgets })
            await get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
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

        const userId = getUserId()
        if (!userId) return

        const widget = get().widgets.find(w => w.id === id)
        if (!widget) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const layout = widget.position ?? { ...DEFAULT_WIDGET_POSITION }
            const error = await updateWidgetRecordWithLayoutFallback(
              id,
              userId,
              {
                style: widget.style,
                data_mapping: widget.dataMapping,
              },
              layout,
            )

            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            } else {
              set({ lastSyncError: null })
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
      },

      resetWidgetStyle: (id) => {
        const now = new Date().toISOString()
        set(s => ({
          widgets: s.widgets.map(w =>
            w.id === id ? { ...w, style: { ...DEFAULT_STYLE }, updatedAt: now } : w
          ),
        }))

        const userId = getUserId()
        if (!userId) return

        const widget = get().widgets.find(w => w.id === id)
        if (!widget) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const layout = widget.position ?? { ...DEFAULT_WIDGET_POSITION }
            const error = await updateWidgetRecordWithLayoutFallback(
              id,
              userId,
              {
                style: widget.style,
                data_mapping: widget.dataMapping,
              },
              layout,
            )
            if (error) {
              set({ lastSyncError: error.message })
              void get().syncFromSupabase()
            } else {
              set({ lastSyncError: null })
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
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
        const id       = localId('group')
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
    }),
    {
      name: 'dashboard-storage',
      version: STORE_VERSION,
      partialize: (state) => ({
        currentDashboardId: state.currentDashboardId,
        selectedDashboardId: state.selectedDashboardId,
        activeWidgetId: state.activeWidgetId,
        dragState: state.dragState,
      }),
      migrate: (persistedState: any, fromVersion: number) => {
        const safe = persistedState ?? {}
        if (fromVersion < STORE_VERSION) {
          return {
            currentDashboardId: safe.currentDashboardId ?? safe.selectedDashboardId ?? null,
            selectedDashboardId: safe.selectedDashboardId ?? safe.currentDashboardId ?? null,
            activeWidgetId: safe.activeWidgetId ?? null,
            dragState: safe.dragState ?? { ...DEFAULT_DRAG_STATE },
          }
        }
        return {
          currentDashboardId: safe.currentDashboardId ?? safe.selectedDashboardId ?? null,
          selectedDashboardId: safe.selectedDashboardId ?? safe.currentDashboardId ?? null,
          activeWidgetId: safe.activeWidgetId ?? null,
          dragState: safe.dragState ?? { ...DEFAULT_DRAG_STATE },
        }
      },
      merge: (persistedState, currentState) => {
        const safe = (persistedState ?? {}) as Record<string, unknown>
        return {
          ...currentState,
          currentDashboardId:
            typeof safe.currentDashboardId === 'string' || safe.currentDashboardId === null
              ? (safe.currentDashboardId as string | null)
              : currentState.currentDashboardId,
          selectedDashboardId:
            typeof safe.selectedDashboardId === 'string' || safe.selectedDashboardId === null
              ? (safe.selectedDashboardId as string | null)
              : currentState.selectedDashboardId,
          activeWidgetId:
            typeof safe.activeWidgetId === 'string' || safe.activeWidgetId === null
              ? (safe.activeWidgetId as string | null)
              : currentState.activeWidgetId,
          dragState:
            asRecord(safe.dragState)
              ? {
                  isDragging: Boolean(asRecord(safe.dragState)?.isDragging),
                  activeWidgetId:
                    typeof asRecord(safe.dragState)?.activeWidgetId === 'string'
                      ? (asRecord(safe.dragState)?.activeWidgetId as string)
                      : null,
                  overWidgetId:
                    typeof asRecord(safe.dragState)?.overWidgetId === 'string'
                      ? (asRecord(safe.dragState)?.overWidgetId as string)
                      : null,
                }
              : currentState.dragState,
        }
      },
    }

  ),
)

let authSyncInitialized = false
const initializeAuthSync = () => {
  if (authSyncInitialized || typeof window === 'undefined') return
  authSyncInitialized = true

  let previousUserId = getUserId()
  void useDashboardStore.getState().initializeFromSupabase()

  useAuthStore.subscribe((state) => {
    const nextUserId = state.user?.id ?? null
    if (nextUserId === previousUserId) return
    previousUserId = nextUserId

    if (!nextUserId) {
      useDashboardStore.setState({
        dashboards: [],
        endpoints: [],
        widgets: [],
        currentDashboardId: null,
        selectedDashboardId: null,
        activeWidgetId: null,
        dragState: { ...DEFAULT_DRAG_STATE },
        hasLoadedRemote: true,
        isHydrating: false,
      })
      return
    }

    void useDashboardStore.getState().syncFromSupabase()
  })
}

initializeAuthSync()
