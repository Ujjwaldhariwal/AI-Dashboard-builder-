// src/store/builder-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Widget, WidgetConfigInput, WidgetStyle, ChartType } from '@/types/widget'
import { DEFAULT_STYLE } from '@/types/widget'
import type { ProjectConfig, ChartGroup, ChartSubgroup } from '@/types/project-config'
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
const STORE_VERSION = 4
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
  chartSubgroups:        ChartSubgroup[]
  addChartGroup:         (dashboardId: string, name: string) => string
  removeChartGroup:      (groupId: string) => void
  updateChartGroup:      (groupId: string, patch: Partial<Pick<ChartGroup, 'name' | 'order'>>) => void
  assignWidgetToGroup:   (widgetId: string, groupId: string | null) => void
  getGroupsByDashboard:  (dashboardId: string) => ChartGroup[]
  reorderGroups:         (dashboardId: string, groupId: string, direction: 'up' | 'down') => void
  addChartSubgroup:      (dashboardId: string, groupId: string, name: string) => string
  removeChartSubgroup:   (subgroupId: string) => void
  updateChartSubgroup:   (subgroupId: string, patch: Partial<Pick<ChartSubgroup, 'name' | 'order'>>) => void
  assignWidgetToSubgroup: (widgetId: string, subgroupId: string | null) => void
  getSubgroupsByGroup:   (groupId: string) => ChartSubgroup[]
  reorderSubgroups:      (groupId: string, subgroupId: string, direction: 'up' | 'down') => void
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
            chartGroups: [],
            chartSubgroups: [],
            currentDashboardId: null,
            selectedDashboardId: null,
            hasLoadedRemote: true,
            isHydrating: false,
          })
          return
        }

        set({ isHydrating: true, lastSyncError: null })

        try {
          const [dashRes, endpointRes, widgetRes, groupRes, subgroupRes] = await Promise.all([
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
            supabase
              .from('chart_groups')
              .select('*')
              .eq('user_id', userId)
              .order('sort_order', { ascending: true }),
            supabase
              .from('chart_subgroups')
              .select('*')
              .eq('user_id', userId)
              .order('sort_order', { ascending: true }),
          ])

          if (dashRes.error) throw dashRes.error
          if (endpointRes.error) throw endpointRes.error
          if (widgetRes.error) throw widgetRes.error
          if (groupRes.error) throw groupRes.error
          if (subgroupRes.error) throw subgroupRes.error

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
              groupId: row.group_id ?? undefined,
              subgroupId: row.subgroup_id ?? undefined,
              sectionName: typeof row.section_name === 'string' ? row.section_name : undefined,
              position: normalizedPosition,
              createdAt: row.created_at ?? new Date().toISOString(),
              updatedAt: row.created_at ?? new Date().toISOString(),
            } as Widget
          })

          const widgetIdsByGroup = new Map<string, string[]>()
          const widgetIdsBySubgroup = new Map<string, string[]>()
          widgets.forEach(widget => {
            if (widget.groupId) {
              const next = widgetIdsByGroup.get(widget.groupId) ?? []
              next.push(widget.id)
              widgetIdsByGroup.set(widget.groupId, next)
            }
            if (widget.subgroupId) {
              const next = widgetIdsBySubgroup.get(widget.subgroupId) ?? []
              next.push(widget.id)
              widgetIdsBySubgroup.set(widget.subgroupId, next)
            }
          })

          const chartGroups = (groupRes.data ?? []).map((row: any) => ({
            id: row.id,
            name: row.name ?? 'Group',
            dashboardId: row.dashboard_id ?? '',
            order: typeof row.sort_order === 'number' ? row.sort_order : 0,
            widgetIds: widgetIdsByGroup.get(row.id) ?? [],
          } satisfies ChartGroup))

          const chartSubgroups = (subgroupRes.data ?? []).map((row: any) => ({
            id: row.id,
            groupId: row.group_id ?? '',
            name: row.name ?? 'Subgroup',
            dashboardId: row.dashboard_id ?? '',
            order: typeof row.sort_order === 'number' ? row.sort_order : 0,
            widgetIds: widgetIdsBySubgroup.get(row.id) ?? [],
          } satisfies ChartSubgroup))

          const preferred = get().selectedDashboardId ?? get().currentDashboardId
          const resolvedDashboardId = preferred && dashboards.some(d => d.id === preferred)
            ? preferred
            : (dashboards[0]?.id ?? null)

          set({
            dashboards,
            endpoints,
            widgets,
            chartGroups,
            chartSubgroups,
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
            chartSubgroups:     s.chartSubgroups.filter(subgroup => subgroup.dashboardId !== id),
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
        const { dashboards, endpoints, widgets, chartGroups, chartSubgroups, projectConfigs } = get()
        const source = dashboards.find(d => d.id === id)
        if (!source) return ''

        const newId  = dbId()
        const now    = new Date().toISOString()
        const widgetIdMap = new Map<string, string>()
        const endpointIdMap = new Map<string, string>()
        const groupIdMap = new Map<string, string>()
        const subgroupIdMap = new Map<string, string>()

        const sourceWidgets = widgets.filter(w => w.dashboardId === id)
        sourceWidgets.forEach(widget => {
          widgetIdMap.set(widget.id, dbId())
        })

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

        const clonedGroups = chartGroups
          .filter(g => g.dashboardId === id)
          .map(g => {
            const newGroupId = dbId()
            groupIdMap.set(g.id, newGroupId)
            return {
              ...g,
              id: newGroupId,
              dashboardId: newId,
              widgetIds: g.widgetIds.map(wid => widgetIdMap.get(wid) ?? wid),
            }
          })

        const clonedSubgroups = chartSubgroups
          .filter(subgroup => subgroup.dashboardId === id)
          .map(subgroup => {
            const newSubgroupId = dbId()
            subgroupIdMap.set(subgroup.id, newSubgroupId)
            return {
              ...subgroup,
              id: newSubgroupId,
              dashboardId: newId,
              groupId: groupIdMap.get(subgroup.groupId) ?? subgroup.groupId,
              widgetIds: subgroup.widgetIds.map(wid => widgetIdMap.get(wid) ?? wid),
            }
          })

        const clonedWidgets = sourceWidgets.map(w => ({
          ...w,
          id: widgetIdMap.get(w.id) ?? w.id,
          dashboardId: newId,
          endpointId: endpointIdMap.get(w.endpointId) ?? w.endpointId,
          groupId: w.groupId ? (groupIdMap.get(w.groupId) ?? w.groupId) : undefined,
          subgroupId: w.subgroupId ? (subgroupIdMap.get(w.subgroupId) ?? w.subgroupId) : undefined,
          createdAt: now,
          updatedAt: now,
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
          chartSubgroups: [...s.chartSubgroups, ...clonedSubgroups],
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

              if (clonedGroups.length > 0) {
                const groupPayload = clonedGroups.map(group => ({
                  id: group.id,
                  dashboard_id: newId,
                  user_id: userId,
                  name: group.name,
                  sort_order: group.order,
                  created_at: now,
                  updated_at: now,
                }))
                const { error: groupsError } = await supabase
                  .from('chart_groups')
                  .insert(groupPayload)
                if (groupsError) throw groupsError
              }

              if (clonedSubgroups.length > 0) {
                const subgroupPayload = clonedSubgroups.map(subgroup => ({
                  id: subgroup.id,
                  dashboard_id: newId,
                  group_id: subgroup.groupId,
                  user_id: userId,
                  name: subgroup.name,
                  sort_order: subgroup.order,
                  created_at: now,
                  updated_at: now,
                }))
                const { error: subgroupsError } = await supabase
                  .from('chart_subgroups')
                  .insert(subgroupPayload)
                if (subgroupsError) throw subgroupsError
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
                  group_id: widget.groupId ?? null,
                  subgroup_id: widget.subgroupId ?? null,
                  section_name: widget.sectionName ?? null,
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
    subgroupId:  config.subgroupId,
    sectionName: config.sectionName,
    position:    config.position ?? { x: 0, y: 0, w: 6, h: 4 },
    createdAt:   now,
    updatedAt:   now,
  }
  set(s => ({
    widgets: [...s.widgets, newWidget],
    chartGroups: s.chartGroups.map(group => ({
      ...group,
      widgetIds: group.id === newWidget.groupId
        ? [...new Set([...group.widgetIds, newWidget.id])]
        : group.widgetIds,
    })),
    chartSubgroups: s.chartSubgroups.map(subgroup => ({
      ...subgroup,
      widgetIds: subgroup.id === newWidget.subgroupId
        ? [...new Set([...subgroup.widgetIds, newWidget.id])]
        : subgroup.widgetIds,
    })),
  }))

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
        group_id: newWidget.groupId ?? null,
        subgroup_id: newWidget.subgroupId ?? null,
        section_name: newWidget.sectionName ?? null,
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
          chartSubgroups: s.chartSubgroups.map(subgroup => ({
            ...subgroup,
            widgetIds: subgroup.widgetIds.filter(wid => wid !== id),
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
        set(s => {
          const nextWidgets = s.widgets.map(w =>
            w.id === id ? { ...w, ...updates, updatedAt: now } : w,
          )
          const widgetIdsByGroup = new Map<string, string[]>()
          const widgetIdsBySubgroup = new Map<string, string[]>()
          nextWidgets.forEach(widget => {
            if (widget.groupId) {
              const next = widgetIdsByGroup.get(widget.groupId) ?? []
              next.push(widget.id)
              widgetIdsByGroup.set(widget.groupId, next)
            }
            if (widget.subgroupId) {
              const next = widgetIdsBySubgroup.get(widget.subgroupId) ?? []
              next.push(widget.id)
              widgetIdsBySubgroup.set(widget.subgroupId, next)
            }
          })

          return {
            widgets: nextWidgets,
            chartGroups: s.chartGroups.map(group => ({
              ...group,
              widgetIds: widgetIdsByGroup.get(group.id) ?? [],
            })),
            chartSubgroups: s.chartSubgroups.map(subgroup => ({
              ...subgroup,
              widgetIds: widgetIdsBySubgroup.get(subgroup.id) ?? [],
            })),
          }
        })

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
                group_id: widget.groupId ?? null,
                subgroup_id: widget.subgroupId ?? null,
                section_name: widget.sectionName ?? null,
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
      chartSubgroups: [],

      addChartGroup: (dashboardId, name) => {
        const trimmed = name.trim()
        if (!trimmed) return ''
        const existing = get().chartGroups.filter(g => g.dashboardId === dashboardId)
        const id       = dbId()
        const order = existing.length
        set(s => ({
          chartGroups: [
            ...s.chartGroups,
            { id, name: trimmed, dashboardId, order, widgetIds: [] },
          ],
        }))

        const userId = getUserId()
        if (!userId) return id

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('chart_groups')
              .insert({
                id,
                dashboard_id: dashboardId,
                user_id: userId,
                name: trimmed,
                sort_order: order,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
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

      removeChartGroup: (groupId) => {
        set(s => {
          const removedSubgroupIds = new Set(
            s.chartSubgroups
              .filter(subgroup => subgroup.groupId === groupId)
              .map(subgroup => subgroup.id),
          )
          return {
            chartGroups: s.chartGroups.filter(g => g.id !== groupId),
            chartSubgroups: s.chartSubgroups.filter(subgroup => subgroup.groupId !== groupId),
            widgets: s.widgets.map(w => {
              if (w.groupId !== groupId && !removedSubgroupIds.has(w.subgroupId ?? '')) return w
              return {
                ...w,
                groupId: undefined,
                subgroupId: undefined,
                sectionName: undefined,
              }
            }),
          }
        })

        const userId = getUserId()
        if (!userId) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const [{ error: groupDeleteError }, { error: widgetsUpdateError }] = await Promise.all([
              supabase.from('chart_groups').delete().eq('id', groupId).eq('user_id', userId),
              supabase
                .from('widgets')
                .update({ group_id: null, subgroup_id: null, section_name: null })
                .eq('group_id', groupId)
                .eq('user_id', userId),
            ])
            if (groupDeleteError) throw groupDeleteError
            if (widgetsUpdateError) throw widgetsUpdateError
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
      },

      updateChartGroup: (groupId, patch) => {
        set(s => ({
          chartGroups: s.chartGroups.map(g => g.id === groupId ? { ...g, ...patch } : g),
        }))

        const userId = getUserId()
        if (!userId) return
        const group = get().chartGroups.find(item => item.id === groupId)
        if (!group) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('chart_groups')
              .upsert(
                {
                  id: group.id,
                  dashboard_id: group.dashboardId,
                  user_id: userId,
                  name: group.name,
                  sort_order: group.order,
                  updated_at: new Date().toISOString(),
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

      assignWidgetToGroup: (widgetId, groupId) => {
        const widget = get().widgets.find(item => item.id === widgetId)
        if (!widget) return
        const currentSubgroup = widget.subgroupId
          ? get().chartSubgroups.find(subgroup => subgroup.id === widget.subgroupId)
          : null
        const nextSubgroupId =
          groupId && currentSubgroup && currentSubgroup.groupId === groupId
            ? currentSubgroup.id
            : undefined
        const nextSectionName = nextSubgroupId
          ? get().chartSubgroups.find(subgroup => subgroup.id === nextSubgroupId)?.name
          : undefined
        get().updateWidget(widgetId, {
          groupId: groupId ?? undefined,
          subgroupId: nextSubgroupId,
          sectionName: nextSectionName,
        })
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

        const userId = getUserId()
        if (!userId) return
        const payload = get()
          .chartGroups
          .filter(group => group.dashboardId === dashboardId)
          .map(group => ({
            id: group.id,
            dashboard_id: group.dashboardId,
            user_id: userId,
            name: group.name,
            sort_order: group.order,
            updated_at: new Date().toISOString(),
          }))
        if (!payload.length) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('chart_groups')
              .upsert(payload, { onConflict: 'id' })
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

      addChartSubgroup: (dashboardId, groupId, name) => {
        const trimmed = name.trim()
        if (!trimmed) return ''
        const existing = get().chartSubgroups.filter(subgroup => subgroup.groupId === groupId)
        const id = dbId()
        const order = existing.length
        set(s => ({
          chartSubgroups: [
            ...s.chartSubgroups,
            { id, groupId, dashboardId, name: trimmed, order, widgetIds: [] },
          ],
        }))

        const userId = getUserId()
        if (!userId) return id
        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('chart_subgroups')
              .insert({
                id,
                dashboard_id: dashboardId,
                group_id: groupId,
                user_id: userId,
                name: trimmed,
                sort_order: order,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
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

      removeChartSubgroup: (subgroupId) => {
        set(s => ({
          chartSubgroups: s.chartSubgroups.filter(subgroup => subgroup.id !== subgroupId),
          widgets: s.widgets.map(widget =>
            widget.subgroupId === subgroupId
              ? { ...widget, subgroupId: undefined, sectionName: undefined, updatedAt: new Date().toISOString() }
              : widget,
          ),
        }))

        const userId = getUserId()
        if (!userId) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const [{ error: subgroupDeleteError }, { error: widgetsUpdateError }] = await Promise.all([
              supabase.from('chart_subgroups').delete().eq('id', subgroupId).eq('user_id', userId),
              supabase
                .from('widgets')
                .update({ subgroup_id: null, section_name: null })
                .eq('subgroup_id', subgroupId)
                .eq('user_id', userId),
            ])
            if (subgroupDeleteError) throw subgroupDeleteError
            if (widgetsUpdateError) throw widgetsUpdateError
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            set({ lastSyncError: message })
            void get().syncFromSupabase()
          } finally {
            set({ isSyncing: false })
          }
        })()
      },

      updateChartSubgroup: (subgroupId, patch) => {
        set(s => ({
          chartSubgroups: s.chartSubgroups.map(subgroup =>
            subgroup.id === subgroupId ? { ...subgroup, ...patch } : subgroup,
          ),
          widgets: s.widgets.map(widget => {
            if (widget.subgroupId !== subgroupId || patch.name === undefined) return widget
            return { ...widget, sectionName: patch.name, updatedAt: new Date().toISOString() }
          }),
        }))

        const userId = getUserId()
        if (!userId) return
        const subgroup = get().chartSubgroups.find(item => item.id === subgroupId)
        if (!subgroup) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error: subgroupError } = await supabase
              .from('chart_subgroups')
              .upsert(
                {
                  id: subgroup.id,
                  dashboard_id: subgroup.dashboardId,
                  group_id: subgroup.groupId,
                  user_id: userId,
                  name: subgroup.name,
                  sort_order: subgroup.order,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'id' },
              )
            if (subgroupError) {
              set({ lastSyncError: subgroupError.message })
              void get().syncFromSupabase()
              return
            }

            if (patch.name !== undefined) {
              const { error: widgetsUpdateError } = await supabase
                .from('widgets')
                .update({ section_name: subgroup.name })
                .eq('subgroup_id', subgroup.id)
                .eq('user_id', userId)
              if (widgetsUpdateError) {
                set({ lastSyncError: widgetsUpdateError.message })
                void get().syncFromSupabase()
              }
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

      assignWidgetToSubgroup: (widgetId, subgroupId) => {
        const widget = get().widgets.find(item => item.id === widgetId)
        if (!widget) return
        if (!subgroupId) {
          get().updateWidget(widgetId, {
            subgroupId: undefined,
            sectionName: undefined,
          })
          return
        }
        const subgroup = get().chartSubgroups.find(item => item.id === subgroupId)
        if (!subgroup) return
        get().updateWidget(widgetId, {
          groupId: subgroup.groupId,
          subgroupId: subgroup.id,
          sectionName: subgroup.name,
        })
      },

      getSubgroupsByGroup: (groupId) =>
        get().chartSubgroups
          .filter(subgroup => subgroup.groupId === groupId)
          .sort((a, b) => a.order - b.order),

      reorderSubgroups: (groupId, subgroupId, direction) => {
        set(s => {
          const subgroups = s.chartSubgroups
            .filter(subgroup => subgroup.groupId === groupId)
            .sort((a, b) => a.order - b.order)

          const idx = subgroups.findIndex(subgroup => subgroup.id === subgroupId)
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1
          if (swapIdx < 0 || swapIdx >= subgroups.length) return s

          const updated = subgroups.map(subgroup => ({ ...subgroup }))
          const tmpOrder = updated[idx].order
          updated[idx].order = updated[swapIdx].order
          updated[swapIdx].order = tmpOrder

          const orderMap = new Map(updated.map(subgroup => [subgroup.id, subgroup.order]))
          return {
            chartSubgroups: s.chartSubgroups.map(subgroup =>
              orderMap.has(subgroup.id) ? { ...subgroup, order: orderMap.get(subgroup.id)! } : subgroup,
            ),
          }
        })

        const userId = getUserId()
        if (!userId) return
        const payload = get()
          .chartSubgroups
          .filter(subgroup => subgroup.groupId === groupId)
          .map(subgroup => ({
            id: subgroup.id,
            dashboard_id: subgroup.dashboardId,
            group_id: subgroup.groupId,
            user_id: userId,
            name: subgroup.name,
            sort_order: subgroup.order,
            updated_at: new Date().toISOString(),
          }))
        if (!payload.length) return

        set({ isSyncing: true })
        void (async () => {
          try {
            const { error } = await supabase
              .from('chart_subgroups')
              .upsert(payload, { onConflict: 'id' })
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
        chartGroups: [],
        chartSubgroups: [],
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
