// Module: BuilderStore
//builder-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Widget, WidgetConfigInput } from "@/types/widget";

interface Dashboard {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  ownerId?: string; // ✅ add this line
}

interface APIEndpoint {
  id: string;
  name: string;
  url: string;
  method: "GET" | "POST";
  authType: "none" | "api-key" | "bearer" | "basic";
  headers?: Record<string, string>;
  refreshInterval: number;
  status: "active" | "inactive";
}

interface DashboardStore {
  // Dashboards
  dashboards: Dashboard[];
  currentDashboardId: string | null;
  addDashboard: (dashboard: Omit<Dashboard, "id" | "createdAt">) => string;
  removeDashboard: (id: string) => void;
  deleteDashboard: (id: string) => void; // ✅ alias — same as removeDashboard
  setCurrentDashboard: (id: string | null) => void;
  duplicateDashboard: (id: string) => string;

  // Endpoints
  endpoints: APIEndpoint[];
  addEndpoint: (endpoint: Omit<APIEndpoint, "id">) => string;
  removeEndpoint: (id: string) => void;
  updateEndpoint: (id: string, updates: Partial<APIEndpoint>) => void;

  // Widgets
  widgets: Widget[];
  addWidget: (config: WidgetConfigInput) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<Widget>) => void;
  getWidgetsByDashboard: (dashboardId: string) => Widget[];
  reorderWidgets: (
    dashboardId: string,
    activeId: string,
    overId: string,
  ) => void;
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({
      // ─── Dashboards ───────────────────────────────────────────
      dashboards: [],
      currentDashboardId: null,

      addDashboard: (dashboard) => {
        const id = `dashboard-${Date.now()}`;
        set((state) => ({
          dashboards: [
            ...state.dashboards,
            { ...dashboard, id, createdAt: new Date() },
          ],
        }));
        return id;
      },

      removeDashboard: (id) => {
        set((state) => ({
          dashboards: state.dashboards.filter((d) => d.id !== id),
          currentDashboardId:
            state.currentDashboardId === id ? null : state.currentDashboardId,
          widgets: state.widgets.filter((w) => w.dashboardId !== id),
        }));
      },

      // ✅ alias so old code calling deleteDashboard still works
      deleteDashboard: (id) => {
        set((state) => ({
          dashboards: state.dashboards.filter((d) => d.id !== id),
          currentDashboardId:
            state.currentDashboardId === id ? null : state.currentDashboardId,
          widgets: state.widgets.filter((w) => w.dashboardId !== id),
        }));
      },

      // In implementation — add after deleteDashboard:
      duplicateDashboard: (id) => {
        const { dashboards, widgets, user } = get() as any;
        const source = dashboards.find((d: Dashboard) => d.id === id);
        if (!source) return "";
        const newId = `dashboard-${Date.now()}`;
        const now = new Date();
        const sourceWidgets = widgets.filter(
          (w: Widget) => w.dashboardId === id,
        );
        const clonedWidgets = sourceWidgets.map((w: Widget) => ({
          ...w,
          id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          dashboardId: newId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }));
        set((state) => ({
          dashboards: [
            ...state.dashboards,
            {
              ...source,
              id: newId,
              name: `${source.name} (copy)`,
              createdAt: now,
            },
          ],
          widgets: [...state.widgets, ...clonedWidgets],
        }));
        return newId;
      },

      setCurrentDashboard: (id) => set({ currentDashboardId: id }),

      // ─── Endpoints ────────────────────────────────────────────
      endpoints: [],

      addEndpoint: (endpoint) => {
        const id = `endpoint-${Date.now()}`;
        set((state) => ({
          endpoints: [...state.endpoints, { ...endpoint, id }],
        }));
        return id;
      },

      removeEndpoint: (id) => {
        set((state) => ({
          endpoints: state.endpoints.filter((e) => e.id !== id),
          widgets: state.widgets.filter((w) => w.endpointId !== id),
        }));
      },

      updateEndpoint: (id, updates) => {
        set((state) => ({
          endpoints: state.endpoints.map((e) =>
            e.id === id ? { ...e, ...updates } : e,
          ),
        }));
      },

      // ─── Widgets ──────────────────────────────────────────────
      widgets: [],

      addWidget: (config) => {
        const { currentDashboardId, widgets } = get();
        if (!currentDashboardId) return;

        const resolvedMapping = config.dataMapping ?? {
          xAxis: config.xAxis ?? "",
          yAxis: config.yAxis,
        };
        if (!resolvedMapping.xAxis) return;

        // ✅ FIX 1: truly unique ID — random suffix prevents same-ms collisions
        const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        // ✅ FIX 2: dedup guard
        if (widgets.some((w) => w.id === id)) return;

        const now = new Date().toISOString();

        const newWidget: Widget = {
          id,
          dashboardId: currentDashboardId,
          title: config.title,
          type: config.type,
          endpointId: config.endpointId,
          dataMapping: resolvedMapping,
          position: { x: 0, y: 0, w: 6, h: 4 },
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({ widgets: [...state.widgets, newWidget] }));
      },

      removeWidget: (id) => {
        set((state) => ({
          widgets: state.widgets.filter((w) => w.id !== id),
        }));
      },

      updateWidget: (id, updates) => {
        const now = new Date().toISOString();
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: now } : w,
          ),
        }));
      },
      reorderWidgets: (dashboardId, activeId, overId) => {
        set((state) => {
          const dashWidgets = state.widgets.filter(
            (w) => w.dashboardId === dashboardId,
          );
          const rest = state.widgets.filter(
            (w) => w.dashboardId !== dashboardId,
          );
          const oldIndex = dashWidgets.findIndex((w) => w.id === activeId);
          const newIndex = dashWidgets.findIndex((w) => w.id === overId);
          if (oldIndex === -1 || newIndex === -1) return state;
          const reordered = [...dashWidgets];
          const [moved] = reordered.splice(oldIndex, 1);
          reordered.splice(newIndex, 0, moved);
          return { widgets: [...rest, ...reordered] };
        });
      },

      getWidgetsByDashboard: (dashboardId) => {
        return get().widgets.filter((w) => w.dashboardId === dashboardId);
      },
    }),
    {
      name: "dashboard-storage",
    },
  ),
);
