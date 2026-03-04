// Module: Dashboard Builder Store — 3-layer chart schema (deps | base | style)
// src/store/builder-store.ts

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Widget, WidgetConfigInput, WidgetStyle, DEFAULT_STYLE } from "@/types/widget";

// ─── Interfaces ───────────────────────────────────────────────

interface Dashboard {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  ownerId?: string;
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
  // ─── Dashboards ───────────────────────────────────────────
  dashboards: Dashboard[];
  currentDashboardId: string | null;
  addDashboard: (dashboard: Omit<Dashboard, "id" | "createdAt">) => string;
  removeDashboard: (id: string) => void;
  updateDashboard: (id: string, patch: Partial<Dashboard>) => void;
  deleteDashboard: (id: string) => void; // alias of removeDashboard
  setCurrentDashboard: (id: string | null) => void;
  duplicateDashboard: (id: string) => string;

  // ─── Endpoints ────────────────────────────────────────────
  endpoints: APIEndpoint[];
  addEndpoint: (endpoint: Omit<APIEndpoint, "id">) => string;
  removeEndpoint: (id: string) => void;
  updateEndpoint: (id: string, updates: Partial<APIEndpoint>) => void;

  // ─── Widgets ──────────────────────────────────────────────
  widgets: Widget[];
  addWidget: (config: WidgetConfigInput) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<Widget>) => void;
  getWidgetsByDashboard: (dashboardId: string) => Widget[];
  reorderWidgets: (dashboardId: string, activeId: string, overId: string) => void;

  // ─── Style Actions (Layer 3 — AI only) ────────────────────
  updateWidgetStyle: (id: string, style: Partial<WidgetStyle>) => void;
  resetWidgetStyle: (id: string) => void;
}

// ─── Store ────────────────────────────────────────────────────

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

      updateDashboard: (id, patch) =>
        set((s) => ({
          dashboards: s.dashboards.map((d) =>
            d.id === id ? { ...d, ...patch } : d
          ),
        })),

      // alias — keeps old callers working
      deleteDashboard: (id) => {
        set((state) => ({
          dashboards: state.dashboards.filter((d) => d.id !== id),
          currentDashboardId:
            state.currentDashboardId === id ? null : state.currentDashboardId,
          widgets: state.widgets.filter((w) => w.dashboardId !== id),
        }));
      },

      duplicateDashboard: (id) => {
        const { dashboards, widgets } = get();
        const source = dashboards.find((d) => d.id === id);
        if (!source) return "";
        const newId = `dashboard-${Date.now()}`;
        const now = new Date();
        const clonedWidgets = widgets
          .filter((w) => w.dashboardId === id)
          .map((w) => ({
            ...w,
            id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            dashboardId: newId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          }));
        set((state) => ({
          dashboards: [
            ...state.dashboards,
            { ...source, id: newId, name: `${source.name} (copy)`, createdAt: now },
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
            e.id === id ? { ...e, ...updates } : e
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

        // unique ID — random suffix prevents same-ms collisions
        const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        if (widgets.some((w) => w.id === id)) return; // dedup guard

        const now = new Date().toISOString();

        const newWidget: Widget = {
          id,
          dashboardId: currentDashboardId,
          title: config.title,
          type: config.type,
          deps: "echarts",                               // Layer 1 — frozen
          endpointId: config.endpointId,                  // Layer 2 — base
          dataMapping: resolvedMapping,                   // Layer 2 — base
          style: { ...DEFAULT_STYLE, ...config.style },   // Layer 3 — AI edits only
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
            w.id === id ? { ...w, ...updates, updatedAt: now } : w
          ),
        }));
      },

      reorderWidgets: (dashboardId, activeId, overId) => {
        set((state) => {
          const dashWidgets = state.widgets.filter((w) => w.dashboardId === dashboardId);
          const rest = state.widgets.filter((w) => w.dashboardId !== dashboardId);
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

      // ─── Style Actions — Layer 3 (AI edits ONLY these) ────────
      updateWidgetStyle: (id, styleUpdate) => {
        const now = new Date().toISOString();
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id
              ? { ...w, style: { ...w.style, ...styleUpdate }, updatedAt: now }
              : w
          ),
        }));
      },

      resetWidgetStyle: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id
              ? { ...w, style: { ...DEFAULT_STYLE }, updatedAt: now }
              : w
          ),
        }));
      },

    }),
    { name: "dashboard-storage" },
  ),
);
