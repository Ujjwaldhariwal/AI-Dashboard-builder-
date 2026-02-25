// src/store/builder-store.ts
import { create } from 'zustand'
import { Widget, WidgetConfigInput, ChartType } from '@/types/widget'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export interface Dashboard {
  id: string
  name: string
  description: string
  owner_id: string
  created_at: string
}

export interface APIEndpoint {
  id: string
  owner_id: string
  name: string
  url: string
  method: 'GET' | 'POST'
  auth_type: 'none' | 'api-key' | 'bearer' | 'basic'
  headers?: Record<string, string>
  refresh_interval: number
  status: 'active' | 'error' | 'pending'
}

interface DashboardStore {
  dashboards: Dashboard[]
  endpoints: APIEndpoint[]
  widgets: Widget[]
  currentDashboardId: string | null
  isLoading: boolean

  initialize: (userId: string) => Promise<void>

  addDashboard: (input: { name: string; description?: string; ownerId: string }) => Promise<string>
  removeDashboard: (id: string) => Promise<void>
  updateDashboard: (id: string, updates: Partial<Pick<Dashboard, 'name' | 'description'>>) => Promise<void>
  setCurrentDashboard: (id: string | null) => void

  addEndpoint: (endpoint: Omit<APIEndpoint, 'id' | 'status'>) => Promise<string>
  removeEndpoint: (id: string) => Promise<void>

  addWidget: (input: WidgetConfigInput & { dashboardId: string }) => Promise<void>
  removeWidget: (id: string) => Promise<void>
  updateWidget: (id: string, updates: Partial<Widget>) => Promise<void>
  reorderWidgets: (dashboardId: string, newOrder: Widget[]) => Promise<void>
  getWidgetsByDashboard: (dashboardId: string) => Widget[]
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  dashboards: [],
  endpoints: [],
  widgets: [],
  currentDashboardId: null,
  isLoading: false,

  initialize: async (userId: string) => {
    set({ isLoading: true })
    try {
      const [dashRes, endRes, widgRes] = await Promise.all([
        supabase.from('dashboards').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
        supabase.from('api_endpoints').select('*').eq('owner_id', userId),
        supabase.from('widgets').select('*').eq('owner_id', userId).order('position', { ascending: true }),
      ])

      if (dashRes.error) throw dashRes.error
      if (endRes.error) throw endRes.error
      if (widgRes.error) throw widgRes.error

      // ✅ Explicit mapping from snake_case DB → camelCase Widget type
      const mappedWidgets: Widget[] = (widgRes.data || []).map(w => ({
        id: w.id,
        dashboardId: w.dashboard_id,
        title: w.title,
        type: w.type as ChartType,
        endpointId: w.endpoint_id,
        dataMapping: w.data_mapping as { xAxis: string; yAxis: string },
        position: w.position ?? 0,
      }))

      set({
        dashboards: dashRes.data || [],
        endpoints: endRes.data || [],
        widgets: mappedWidgets,
        isLoading: false,
      })
    } catch (error) {
      console.error('Failed to load user data:', error)
      set({ isLoading: false })
    }
  },

  // ── DASHBOARDS ──────────────────────────────────────────
  addDashboard: async ({ name, description = '', ownerId }) => {
    const { data, error } = await supabase
      .from('dashboards')
      .insert({ name, description, owner_id: ownerId })
      .select('id, created_at')
      .single()

    if (error) throw error

    const newDash: Dashboard = {
      id: data.id,
      name,
      description,
      owner_id: ownerId,
      created_at: data.created_at,
    }

    set((state) => ({ dashboards: [newDash, ...state.dashboards] }))
    return data.id
  },

  removeDashboard: async (id) => {
    await supabase.from('dashboards').delete().eq('id', id)
    set((state) => ({
      dashboards: state.dashboards.filter((d) => d.id !== id),
      currentDashboardId: state.currentDashboardId === id ? null : state.currentDashboardId,
    }))
  },

  updateDashboard: async (id, updates) => {
    await supabase.from('dashboards').update(updates).eq('id', id)
    set((state) => ({
      dashboards: state.dashboards.map((d) => d.id === id ? { ...d, ...updates } : d),
    }))
  },

  setCurrentDashboard: (id) => set({ currentDashboardId: id }),

  // ── ENDPOINTS ──────────────────────────────────────────
  addEndpoint: async (endpoint) => {
    const { data, error } = await supabase
      .from('api_endpoints')
      .insert({
        owner_id: endpoint.owner_id,
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        auth_type: endpoint.auth_type,
        headers: endpoint.headers || {},
        refresh_interval: endpoint.refresh_interval,
        status: 'active',
      })
      .select('id')
      .single()

    if (error) throw error

    set((state) => ({
      endpoints: [...state.endpoints, { ...endpoint, id: data.id, status: 'active' as const }],
    }))
    return data.id
  },

  removeEndpoint: async (id) => {
    await supabase.from('api_endpoints').delete().eq('id', id)
    set((state) => ({
      endpoints: state.endpoints.filter((e) => e.id !== id),
    }))
  },

  // ── WIDGETS ────────────────────────────────────────────
  addWidget: async (input) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const position = get().widgets.filter(w => w.dashboardId === input.dashboardId).length

    const { data, error } = await supabase
      .from('widgets')
      .insert({
        dashboard_id: input.dashboardId,
        owner_id: user.id,
        title: input.title,
        type: input.type,
        endpoint_id: input.endpointId,
        data_mapping: input.dataMapping,
        position,
      })
      .select('id')
      .single()

    if (error) throw error

    // ✅ Explicit Widget object — no spreading of unknown shapes
    const newWidget: Widget = {
      id: data.id,
      dashboardId: input.dashboardId,
      title: input.title,
      type: input.type,
      endpointId: input.endpointId,
      dataMapping: input.dataMapping,
      position,
    }

    set((state) => ({ widgets: [...state.widgets, newWidget] }))
  },

  removeWidget: async (id) => {
    await supabase.from('widgets').delete().eq('id', id)
    set((state) => ({ widgets: state.widgets.filter((w) => w.id !== id) }))
  },

  updateWidget: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {}
    if (updates.title) dbUpdates.title = updates.title
    if (updates.type) dbUpdates.type = updates.type
    if (updates.dataMapping) dbUpdates.data_mapping = updates.dataMapping

    await supabase.from('widgets').update(dbUpdates).eq('id', id)
    set((state) => ({
      widgets: state.widgets.map((w) => w.id === id ? { ...w, ...updates } : w),
    }))
  },

  reorderWidgets: async (dashboardId, newOrder) => {
    // ✅ Optimistic UI — instant visual update
    set((state) => {
      const others = state.widgets.filter((w) => w.dashboardId !== dashboardId)
      return { widgets: [...others, ...newOrder] }
    })
    // Background DB sync
    await Promise.all(
      newOrder.map((w, index) =>
        supabase.from('widgets').update({ position: index }).eq('id', w.id)
      )
    )
  },

  getWidgetsByDashboard: (dashboardId) =>
    get().widgets.filter((w) => w.dashboardId === dashboardId),
}))
