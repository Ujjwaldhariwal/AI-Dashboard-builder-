# Frontend KT Handover - Analytics AI Dashboard Builder

Date: March 16, 2026  
Audience: Senior/Principal Staff Frontend Engineer taking over implementation  
Prepared by: Current implementer handover snapshot

## 1) Handover Context

This handover is at a planned pivot point: stop incremental UI fixes and move to architecture-level UI redesign.

Current user-requested direction:
- Remove/replace current "global filters" UX from builder dashboard surface.
- Implement a clear, production-grade grouping/subgroup navigation selector mechanism.
- Fix widget size behavior (size selection should persist; no temporary snap-back).
- Move from brittle dialog-driven controls to modular, composable UI structure.

A full in-flight WIP has been stashed before this KT:
- `stash@{0}` -> `wip/ui-architecture-reset-2026-03-16`

## 2) Repository + Runtime Baseline

### Stack
- Next.js App Router (`next@16.1.6`)
- React 18 + TypeScript
- Tailwind + shadcn/Radix components
- Zustand (stores) + partial persist middleware
- Supabase auth + data persistence
- ECharts for visualization
- Framer Motion for UI transitions
- dnd-kit for builder drag/reorder

### Branch and HEAD
- Branch: `codex/feature/sprint4-demo-polish`
- HEAD: `4ea1b1b fix(api): support multi-env bosch proxy credentials and diagnostics`

## 3) Route Architecture

### App route groups
- Public/landing:
  - `src/app/page.tsx` (marketing + redirect logic)
- Auth:
  - `src/app/(auth)/layout.tsx`
  - `src/app/(auth)/login/page.tsx`
- Builder protected group:
  - `src/app/(builder)/layout.tsx` (session gate)
  - `src/app/(builder)/workspaces/page.tsx`
  - `src/app/(builder)/builder/page.tsx`
  - `src/app/(builder)/api-config/page.tsx`
  - `src/app/(builder)/auth-flow/page.tsx`
  - `src/app/(builder)/monitoring/page.tsx`
- Viewer group:
  - `src/app/(viewer)/dashboard/page.tsx`
  - `src/app/(viewer)/pdf-export/page.tsx`
- Shared/public dashboard:
  - `src/app/view/[token]/page.tsx`
- Config:
  - `src/app/settings/page.tsx`

### Route protection
- `src/proxy.ts` (Next.js 16 proxy-based replacement for middleware naming).
- Public exception: `/view/*`.
- Authenticated users are redirected away from `/` and `/login` to `/workspaces`.
- Admin-only section currently includes `/settings`.

## 4) Layout System

### Root providers
- `src/app/layout.tsx` wires:
  - React Query provider (`src/components/providers.tsx`)
  - Auth initializer (`src/components/auth-initializer.tsx`)
  - Global error boundary (`src/components/error-boundary.tsx`)
  - Toaster

### Builder shell
- `src/components/layout/app-layout.tsx`:
  - Fixed topbar with global search and notifications
  - Left sidebar nav (`Workspaces`, `Builder`, `API Config`, `Auth Flow`, `Monitoring`, `Settings`)
  - Monitoring slide-over panel
  - Onboarding wizard + keyboard shortcut modal

## 5) State Management and Persistence

## 5.1 `auth-store`
- File: `src/store/auth-store.ts`
- Responsibilities:
  - Supabase session check
  - normalized user payload for UI
  - logout with full state purge
- Notable:
  - logout clears `builder-store`, `monitoring-store`, `notification-store` persisted storage and in-memory state
  - `onAuthStateChange` listener for sign-out/token refresh

## 5.2 `builder-store` (core ownership)
- File: `src/store/builder-store.ts`
- Largest system module; combines:
  - dashboards
  - API endpoints
  - widgets
  - project config
  - chart groups
  - dashboard filters
  - drag state
  - Supabase sync/load orchestration

### Important behavior
- Supabase tables used for remote sync:
  - `dashboards`, `endpoints`, `widgets`
- Local-only (not persisted in Supabase by this store):
  - `chartGroups`
  - `dashboardFilters`
  - `projectConfigs`

This is a key architectural concern for cross-device consistency.

### Persist middleware details
- Persist key: `dashboard-storage`
- Versioned migration exists
- `partialize` persists only:
  - `currentDashboardId`
  - `selectedDashboardId`
  - `activeWidgetId`
  - `dragState`
- Full entity state comes from Supabase sync, not local persist.

### Auth sync coupling
- Store auto-initializes and subscribes to auth state.
- On user change:
  - clears data on sign-out
  - fetches from Supabase on sign-in

## 5.3 Monitoring + Notifications
- `src/store/monitoring-store.ts`
- `src/store/notification-store.ts`
- Both persisted locally with migration guards.
- Monitoring stores log history and endpoint health snapshots.

## 6) Data Flow: Endpoint -> Widget -> Chart

### Endpoint definition
- Created/edited in:
  - `src/app/(builder)/api-config/page.tsx`
- Includes method, auth mode, headers, refresh interval, active/inactive status.

### Widget creation/edit
- Create dialog: `src/components/builder/widget-config-dialog.tsx`
- Edit dialog: `src/components/builder/widget-edit-dialog.tsx`
- Store writes:
  - `addWidget`, `updateWidget`

### Runtime fetch/render
- `src/components/builder/canvas/widget-card.tsx`
  - resolves endpoint
  - fetches via `buildEndpointRequestInit` (`src/lib/api/request-utils.ts`)
  - extracts array with `DataAnalyzer`
  - applies dashboard filters (`applyDashboardFilters`)
  - applies alias mapping
  - renders chart component by type
  - writes monitoring logs + endpoint health

### Auto-refresh
- Interval per endpoint (`refreshInterval`), mounted per widget card.

## 7) Builder UX Structure

### Main builder page
- File: `src/app/(builder)/builder/page.tsx`
- Contains:
  - header stats/actions
  - currently mounted `GlobalFiltersPanel`
  - `DragDropCanvas`
  - AI assistant overlay with tabs (chat/suggest/style/config)

### Drag-drop canvas
- File: `src/components/builder/canvas/drag-drop-canvas.tsx`
- Uses `dnd-kit` sortable context.
- Includes local column layout selector (1/2/3 columns).
- Widget cards rendered in CSS grid, plus "add widget" tile.

### Current known mismatch vs requested direction
- Global filters UI currently present (user asked to remove in upcoming redesign).
- Group/subgroup nav builder is still not clear/complete in runtime UX.
- Group model exists in store + config panel but not elevated to first-class nav architecture in dashboard view.

## 8) Grouping System (Current)

### Data model
- `ChartGroup` in `src/types/project-config.ts`
- Fields: `id`, `name`, `order`, `widgetIds`, `dashboardId`
- Widget has optional `groupId`, `sectionName`.

### Management UI
- `ProjectConfigPanel` -> `Groups` tab (`src/components/builder/project-config/project-config-panel.tsx`)
  - add/remove/rename/reorder group
  - assign/unassign widgets to group

### Gap
- Grouping exists as metadata and export input, but interaction pattern is not yet the polished top-level navigation mechanism requested by product/design.

## 9) Filter System (Current)

- Type: `src/types/filter.ts`
- Utils: `src/lib/data/filter-utils.ts`
- UI: `src/components/builder/filters/global-filters-panel.tsx`
- Store actions:
  - `addDashboardFilter`
  - `updateDashboardFilter`
  - `removeDashboardFilter`
  - `clearDashboardFilters`

Runtime behavior:
- Filters are applied on each widget card before rendering, with AND logic.

Planned direction:
- user explicitly requested to remove this current filter UX from builder dashboard surface and prioritize navigation group/subgroup selector architecture.

## 10) API Layer

### AI Suggest endpoint
- `src/app/api/ai/suggest/route.ts`
- Uses OpenAI (`gpt-4o-mini`) with JSON response format.
- Includes Supabase session check before allowing suggestion.

### AI Chat endpoint
- `src/app/api/ai/chat/route.ts`
- Uses Gemini REST via axios.
- Supports:
  - widget creation action block
  - style update action block
- Includes style-only mode constraints in prompt design.

Security note:
- Unlike suggest route, chat route currently has no equivalent explicit session gate.

### Bosch proxy endpoint
- `src/app/api/bosch/[...path]/route.ts`
- Supports env-targeted credentials via:
  - `x-bosch-env` header or `env` query or default env
- Resolves env-specific and fallback credential vars.
- Returns structured diagnostics when credentials missing or upstream fails.

## 11) Export/Share Pipeline

### Export config assembly
- `src/lib/code-generator/config-builder.ts`
- Builds:
  - meta
  - project config
  - used endpoints
  - widgets
  - groups

### Template generation
- `src/lib/code-generator/template-generator.ts`
- Produces full generated Next.js project file map.
- Chart handlers and project scaffolding are generated as strings.

### ZIP packaging
- `src/lib/code-generator/zip-packager.ts`
- Validates chart handler coverage before zipping.

### Share link
- `src/lib/share-utils.ts`
- Encodes dashboard payload into token.
- Shared viewer route decodes and fetches live endpoint data.

## 12) Supabase Data Model

Source: `docs/sprint3-supabase-schema.sql`

Tables:
- `dashboards`
- `endpoints`
- `widgets`

Security:
- RLS enabled on all three
- "own data" policy keyed by `auth.uid() = user_id`

Indexes:
- `idx_dashboards_user_id`
- `idx_endpoints_user_id`
- `idx_widgets_user_id`

## 13) Environment Configuration

`.env.example` includes:
- App URL / email domain
- Supabase URL + anon key
- Gemini + OpenAI keys
- Bosch credentials and optional per-env overrides

Important:
- Bosch proxy credentials are server-side only.
- For per-env demo switching, align env var naming with route resolver patterns.

## 14) Known Risks / Tech Debt

## P0/P1 takeover risks
- `src/components/viewer/chart-card.tsx` currently contains only `/` and is invalid TSX if compiled/imported.
- Group/filter/projectConfig state is mostly local-only; not in Supabase sync path.
- Chat endpoint auth guard inconsistency vs suggest endpoint.
- Template generator is large monolith; high regression risk when modifying export behavior.
- UI code has heavy single-file pages (builder/api-config/auth-flow/monitoring), reducing modularity and testability.

## Product-critical UX gaps (from latest discussion)
- Current filter panel visibility conflicts with desired UX.
- Size selection behavior in widget edit flow reported unstable by user (temporary change then revert).
- Group/subgroup nav selector builder still incomplete from user perspective.

## 15) Stashed WIP Summary

Stash: `stash@{0}` (`wip/ui-architecture-reset-2026-03-16`)

Diff volume:
- 23 modified tracked files
- multiple added untracked architecture helper modules (`src/lib/builder/*`, `src/lib/blueprints/*`, endpoint cache hooks, viewer dialog)

Most impacted areas:
- builder UI pages/components
- viewer pages/components
- template generator
- builder store/types
- Bosch API route

Recommendation:
- Treat stash as a reference branch candidate, not as an automatic apply-and-merge.
- Review by vertical slice before replay:
  1) data/runtime layer
  2) builder UI layer
  3) export layer

## 16) Suggested Takeover Plan

## Phase 0 (first day)
- Create a dedicated takeover branch from current HEAD.
- Decide whether to cherry-pick from stash selectively or re-implement with cleaner modular architecture.
- Lock UX spec for:
  - group/subgroup selector model
  - filter removal/replacement behavior
  - widget size persistence behavior

## Phase 1 (architecture hardening)
- Split builder page into composable modules:
  - header actions
  - dashboard controls panel
  - canvas shell
  - assistant shell
- Extract reusable schema for navigation grouping.
- Define stable persisted contract for groups/subgroups (and migrate storage model).

## Phase 2 (behavioral correctness)
- Fix widget size state persistence at source-of-truth level in store + renderer.
- Ensure preview/dashboard/export all honor same grouping model.
- Regressions to verify:
  - drag reorder
  - refresh intervals
  - auth flows
  - export ZIP integrity

## Phase 3 (quality and rollout)
- Add targeted tests around:
  - grouping assignment
  - widget sizing
  - filter behavior (if retained in any form)
  - export config generation
- Add small architecture docs and invariants inline.

## 17) Commands for Next Engineer

Inspect current freeze:

```bash
git status
git log --oneline -n 20
```

Inspect stashed WIP:

```bash
git stash list
git stash show --stat "stash@{0}"
git stash show --name-status --include-untracked "stash@{0}"
```

Replay stash to working tree:

```bash
git stash apply "stash@{0}"
```

## 18) Final Note

This KT is intended as a deep technical handoff for immediate takeover.  
I am open to follow-up questions and can provide additional file-by-file context if requested.

