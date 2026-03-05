# Consolidated Dashboard Builder Code

Includes the requested completed files in one document.

## src/types/project-config.ts
`$ext
// src/types/project-config.ts

export type AuthStrategy  = 'basic' | 'bearer' | 'api-key' | 'none'
export type LayoutType    = 'sidebar' | 'topnav'
export type EncodingType  = 'btoa' | 'plain' | 'none'

export interface LoginConfig {
  endpoint:      string      // e.g. /userLogin
  usernameField: string      // body key for username
  passwordField: string      // body key for password
  tokenPath:     string      // dot-path in response e.g. "data.token"
  encodingType:  EncodingType
}

export interface SessionConfig {
  logoutOn401:     boolean
  logoutOnMessage: string    // substring match e.g. "expired"
}

export interface HeaderConfig {
  projectName:  string
  primaryColor: string       // sidebar bg hex
  accentColor:  string       // button/highlight hex
}

export interface ChartGroup {
  id:          string
  name:        string        // "Disconnection", "Prepaid Billing"
  order:       number
  widgetIds:   string[]
  dashboardId: string
}

export interface ProjectConfig {
  dashboardId:  string
  clientName:   string
  projectTitle: string
  baseUrl:      string       // API base URL
  layout:       LayoutType
  authStrategy: AuthStrategy
  header:       HeaderConfig
  login:        LoginConfig
  session:      SessionConfig
}

export const DEFAULT_PROJECT_CONFIG: Omit<ProjectConfig, 'dashboardId'> = {
  clientName:   '',
  projectTitle: 'My Dashboard',
  baseUrl:      '',
  layout:       'sidebar',
  authStrategy: 'basic',
  header: {
    projectName:  'My Dashboard',
    primaryColor: '#0f172a',
    accentColor:  '#3b82f6',
  },
  login: {
    endpoint:      '/userLogin',
    usernameField: 'username',
    passwordField: 'password',
    tokenPath:     'data.token',
    encodingType:  'plain',
  },
  session: {
    logoutOn401:     true,
    logoutOnMessage: 'expired',
  },
}
```

## src/types/widget.ts
`$ext
// Module: Widget Types — 3-layer schema (deps | base | style)
// src/types/widget.ts

export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'horizontal-bar'
  | 'gauge'
  | 'status-card'
  | 'table'

export type ChartDeps = 'echarts' // frozen — never changes

// ─── Layer 3: AI edits ONLY this ─────────────────────────────
export interface WidgetStyle {
  colors: string[]
  tooltipBg?: string
  tooltipBorder?: string
  labelFormat?: string
  customCSS?: string
  barRadius?: number
  showLegend?: boolean
  showGrid?: boolean
}

export const DEFAULT_STYLE: WidgetStyle = {
  colors: ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444'],
  barRadius: 5,
  showLegend: true,
  showGrid: true,
}

// ─── Existing types (unchanged) ──────────────────────────────
export interface YAxisConfig {
  key: string
  color: string
  label?: string
}

export interface DataMapping {
  xAxis: string
  yAxis?: string
  yAxes?: YAxisConfig[]
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  limit?: number
}

export interface WidgetPosition {
  x: number
  y: number
  w: number
  h: number
}

// ─── Core Widget — 3-layer ────────────────────────────────────
export interface Widget {
  id: string
  dashboardId: string
  title: string
  type: ChartType

  // Layer 1 — frozen
  deps: ChartDeps

  // Layer 2 — user configures (base)
  endpointId: string
  dataMapping: DataMapping

  // Layer 3 — AI edits only this
  style: WidgetStyle
  groupId?:     string
  sectionName?: string

  position?: WidgetPosition
  createdAt?: string
  updatedAt?: string
  created_at?: string  // legacy compat
  updated_at?: string  // legacy compat
}

export interface WidgetConfigInput {
  title: string
  type: ChartType
  endpointId: string
  dashboardId?: string
  xAxis?: string
  yAxis?: string
  dataMapping?: DataMapping
  style?: Partial<WidgetStyle> // optional override at creation
  groupId?:     string
}
```

## src/store/builder-store.ts
`$ext
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
```

## src/lib/code-generator/config-builder.ts
`$ext
// src/lib/code-generator/config-builder.ts
import type { Widget, ChartType } from '@/types/widget'
import type { ProjectConfig, ChartGroup } from '@/types/project-config'

interface DashboardShape {
  id:           string
  name:         string
  description?: string
}

interface EndpointShape {
  id:       string
  name:     string
  url:      string
  method:   string
  authType?: string
  headers?: Record<string, string>
}

export interface ExportWidget {
  id:           string
  title:        string
  type:         ChartType
  endpointId:   string
  xAxis:        string
  yAxis:        string
  groupId?:     string
  sectionName?: string
  colors:       string[]
  barRadius:    number
  showLegend:   boolean
  showGrid:     boolean
}

export interface ExportEndpoint {
  id:       string
  name:     string
  url:      string
  method:   string
  authType?: string
}

export interface ExportGroup {
  id:        string
  name:      string
  order:     number
  widgetIds: string[]
}

export interface DashboardExportConfig {
  meta: {
    id:           string
    name:         string
    description?: string
    exportedAt:   string
  }
  projectConfig: ProjectConfig
  endpoints:     ExportEndpoint[]
  widgets:       ExportWidget[]
  groups:        ExportGroup[]
}

export function buildDashboardConfig(
  dashboard:     DashboardShape,
  endpoints:     EndpointShape[],
  widgets:       Widget[],
  projectConfig: ProjectConfig,
  chartGroups:   ChartGroup[],
): DashboardExportConfig {
  const dashboardWidgets = widgets.filter(w => w.dashboardId === dashboard.id)
  const dashboardGroups  = chartGroups.filter(g => g.dashboardId === dashboard.id)
  const endpointMap      = new Map(endpoints.map(e => [e.id, e]))
  const usedEndpointIds  = new Set(dashboardWidgets.map(w => w.endpointId))

  return {
    meta: {
      id:          dashboard.id,
      name:        dashboard.name,
      description: dashboard.description,
      exportedAt:  new Date().toISOString(),
    },
    projectConfig: {
      ...projectConfig,
      dashboardId:  dashboard.id,
      projectTitle: projectConfig.projectTitle || dashboard.name,
    },
    endpoints: Array.from(usedEndpointIds)
      .map(id => endpointMap.get(id))
      .filter((e): e is EndpointShape => Boolean(e))
      .map(e => ({
        id:       e.id,
        name:     e.name,
        url:      e.url,
        method:   e.method,
        authType: e.authType,
      })),
    widgets: dashboardWidgets.map(w => ({
      id:          w.id,
      title:       w.title,
      type:        w.type,
      endpointId:  w.endpointId,
      xAxis:       w.dataMapping.xAxis,
      yAxis:       w.dataMapping.yAxis ?? '',
      groupId:     w.groupId,
      sectionName: w.sectionName,
      colors:      w.style.colors,
      barRadius:   w.style.barRadius  ?? 5,
      showLegend:  w.style.showLegend ?? true,
      showGrid:    w.style.showGrid   ?? true,
    })),
    groups: dashboardGroups
      .sort((a, b) => a.order - b.order)
      .map(g => ({
        id:        g.id,
        name:      g.name,
        order:     g.order,
        widgetIds: g.widgetIds,
      })),
  }
}

export function slugifyDashboardName(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') ||
    'dashboard'
  )
}
```

## src/lib/code-generator/template-generator.ts
`$ext
// src/lib/code-generator/template-generator.ts
import type { DashboardExportConfig } from './config-builder'

export type GeneratedFileMap = Record<string, string>

export function generateProjectFromConfig(
  config: DashboardExportConfig,
): GeneratedFileMap {
  const files: GeneratedFileMap = {}
  const { projectConfig: pc } = config

  // ── package.json ──────────────────────────────────────────────
  files['package.json'] = JSON.stringify({
    name:    slugify(config.meta.name),
    version: '0.1.0',
    private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    dependencies: {
      next:        '^14.0.0',
      react:       '^18.0.0',
      'react-dom': '^18.0.0',
      echarts:     '^5.4.3',
      'echarts-for-react': '^3.0.2',
      axios:       '^1.6.0',
      jspdf:       '^2.5.1',
      html2canvas: '^1.4.1',
    },
    devDependencies: {
      typescript:          '^5.0.0',
      '@types/node':       '^20.0.0',
      '@types/react':      '^18.0.0',
      '@types/react-dom':  '^18.0.0',
    },
  }, null, 2)

  // ── next.config.mjs ───────────────────────────────────────────
  files['next.config.mjs'] = `/** @type {import('next').NextConfig} */
const nextConfig = {}
export default nextConfig
`

  // ── tsconfig.json ─────────────────────────────────────────────
  files['tsconfig.json'] = JSON.stringify({
    compilerOptions: {
      target:           'ES2017',
      lib:              ['dom', 'dom.iterable', 'esnext'],
      allowJs:          true,
      skipLibCheck:     true,
      strict:           false,
      noEmit:           true,
      esModuleInterop:  true,
      module:           'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules:  true,
      jsx:              'preserve',
      incremental:      true,
      plugins:          [{ name: 'next' }],
      paths:            { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2)

  // ── globals.css ───────────────────────────────────────────────
  files['src/app/globals.css'] = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
input, button, select { font-family: inherit; }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
`

  // ── layout ────────────────────────────────────────────────────
  files['src/app/layout.tsx'] = `import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '${pc.projectTitle}',
  description: '${config.meta.description ?? pc.clientName + ' Dashboard'}',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`

  // ── root page → redirect ──────────────────────────────────────
  files['src/app/page.tsx'] = `'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()
  useEffect(() => {
    const user = localStorage.getItem('authUser')
    router.replace(user ? '/dashboard' : '/login')
  }, [router])
  return null
}
`

  // ── login page ────────────────────────────────────────────────
  files['src/app/login/page.tsx'] = generateLoginPage(config)

  // ── dashboard layout ──────────────────────────────────────────
  files['src/app/dashboard/layout.tsx'] = generateDashboardLayout(config)

  // ── dashboard page ────────────────────────────────────────────
  files['src/app/dashboard/page.tsx'] = generateDashboardPage(config)

  // ── config ────────────────────────────────────────────────────
  files['src/lib/config.ts'] = `// Auto-generated by Analytics AI Dashboard Builder
// Exported: ${new Date(config.meta.exportedAt).toLocaleString()}
// Client: ${pc.clientName}

import type { DashboardConfig } from './types'

export const dashboardConfig: DashboardConfig = ${JSON.stringify(config, null, 2)} as const
`

  // ── types ─────────────────────────────────────────────────────
  files['src/lib/types.ts'] = generateTypes()

  // ── apiClient ─────────────────────────────────────────────────
  files['src/lib/apiClient.ts'] = generateApiClient(config)

  // ── useChartData hook ─────────────────────────────────────────
  files['src/hooks/useChartData.ts'] = generateUseChartData()

  // ── Components ───────────────────────────────────────────────
  files['src/components/Sidebar.tsx']     = generateSidebar(config)
  files['src/components/Header.tsx']      = generateHeader(config)
  files['src/components/WidgetChart.tsx'] = generateWidgetChart()
  files['src/components/PDFExport.tsx']   = generatePDFExport(config)
  files['src/components/AuthGuard.tsx']   = generateAuthGuard()

  // ── README ────────────────────────────────────────────────────
  files['README.md'] = generateReadme(config)

  return files
}

// ─────────────────────────────────────────────────────────────
// GENERATORS
// ─────────────────────────────────────────────────────────────

function generateLoginPage(config: DashboardExportConfig): string {
  const { projectConfig: pc } = config
  const isBasic  = pc.authStrategy === 'basic'
  const isBtoa   = pc.login.encodingType === 'btoa'

  return `'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/apiClient'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const body: Record<string, string> = {
        ${pc.login.usernameField}: ${isBtoa ? "btoa(username + ':' + password)" : 'username'},
        ${isBasic ? `${pc.login.passwordField}: password,` : ''}
      }
      const res  = await apiClient.post('${pc.login.endpoint}', body)
      const data = res.data
      // Extract token via dot-path: "${pc.login.tokenPath}"
      const token = '${pc.login.tokenPath}'.split('.').reduce((o: any, k) => o?.[k], data)
      localStorage.setItem('authUser', JSON.stringify({ ...data?.data, token, username }))
      router.push('/dashboard')
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed. Check credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoBar}>
          <div style={{ ...styles.logoCircle, background: '${pc.header.accentColor}' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>
              {('${pc.projectTitle}').charAt(0)}
            </span>
          </div>
        </div>
        <h1 style={styles.title}>${pc.projectTitle}</h1>
        <p style={styles.sub}>${pc.clientName ? pc.clientName + ' · ' : ''}Sign in to continue</p>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required autoFocus
              placeholder="Enter username"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Enter password"
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.btn, background: loading ? '#94a3b8' : '${pc.header.accentColor}' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' },
  card:        { background: '#fff', borderRadius: 16, padding: '2.5rem 2rem', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logoBar:     { display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' },
  logoCircle:  { width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', color: '#0f172a', marginBottom: 4 },
  sub:         { fontSize: '0.82rem', color: '#64748b', textAlign: 'center', marginBottom: '1.75rem' },
  form:        { display: 'flex', flexDirection: 'column', gap: '1rem' },
  field:       { display: 'flex', flexDirection: 'column', gap: 6 },
  label:       { fontSize: '0.78rem', fontWeight: 600, color: '#374151' },
  input:       { padding: '0.6rem 0.85rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', outline: 'none', transition: 'border 0.2s' },
  error:       { fontSize: '0.78rem', color: '#ef4444', textAlign: 'center' },
  btn:         { padding: '0.7rem', borderRadius: 9, border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', marginTop: 4 },
}
`
}

function generateDashboardLayout(config: DashboardExportConfig): string {
  return `'use client'
import { AuthGuard } from '@/components/AuthGuard'
import { Sidebar }   from '@/components/Sidebar'
import { Header }    from '@/components/Header'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Header />
          <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem', background: '#f1f5f9' }}>
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
`
}

function generateDashboardPage(config: DashboardExportConfig): string {
  const { groups, widgets } = config

  // Build section structure: grouped + ungrouped
  const groupedIds  = new Set(groups.flatMap(g => g.widgetIds))
  const ungrouped   = widgets.filter(w => !groupedIds.has(w.id))

  return `'use client'
import { useState }      from 'react'
import { dashboardConfig } from '@/lib/config'
import { WidgetChart }   from '@/components/WidgetChart'
import { PDFExport }     from '@/components/PDFExport'

export default function DashboardPage() {
  const { groups, widgets, endpoints, projectConfig: pc } = dashboardConfig
  const [activeGroup, setActiveGroup] = useState<string | 'all'>('all')

  const visibleWidgets = activeGroup === 'all'
    ? widgets
    : widgets.filter(w => {
        const g = groups.find(g => g.id === activeGroup)
        return g?.widgetIds.includes(w.id)
      })

  return (
    <div>
      {/* Group filter tabs */}
      {groups.length > 0 && (
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(activeGroup === 'all' ? styles.tabActive : {}) }}
            onClick={() => setActiveGroup('all')}
          >
            All Charts
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              style={{ ...styles.tab, ...(activeGroup === g.id ? styles.tabActive : {}) }}
              onClick={() => setActiveGroup(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* PDF export */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <PDFExport widgets={visibleWidgets} />
      </div>

      {/* Chart grid */}
      <div id="dashboard-charts" style={styles.grid}>
        {visibleWidgets.map(widget => (
          <WidgetChart
            key={widget.id}
            widget={widget}
            endpoints={endpoints}
          />
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  tabs:      { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1.25rem' },
  tab:       { padding: '0.4rem 1rem', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', color: '#475569' },
  tabActive: { background: '${config.projectConfig.header.accentColor}', color: '#fff', borderColor: '${config.projectConfig.header.accentColor}' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '1.25rem' },
}
`
}

function generateTypes(): string {
  return `// Auto-generated types
export interface ExportWidget {
  id: string; title: string; type: string;
  endpointId: string; xAxis: string; yAxis: string;
  groupId?: string; colors: string[]; barRadius: number;
  showLegend: boolean; showGrid: boolean;
}
export interface ExportEndpoint { id: string; name: string; url: string; method: string; authType?: string }
export interface ExportGroup    { id: string; name: string; order: number; widgetIds: string[] }
export interface DashboardConfig { meta: any; projectConfig: any; endpoints: ExportEndpoint[]; widgets: ExportWidget[]; groups: ExportGroup[] }
`
}

function generateApiClient(config: DashboardExportConfig): string {
  const { projectConfig: pc } = config
  return `import axios from 'axios'

export const apiClient = axios.create({
  baseURL:         '${pc.baseUrl}',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Attach Bearer token on every private request
apiClient.interceptors.request.use(config => {
  try {
    const raw  = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    if (user?.token) config.headers['Authorization'] = \`Bearer \${user.token}\`
  } catch {}
  return config
})

// Auto-logout on 401 or expired message
apiClient.interceptors.response.use(
  res => res,
  err => {
    const status  = err?.response?.status
    const message = err?.response?.data?.message ?? ''
    if (status === ${pc.session.logoutOn401 ? 401 : 999} || message.includes('${pc.session.logoutOnMessage}')) {
      localStorage.removeItem('authUser')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)
`
}

function generateUseChartData(): string {
  return `'use client'
import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/apiClient'

export function useChartData(endpoint: { id: string; url: string; method: string } | undefined) {
  const [data, setData]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const hasFetched            = useRef(false)

  useEffect(() => {
    if (!endpoint || hasFetched.current) return
    hasFetched.current = true
    setLoading(true)
    const req = endpoint.method === 'POST'
      ? apiClient.post(endpoint.url)
      : apiClient.get(endpoint.url)

    req.then(res => {
      const json = res.data
      const arr  = Array.isArray(json) ? json
        : json?.data || json?.results || json?.items || json?.list || [json]
      setData(arr)
    })
    .catch(e => setError(e.message))
    .finally(() => setLoading(false))
  }, [endpoint?.id])

  return { data, loading, error }
}
`
}

function generateSidebar(config: DashboardExportConfig): string {
  const { projectConfig: pc, groups } = config
  return `'use client'
import { useState }   from 'react'
import { useRouter }  from 'next/navigation'
import { dashboardConfig } from '@/lib/config'

export function Sidebar() {
  const router = useRouter()
  const { groups, projectConfig: pc } = dashboardConfig
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem('authUser')
    router.push('/login')
  }

  return (
    <aside style={{
      width:      collapsed ? 60 : 240,
      minHeight:  '100vh',
      background: '${pc.header.primaryColor}',
      display:    'flex',
      flexDirection: 'column',
      transition: 'width 0.25s ease',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: '${pc.header.accentColor}', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>{('${pc.projectTitle}').charAt(0)}</span>
        </div>
        {!collapsed && (
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ${pc.projectTitle}
          </span>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 16 }}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, padding: '0.75rem 0', overflowY: 'auto' }}>
        {groups.length > 0 ? groups.map(group => (
          <div key={group.id}>
            {!collapsed && (
              <p style={{ padding: '0.5rem 1rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                {group.name}
              </p>
            )}
            {group.widgetIds.slice(0, 3).map(wid => {
              const w = dashboardConfig.widgets.find(w => w.id === wid)
              if (!w) return null
              return (
                <a
                  key={wid}
                  href={\`#widget-\${w.id}\`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '0.6rem' : '0.5rem 1rem', color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', textDecoration: 'none', borderRadius: 8, margin: '1px 8px', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 12 }}>📊</span>
                  {!collapsed && <span style={{ truncate: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{w.title}</span>}
                </a>
              )
            })}
          </div>
        )) : (
          dashboardConfig.widgets.map(w => (
            <a
              key={w.id}
              href={\`#widget-\${w.id}\`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '0.6rem' : '0.5rem 1rem', color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', textDecoration: 'none', borderRadius: 8, margin: '1px 8px' }}
            >
              <span style={{ fontSize: 12 }}>📊</span>
              {!collapsed && w.title}
            </a>
          ))
        )}
      </nav>

      {/* Logout */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={handleLogout}
          style={{ width: '100%', padding: collapsed ? '0.5rem' : '0.5rem 1rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8 }}
        >
          🚪 {!collapsed && 'Logout'}
        </button>
      </div>
    </aside>
  )
}
`
}

function generateHeader(config: DashboardExportConfig): string {
  const { projectConfig: pc } = config
  return `'use client'
import { dashboardConfig } from '@/lib/config'

export function Header() {
  const { projectConfig: pc } = dashboardConfig
  let username = ''
  try { username = JSON.parse(localStorage.getItem('authUser') || '{}')?.username || '' } catch {}

  return (
    <header style={{
      height:       56,
      background:   '#fff',
      borderBottom: '1px solid #e2e8f0',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      padding:      '0 1.5rem',
      flexShrink:   0,
    }}>
      <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
        ${pc.projectTitle}
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {username && (
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Welcome, {username}
          </span>
        )}
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: '${pc.header.accentColor}',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 13,
        }}>
          {username ? username.charAt(0).toUpperCase() : '?'}
        </div>
      </div>
    </header>
  )
}
`
}

function generateWidgetChart(): string {
  return `'use client'
import { useRef }            from 'react'
import ReactECharts           from 'echarts-for-react'
import { useChartData }       from '@/hooks/useChartData'
import type { ExportWidget, ExportEndpoint } from '@/lib/types'

interface Props {
  widget:    ExportWidget
  endpoints: ExportEndpoint[]
}

export function WidgetChart({ widget, endpoints }: Props) {
  const endpoint = endpoints.find(e => e.id === widget.endpointId)
  const { data, loading, error } = useChartData(endpoint)
  const chartRef = useRef<any>(null)

  const cardStyle: React.CSSProperties = {
    background:   '#fff',
    border:       '1px solid #e5e7eb',
    borderRadius: 12,
    padding:      '1.25rem',
    boxShadow:    '0 1px 4px rgba(0,0,0,0.05)',
    display:      'flex',
    flexDirection: 'column',
    gap:          12,
  }

  if (loading) return (
    <div id={\`widget-\${widget.id}\`} style={{ ...cardStyle, minHeight: 240, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 8 }}>Loading {widget.title}…</p>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )

  if (error) return (
    <div id={\`widget-\${widget.id}\`} style={cardStyle}>
      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{widget.title}</p>
      <p style={{ color: '#ef4444', fontSize: '0.8rem' }}>Error: {error}</p>
    </div>
  )

  const option = buildEChartsOption(widget, data)

  return (
    <div id={\`widget-\${widget.id}\`} style={cardStyle}>
      <p style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>{widget.title}</p>
      {widget.type === 'table'
        ? <DataTable data={data} xAxis={widget.xAxis} />
        : <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: 260, width: '100%' }}
            opts={{ renderer: 'svg' }}
          />
      }
    </div>
  )
}

function buildEChartsOption(widget: ExportWidget, data: any[]) {
  const colors   = widget.colors
  const isNum    = data.length > 0 && !isNaN(Number(data[0]?.[widget.yAxis]))
  const prepared = isNum
    ? data.slice(0, 30).map((r, i) => ({
        name:  String(r[widget.xAxis] ?? i).slice(0, 20),
        value: parseFloat(r[widget.yAxis]) || 0,
      }))
    : (() => {
        const counts: Record<string, number> = {}
        data.forEach(r => { const k = String(r[widget.xAxis] ?? 'Unknown'); counts[k] = (counts[k] ?? 0) + 1 })
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, value]) => ({ name, value }))
      })()

  const xData = prepared.map(d => d.name)
  const yData = prepared.map(d => d.value)

  const grid   = { top: 32, right: 16, bottom: 48, left: 52, containLabel: true }
  const tooltip = { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155', textStyle: { color: '#f1f5f9', fontSize: 12 } }

  switch (widget.type) {
    case 'bar':
    case 'horizontal-bar': return {
      color: colors, tooltip, grid,
      legend: widget.showLegend ? {} : { show: false },
      xAxis: widget.type === 'horizontal-bar'
        ? { type: 'value', splitLine: { show: widget.showGrid } }
        : { type: 'category', data: xData, axisLabel: { fontSize: 11, rotate: xData.length > 8 ? 30 : 0 } },
      yAxis: widget.type === 'horizontal-bar'
        ? { type: 'category', data: xData }
        : { type: 'value', splitLine: { show: widget.showGrid } },
      series: [{ type: 'bar', data: yData, barMaxWidth: 48, itemStyle: { borderRadius: [widget.barRadius, widget.barRadius, 0, 0] }, name: widget.yAxis }],
    }
    case 'line':
    case 'area': return {
      color: colors, tooltip, grid,
      legend: widget.showLegend ? {} : { show: false },
      xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', splitLine: { show: widget.showGrid } },
      series: [{ type: 'line', data: yData, smooth: true, name: widget.yAxis,
        areaStyle: widget.type === 'area' ? { opacity: 0.2 } : undefined,
        lineStyle: { width: 2 },
      }],
    }
    case 'pie':
    case 'donut': return {
      color: colors, tooltip: { trigger: 'item' },
      legend: widget.showLegend ? { orient: 'vertical', right: 0 } : { show: false },
      series: [{
        type: 'pie', radius: widget.type === 'donut' ? ['40%', '70%'] : '70%',
        data: prepared, label: { fontSize: 11 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' } },
        name: widget.title,
      }],
    }
    case 'gauge': return {
      series: [{
        type: 'gauge', min: 0, max: Math.max(...yData, 100),
        data: [{ value: yData[0] ?? 0, name: widget.yAxis }],
        detail: { fontSize: 18, color: colors[0] },
        axisLine: { lineStyle: { color: [[1, colors[0]]] } },
      }],
    }
    default: return { title: { text: widget.title } }
  }
}

function DataTable({ data, xAxis }: { data: any[]; xAxis: string }) {
  if (!data.length) return <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No data</p>
  const cols = Object.keys(data[0])
  return (
    <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr>{cols.map(c => (
            <th key={c} style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {data.slice(0, 100).map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
              {cols.map((c, j) => (
                <td key={j} style={{ padding: '6px 10px', color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(row[c] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
`
}

function generatePDFExport(config: DashboardExportConfig): string {
  return `'use client'
import { useState }    from 'react'
import type { ExportWidget } from '@/lib/types'

interface Props { widgets: ExportWidget[] }

export function PDFExport({ widgets }: Props) {
  const [open, setOpen]         = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(widgets.map(w => w.id)))
  const [loading, setLoading]   = useState(false)

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleExport = async () => {
    setLoading(true)
    try {
      const { default: jsPDF }          = await import('jspdf')
      const { default: html2canvas }    = await import('html2canvas')
      const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W    = doc.internal.pageSize.getWidth()
      const H    = doc.internal.pageSize.getHeight()
      let first  = true

      // Title page
      doc.setFillColor(15, 23, 42)
      doc.rect(0, 0, W, H, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(24)
      doc.text('${config.meta.name}', W / 2, H / 2 - 10, { align: 'center' })
      doc.setFontSize(11)
      doc.setTextColor(148, 163, 184)
      doc.text('Generated: ' + new Date().toLocaleDateString(), W / 2, H / 2 + 8, { align: 'center' })

      for (const wid of Array.from(selected)) {
        const el = document.getElementById(\`widget-\${wid}\`)
        if (!el) continue
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
        const img    = canvas.toDataURL('image/png')
        const ratio  = canvas.height / canvas.width
        const imgW   = W - 20
        const imgH   = Math.min(imgW * ratio, H - 30)
        if (!first || true) doc.addPage()
        first = false
        doc.addImage(img, 'PNG', 10, 10, imgW, imgH)
      }

      doc.save('${slugify(config.meta.name)}-report.pdf')
      setOpen(false)
    } catch (e) {
      console.error('PDF export failed:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ padding: '0.5rem 1.25rem', background: '${config.projectConfig.header.accentColor}', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        📄 Export PDF
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 700, fontSize: '1.1rem' }}>Select Charts for PDF</h2>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.4rem', cursor: 'pointer', borderRadius: 6, background: '#f8fafc' }}>
                <input type="checkbox"
                  checked={selected.size === widgets.length}
                  onChange={() => setSelected(selected.size === widgets.length ? new Set() : new Set(widgets.map(w => w.id)))}
                />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Select All</span>
              </label>
              {widgets.map(w => (
                <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.4rem 0.6rem', cursor: 'pointer', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
                  <span style={{ fontSize: '0.82rem' }}>{w.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'capitalize' }}>{w.type}</span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setOpen(false)}
                style={{ flex: 1, padding: '0.6rem', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500 }}>
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={loading || selected.size === 0}
                style={{ flex: 2, padding: '0.6rem', background: selected.size === 0 ? '#94a3b8' : '${config.projectConfig.header.accentColor}', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                {loading ? 'Generating…' : \`Export \${selected.size} Chart\${selected.size !== 1 ? 's' : ''}\`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
`
}

function generateAuthGuard(): string {
  return `'use client'
import { useEffect, useState } from 'react'
import { useRouter }           from 'next/navigation'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const user = localStorage.getItem('authUser')
    if (!user) { router.replace('/login') } else { setOk(true) }
  }, [router])

  if (!ok) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
  return <>{children}</>
}
`
}

function generateReadme(config: DashboardExportConfig): string {
  const { projectConfig: pc } = config
  return `# ${config.meta.name}

> Generated by **Analytics AI Dashboard Builder** · ${new Date(config.meta.exportedAt).toLocaleDateString()}
> Client: **${pc.clientName}** · Auth: **${pc.authStrategy}**

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000)

## Login

- Endpoint: \`${pc.login.endpoint}\`
- Username field: \`${pc.login.usernameField}\`
- Token path: \`${pc.login.tokenPath}\`

## Widgets (${config.widgets.length})

${config.widgets.map(w => `- **${w.title}** — \`${w.type}\` · X: \`${w.xAxis}\` · Y: \`${w.yAxis || '—'}\``).join('\n')}

## Groups (${config.groups.length})

${config.groups.map(g => `- **${g.name}** — ${g.widgetIds.length} charts`).join('\n') || '_No groups defined_'}

## Endpoints

${config.endpoints.map(e => `- **${e.name}**: \`${e.method} ${e.url}\``).join('\n')}
`
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dashboard'
}
```

## src/components/builder/project-config/project-config-panel.tsx
`$ext
//src//components/builder/project-config/project-config-panel.tsx
'use client'

import { useState } from 'react'
import { useDashboardStore } from '@/store/builder-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Building2, Shield, Layout, RotateCcw,
  Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AuthStrategy, LayoutType, EncodingType } from '@/types/project-config'

interface Props {
  dashboardId: string
}

export function ProjectConfigPanel({ dashboardId }: Props) {
  const store = useDashboardStore()
  const {
    getProjectConfig, setProjectConfig, resetProjectConfig,
    getGroupsByDashboard, addChartGroup, removeChartGroup,
    updateChartGroup, reorderGroups, assignWidgetToGroup,
    getWidgetsByDashboard,
  } = store

  const config  = getProjectConfig(dashboardId)
  const groups  = getGroupsByDashboard(dashboardId)
  const widgets = getWidgetsByDashboard(dashboardId)
  const [newGroupName, setNewGroupName] = useState('')

  // Generic field updater — supports dot notation e.g. "login.endpoint"
  const update = (path: string, value: any) => {
    const keys = path.split('.')
    if (keys.length === 1) {
      setProjectConfig(dashboardId, { [keys[0]]: value } as any)
    } else {
      const [parent, child] = keys
      setProjectConfig(dashboardId, {
        [parent]: { ...(config as any)[parent], [child]: value },
      } as any)
    }
  }

  const handleReset = () => {
    resetProjectConfig(dashboardId)
    toast.success('Project config reset to defaults')
  }

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return
    addChartGroup(dashboardId, newGroupName.trim())
    setNewGroupName('')
    toast.success(`Group "${newGroupName.trim()}" added`)
  }

  const handleAssign = (widgetId: string, groupId: string) => {
    assignWidgetToGroup(widgetId, groupId)
    const w = widgets.find(w => w.id === widgetId)
    const g = groups.find(g => g.id === groupId)
    toast.success(`"${w?.title}" added to ${g?.name}`)
  }

  const handleUnassign = (widgetId: string) => {
    assignWidgetToGroup(widgetId, null)
  }

  // Safe nested value reader for dot-path
  const getNestedVal = (path: string): string => {
    return path.split('.').reduce((o: any, k) => o?.[k], config) ?? ''
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 py-3 border-b bg-blue-500/5 flex-shrink-0 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold">Project Configuration</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Configures the generated ZIP project
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}>
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="project" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="mx-3 mt-2 flex-shrink-0 grid grid-cols-3">
          <TabsTrigger value="project" className="text-[10px] gap-1">
            <Building2 className="w-3 h-3" />Project
          </TabsTrigger>
          <TabsTrigger value="auth" className="text-[10px] gap-1">
            <Shield className="w-3 h-3" />Auth
          </TabsTrigger>
          <TabsTrigger value="groups" className="text-[10px] gap-1">
            <Layout className="w-3 h-3" />Groups
          </TabsTrigger>
        </TabsList>

        {/* ── Project Tab ──────────────────────────────────── */}
        <TabsContent value="project" className="flex-1 overflow-y-auto px-4 py-3 space-y-4 mt-0">
          <Field label="Client / Company Name">
            <Input
              value={config.clientName}
              onChange={e => update('clientName', e.target.value)}
              placeholder="e.g. UPPCL, Bosch"
              className="h-8 text-xs"
            />
          </Field>

          <Field label="Dashboard Title">
            <Input
              value={config.projectTitle}
              onChange={e => {
                update('projectTitle', e.target.value)
                update('header.projectName', e.target.value)
              }}
              placeholder="MDM Dashboard"
              className="h-8 text-xs"
            />
          </Field>

          <Field label="API Base URL">
            <Input
              value={config.baseUrl}
              onChange={e => update('baseUrl', e.target.value)}
              placeholder="https://api.yourproject.com"
              className="h-8 text-xs font-mono"
            />
          </Field>

          <Field label="Layout Type">
            <Select
              value={config.layout}
              onValueChange={v => update('layout', v as LayoutType)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sidebar">Sidebar (recommended)</SelectItem>
                <SelectItem value="topnav">Top Navbar</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* Brand Colors */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Brand Colors</Label>
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                label="Sidebar BG"
                value={config.header.primaryColor}
                onChange={v => update('header.primaryColor', v)}
              />
              <ColorField
                label="Accent"
                value={config.header.accentColor}
                onChange={v => update('header.accentColor', v)}
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Auth Tab ─────────────────────────────────────── */}
        <TabsContent value="auth" className="flex-1 overflow-y-auto px-4 py-3 space-y-4 mt-0">
          <Field label="Auth Strategy">
            <Select
              value={config.authStrategy}
              onValueChange={v => update('authStrategy', v as AuthStrategy)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic Auth (username + password)</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="api-key">API Key</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Login Endpoint">
            <Input
              value={config.login.endpoint}
              onChange={e => update('login.endpoint', e.target.value)}
              placeholder="/userLogin"
              className="h-8 text-xs font-mono"
            />
          </Field>

          <Field label="Username Field (body key)">
            <Input
              value={config.login.usernameField}
              onChange={e => update('login.usernameField', e.target.value)}
              placeholder="username"
              className="h-8 text-xs font-mono"
            />
          </Field>

          <Field label="Password Field (body key)">
            <Input
              value={config.login.passwordField}
              onChange={e => update('login.passwordField', e.target.value)}
              placeholder="password"
              className="h-8 text-xs font-mono"
            />
          </Field>

          <Field label="Token Path (dot-notation)">
            <Input
              value={config.login.tokenPath}
              onChange={e => update('login.tokenPath', e.target.value)}
              placeholder="data.token"
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Where in the login response is the token — e.g. <code>data.token</code>
            </p>
          </Field>

          <Field label="Credential Encoding">
            <Select
              value={config.login.encodingType}
              onValueChange={v => update('login.encodingType', v as EncodingType)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="plain">Plain (send as-is)</SelectItem>
                <SelectItem value="btoa">btoa (base64 encode user:pass)</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="space-y-2 pt-1">
            <Label className="text-xs font-semibold">Session Expiry</Label>
            <div className="rounded-lg border divide-y">
              <div className="flex items-center justify-between px-3 py-2.5">
                <Label className="text-xs">Auto-logout on 401</Label>
                <Switch
                  checked={config.session.logoutOn401}
                  onCheckedChange={v => update('session.logoutOn401', v)}
                />
              </div>
            </div>
            <Field label="Logout on response message containing">
              <Input
                value={config.session.logoutOnMessage}
                onChange={e => update('session.logoutOnMessage', e.target.value)}
                placeholder="expired"
                className="h-8 text-xs font-mono"
              />
            </Field>
          </div>
        </TabsContent>

        {/* ── Groups Tab ───────────────────────────────────── */}
        <TabsContent value="groups" className="flex-1 overflow-y-auto px-4 py-3 mt-0 space-y-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Groups become sidebar sections in the output dashboard.
          </p>

          {/* Add group input */}
          <div className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="e.g. Disconnection, Prepaid Billing"
              className="h-8 text-xs flex-1"
              onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
            />
            <Button
              size="sm"
              className="h-8 px-2.5"
              onClick={handleAddGroup}
              disabled={!newGroupName.trim()}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Empty state */}
          {groups.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground border-2 border-dashed rounded-lg">
              No groups yet. Add one above to organize charts into sidebar sections.
            </div>
          )}

          {/* Groups list */}
          <div className="space-y-3">
            {groups.map(group => {
              const groupWidgets   = widgets.filter(w => w.groupId === group.id)
              const unassigned     = widgets.filter(w => !w.groupId)

              return (
                <div key={group.id} className="rounded-lg border bg-card p-3 space-y-2">

                  {/* Group header row */}
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <Input
                      value={group.name}
                      onChange={e => updateChartGroup(group.id, { name: e.target.value })}
                      className="h-6 text-xs flex-1 border-0 bg-transparent p-0 focus-visible:ring-0 font-medium"
                    />
                    <Badge variant="outline" className="text-[9px] flex-shrink-0">
                      {groupWidgets.length} charts
                    </Badge>
                    <div className="flex gap-0.5 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => reorderGroups(dashboardId, group.id, 'up')}>
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => reorderGroups(dashboardId, group.id, 'down')}>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-5 w-5 text-destructive hover:text-destructive"
                        onClick={() => { removeChartGroup(group.id); toast.success('Group removed') }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Assigned widgets */}
                  {groupWidgets.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2 border-t">
                      {groupWidgets.map(w => (
                        <div key={w.id}
                          className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          <span className="max-w-[100px] truncate">{w.title}</span>
                          <button
                            onClick={() => handleUnassign(w.id)}
                            className="hover:text-destructive ml-0.5 flex-shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick-add unassigned widgets */}
                  {unassigned.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-[9px] text-muted-foreground mb-1.5">
                        + Add unassigned:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {unassigned.map(w => (
                          <button
                            key={w.id}
                            onClick={() => handleAssign(w.id, group.id)}
                            className="text-[9px] px-2 py-0.5 rounded-full border border-dashed hover:bg-muted hover:border-solid transition-all truncate max-w-[120px]"
                          >
                            + {w.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Unassigned warning */}
          {widgets.filter(w => !w.groupId).length > 0 && groups.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                {widgets.filter(w => !w.groupId).length} widget
                {widgets.filter(w => !w.groupId).length !== 1 ? 's' : ''} unassigned
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                These appear under "All Charts" in the output sidebar.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function ColorField({
  label, value, onChange,
}: {
  label:    string
  value:    string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <label className="flex items-center gap-2 cursor-pointer group">
        <div
          className="w-7 h-7 rounded-md border-2 border-border flex-shrink-0 group-hover:border-primary transition-colors"
          style={{ backgroundColor: value }}
        />
        <span className="text-[10px] font-mono text-muted-foreground">{value}</span>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="sr-only"
        />
      </label>
    </div>
  )
}
```

## src/app/(builder)/builder/page.tsx
`$ext
//src/app/%28builder%29/builder/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useDashboardStore } from '@/store/builder-store'
import { DragDropCanvas } from '@/components/builder/canvas/drag-drop-canvas'
import { WidgetConfigDialog } from '@/components/builder/widget-config-dialog'
import { MagicPasteModal } from '@/components/builder/magic-paste-modal'
import { ConfigChatbot } from '@/components/builder/ai-assistant/config-chatbot'
import { ChartSuggester } from '@/components/builder/ai-assistant/chart-suggester'
import { WidgetStylePanel } from '@/components/builder/style-panel/widget-style-panel'
import { ProjectConfigPanel } from '@/components/builder/project-config/project-config-panel'
import { toast } from 'sonner'
import {
  Plus, Settings2, Eye, Database, FolderKanban,
  Download, Wand2, Sparkles, X, Bot,
  LayoutGrid, Circle, Minimize2, Maximize2,
  Palette, SlidersHorizontal,
} from 'lucide-react'
import Link from 'next/link'
import { buildDashboardConfig, slugifyDashboardName } from '@/lib/code-generator/config-builder'
import { generateProjectFromConfig } from '@/lib/code-generator/template-generator'
import { packageProjectAsZip } from '@/lib/code-generator/zip-packager'
import { motion, AnimatePresence } from 'framer-motion'

// ── Page ──────────────────────────────────────────────────────
export default function BuilderPage() {
  const router = useRouter()
  const {
    dashboards,
    currentDashboardId,
    setCurrentDashboard,
    getWidgetsByDashboard,
    endpoints,
    widgets: allWidgets,
  } = useDashboardStore()

  const [addWidgetOpen, setAddWidgetOpen]       = useState(false)
  const [magicOpen, setMagicOpen]               = useState(false)
  const [exporting, setExporting]               = useState(false)
  const [aiOpen, setAiOpen]                     = useState(false)
  const [aiMinimized, setAiMinimized]           = useState(false)
  const [lastSavedCount, setLastSavedCount]     = useState(0)
  const [unsaved, setUnsaved]                   = useState(false)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)

  useEffect(() => {
    if (!currentDashboardId && dashboards.length > 0) {
      setCurrentDashboard(dashboards[0].id)
    }
  }, [currentDashboardId, dashboards, setCurrentDashboard])

  const currentDash = dashboards.find(d => d.id === currentDashboardId)
  const widgets     = currentDashboardId ? getWidgetsByDashboard(currentDashboardId) : []

  useEffect(() => {
    if (widgets.length !== lastSavedCount) setUnsaved(true)
  }, [widgets.length, lastSavedCount])

  const handleCanvasClick = () => setSelectedWidgetId(null)

  const handleExport = async () => {
    if (!currentDash)    { toast.error('No active dashboard'); return }
    if (!widgets.length) { toast.error('Add at least one widget first'); return }
    setExporting(true)
    toast.loading('Generating project…', { id: 'export' })
    try {
      const projectConfig = useDashboardStore.getState().getProjectConfig(currentDash.id)
      const chartGroups   = useDashboardStore.getState().getGroupsByDashboard(currentDash.id)
      const config        = buildDashboardConfig(currentDash, endpoints, allWidgets, projectConfig, chartGroups)
      const files         = generateProjectFromConfig(config)
      const blob          = await packageProjectAsZip(files)
      const url           = URL.createObjectURL(blob)
      const a             = document.createElement('a')
      a.href              = url
      a.download          = `${slugifyDashboardName(currentDash.name)}-dashboard.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Export ready!', { id: 'export' })
      setLastSavedCount(widgets.length)
      setUnsaved(false)
    } catch (err: any) {
      toast.error('Export failed: ' + err.message, { id: 'export' })
    } finally {
      setExporting(false)
    }
  }

  // ── No dashboard ─────────────────────────────────────────────
  if (dashboards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2">No Dashboard Yet</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Create one from Workspaces first.
          </p>
          <Button onClick={() => router.push('/workspaces')}>Go to Workspaces</Button>
        </div>
      </div>
    )
  }

  // ── No APIs ───────────────────────────────────────────────────
  if (endpoints.length === 0 && widgets.length === 0) {
    return (
      <div className="p-6">
        <BuilderHeader
          currentDash={currentDash}
          widgets={widgets}
          endpoints={endpoints}
          exporting={exporting}
          unsaved={false}
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicOpen={() => setMagicOpen(true)}
          onExport={handleExport}
        />
        <div className="flex items-center justify-center min-h-[50vh] border-2 border-dashed border-muted-foreground/20 rounded-xl mt-4">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mx-auto mb-4">
              <Database className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">No APIs Connected</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Add APIs or let AI build your dashboard instantly.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => setMagicOpen(true)}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Magic Auto-Build
              </Button>
              <Link href="/api-config">
                <Button variant="outline" className="w-full">
                  <Settings2 className="w-4 h-4 mr-2" />
                  Configure APIs Manually
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
        <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
      </div>
    )
  }

  // ── Main Builder ──────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b bg-card/80 backdrop-blur flex-shrink-0">
        <BuilderHeader
          currentDash={currentDash}
          widgets={widgets}
          endpoints={endpoints}
          exporting={exporting}
          unsaved={unsaved}
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicOpen={() => setMagicOpen(true)}
          onExport={handleExport}
        />
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-y-auto p-6"
        onClick={handleCanvasClick}
      >
        <DragDropCanvas
          selectedWidgetId={selectedWidgetId}
          onSelectWidget={setSelectedWidgetId}
        />
      </div>

      {/* ── Floating AI Overlay ────────────────────────────────── */}
      <AnimatePresence>
        {aiOpen && (
          <motion.div
            key="ai-overlay"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-5 right-5 z-50 shadow-2xl rounded-2xl overflow-hidden border bg-card"
            style={{ width: 400, height: aiMinimized ? 'auto' : 600 }}
          >
            <Tabs defaultValue="chat" className="flex flex-col h-full">

              {/* Overlay Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gradient-to-r from-blue-600/10 to-purple-600/10 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm font-semibold">AI Assistant</span>
                  {selectedWidgetId && !aiMinimized && (
                    <Badge variant="secondary" className="text-[10px]">Widget selected</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* ── 4 Tabs ── */}
                  <TabsList className="h-6">
                    <TabsTrigger value="chat" className="text-[10px] h-5 px-2 gap-1">
                      <Bot className="w-2.5 h-2.5" />Chat
                    </TabsTrigger>
                    <TabsTrigger value="suggest" className="text-[10px] h-5 px-2 gap-1">
                      <LayoutGrid className="w-2.5 h-2.5" />Suggest
                    </TabsTrigger>
                    <TabsTrigger value="style" className="text-[10px] h-5 px-2 gap-1">
                      <Palette className="w-2.5 h-2.5" />Style
                    </TabsTrigger>
                    <TabsTrigger value="config" className="text-[10px] h-5 px-2 gap-1">
                      <SlidersHorizontal className="w-2.5 h-2.5" />Config
                    </TabsTrigger>
                  </TabsList>
                  <Button variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => setAiMinimized(v => !v)}>
                    {aiMinimized
                      ? <Maximize2 className="w-3 h-3" />
                      : <Minimize2 className="w-3 h-3" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => { setAiOpen(false); setAiMinimized(false) }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Overlay Body */}
              {!aiMinimized && (
                <div className="flex-1 overflow-hidden min-h-0">

                  {/* Chat */}
                  <TabsContent value="chat"
                    className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                    <ConfigChatbot
                      selectedWidgetId={selectedWidgetId}
                      onClose={() => { setAiOpen(false); setAiMinimized(false) }}
                    />
                  </TabsContent>

                  {/* Suggest */}
                  <TabsContent value="suggest"
                    className="mt-0 h-full overflow-y-auto p-4">
                    <ChartSuggester />
                  </TabsContent>

                  {/* Style */}
                  <TabsContent value="style"
                    className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                    <WidgetStylePanel selectedWidgetId={selectedWidgetId} />
                  </TabsContent>

                  {/* Config — Project Config + Chart Groups */}
                  <TabsContent value="config"
                    className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                    {currentDashboardId ? (
                      <ProjectConfigPanel dashboardId={currentDashboardId} />
                    ) : (
                      <div className="flex items-center justify-center h-full p-6 text-center">
                        <div>
                          <SlidersHorizontal className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground">
                            Select a dashboard to configure project settings
                          </p>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                </div>
              )}
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating trigger */}
      {!aiOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => { setAiOpen(true); setAiMinimized(false) }}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-lg transition-all"
        >
          <Sparkles className="w-4 h-4" />
          AI Assistant
        </motion.button>
      )}

      <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
      <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
    </div>
  )
}

// ── Builder Header ────────────────────────────────────────────
interface BuilderHeaderProps {
  currentDash: any
  widgets:     any[]
  endpoints:   any[]
  exporting:   boolean
  unsaved:     boolean
  onAddWidget: () => void
  onMagicOpen: () => void
  onExport:    () => void
}

function BuilderHeader({
  currentDash, widgets, endpoints,
  exporting, unsaved,
  onAddWidget, onMagicOpen, onExport,
}: BuilderHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold truncate">
            {currentDash?.name ?? 'Builder'}
          </h1>
          <Badge variant="secondary" className="text-[10px]">
            {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {endpoints.length} API{endpoints.length !== 1 ? 's' : ''}
          </Badge>
          {unsaved && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <Circle className="w-2 h-2 fill-amber-500 text-amber-500" />
              Unsaved changes
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 truncate">
          {currentDash?.description || 'Add widgets from your connected APIs'}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <Link href="/api-config">
          <Button variant="outline" size="sm">
            <Settings2 className="w-3.5 h-3.5 mr-1.5" />APIs
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            <Eye className="w-3.5 h-3.5 mr-1.5" />Preview
          </Button>
        </Link>
        <Button
          variant="outline" size="sm"
          onClick={onExport}
          disabled={exporting || widgets.length === 0}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {exporting ? 'Exporting…' : 'Export ZIP'}
        </Button>
        <Button
          variant="outline" size="sm"
          onClick={onMagicOpen}
          className="border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-900 dark:text-purple-400"
        >
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />Magic
        </Button>
        <Button
          size="sm"
          onClick={onAddWidget}
          disabled={endpoints.length === 0}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />Add Widget
        </Button>
      </div>
    </div>
  )
}
```


