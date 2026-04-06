# PROJECT STATE

## 1. Current Architecture & Tech Stack

### Frontend
- **Framework:** Next.js (App Router) with React + TypeScript.
- **Styling:** Tailwind CSS with shared UI components.
- **State Management:** Zustand store (`src/store/builder-store.ts`) for dashboards, widgets, endpoints, style, and mapping updates.
- **UI Surface Areas:**
- Builder flows for widget configuration and styling.
- Viewer flows for dashboard playback and export actions.

### Backend & Auth
- **API Layer:** Next.js Route Handlers under `src/app/api/**`.
- **Runtime Model:** Vercel Serverless-style route execution.
- **Authentication:** Supabase session validation in protected AI endpoints using server-side cookie-backed client patterns.

### AI Engine
- **SDK:** Vercel AI SDK (`ai`) with structured generation (`generateObject`).
- **Provider:** `@ai-sdk/google` (Gemini, `gemini-2.5-flash`).
- **Schema Enforcement:** Strict `zod` schemas centralised in `src/lib/ai/agent-schemas.ts`.
- **Contracts:** Typed request/response parsing for transform, UI, and report agents to prevent schema drift.

### PDF Generation
- **Library:** `@react-pdf/renderer`.
- **Rendering Strategy:** Client-side document composition and blob download.
- **Current Document:** Multi-page AI report scaffold with executive summary, anomalies, and per-widget insights.

## 2. Current Capabilities (What Works Today)

### API Config & Auth Flows
- Endpoint-driven widget data fetching is available in builder/viewer flows.
- Authenticated AI micro-endpoints are protected by Supabase session checks.

### Drag & Drop Canvas
- Dashboard builder supports widget-centric editing and arrangement flows.
- Store-backed updates propagate widget configuration/state consistently.

### Data Transformation Engine
- Existing transform pipeline executes strict discriminated operations (`TransformOp`) such as:
- `parse_number`, `concat`, `rename`, `math`, `percent_of_total`, `filter_rows`, `sort`, `limit`.
- Transform configuration can now be AI-assisted via the dedicated transform agent endpoint.

### AI Subagents
- **Data Transformer Agent:** `POST /api/agents/transform` returns validated `TransformOp[]`.
- **UI Designer Agent:** `POST /api/agents/ui` returns validated `WidgetStyle` objects.
- **Report Generator Agent:** `POST /api/agents/report` returns validated report insights.
- **Client Integration:** `src/lib/ai/agent-client.ts` exposes typed client helpers:
- `askDataTransformer`
- `askUiDesigner`
- `askReportGenerator`
- **Viewer Integration:** UI now supports AI report generation + PDF download from dashboard header actions.

## 3. Pending Features (Immediate Roadmap)

### AI Few-Shot Training (Blueprints)
- Build a training UI to capture and persist enterprise transform patterns (e.g., Bosch/UPPCL formats) in Supabase.
- Add retrieval path so agents can condition prompt context using project-specific blueprints before inference.
- Introduce governance controls for blueprint versioning, approvals, and dataset provenance.

### Standalone Export Polish
- Harden export generation so produced dashboards run fully independent with no environment coupling.
- Validate all exported assets/configs against runtime assumptions (routes, styles, and transform defaults).
- Add a lightweight smoke-check flow for exported bundle integrity.

## 4. Technical Debt & Improvements

### Token Management
- Enforce strict row caps and summarized payloads across all AI calls to reduce context bloat and latency.
- Standardize sampling policy (for example: top-N rows + compact metadata only).

### Legacy AI Cleanup
- Fully deprecate and remove fragile Regex/Markdown extraction in `/api/ai/chat/route.ts`.
- Consolidate AI logic behind the typed `/api/agents/*` surface with schema-first contracts.

### Canvas & Interaction Refinements
- Continue fixing residual grid snapping and drag/drop edge cases in complex widget layouts.
- Add targeted regression tests around widget move/resize/update behavior.

## 5. Sprint 6 Snapshot

- Sprint 6 delivered strict schema-driven AI subagents for transform, style, and report insight generation.
- Client utilities now centralize typed AI calls and error handling.
- PDF report generation is operational from the viewer via client-side `@react-pdf/renderer`.
- Foundation is ready for blueprint-based few-shot learning and export hardening in the next sprint.
