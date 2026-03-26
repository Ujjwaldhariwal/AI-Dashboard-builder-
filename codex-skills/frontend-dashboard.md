# AI Dashboard Builder – Frontend & Product Skill Pack

> This file defines the NON-NEGOTIABLE standards for any AI assistant (Codex, etc.) touching this repo.
> Always read and follow this before writing or modifying code.

---

## 0. Global Principles

- The project is an **AI-powered dashboard builder** with:
  - Builder (internal tool for devs to create dashboards)
  - Viewer (final exported dashboards)
  - Monitoring (API health, latency, trends)
  - AI assistants (builder helper + end-user report/chat)
- Code must:
  - Keep UX **minimal, clean, Bosch-level enterprise** – no clutter, no noisy gradients for core charts.
  - Prefer **readability + predictable behavior** over clever tricks.
  - Be **responsive**: small/medium/large/full widget sizes must feel intentional, not accidental.
  - Respect existing architecture: Next.js App Router, Zustand stores, Supabase, chart components, etc.

Before any change, the AI must:
1. Locate this file.
2. Summarize how the requested change fits (or conflicts) with these rules.
3. Only then propose a plan + patches.

---

## 1. Chart Design & Behavior

### 1.1 Visual Style

- Charts should look **modern enterprise**, not playground:
  - Neutral backgrounds (`bg-background`), no harsh borders.
  - Limited accent colors: blues/teals/greens similar to Bosch style.
  - Grid lines subtle (`strokeOpacity` low), labels readable, never overlapping.
- Avoid:
  - Thick borders around charts.
  - Heavy shadows inside charts.
  - Overly saturated gradients.

### 1.2 Sizing & Responsiveness

- Widget sizes: `small`, `medium`, `large`, `full`.
- Behavior per size:
  - **Small**:
    - Show: title, chart only.
    - Hide: most controls (AI button, chart/table toggle, expanded view).
    - No clutter in header; use single-line titles only.
  - **Medium**:
    - Show: title, latency, small status icon, chart/table toggle.
    - Hide: less-used actions (like redundant labels).
  - **Large/Full**:
    - Show: full header (AI button, latency, cache info, health icon).
    - Charts can show legends and extra annotations.

For all sizes:
- `Card` height is controlled by `getWidgetCardHeightClass` using **fixed `h-[...]` not `min-h`**.
- Inside a card:
  - There MUST be a **height chain**:
    - `Card` → `CardContent flex-1 min-h-0` → `ChartWrapper w-full h-full min-h-0` → `ResponsiveContainer width="100%" height="100%"`.
  - No extra `min-h` on inner wrappers.

Codex must:
- If adding new chart components, *reuse the same chain*, and never reintroduce `min-h` in chart containers.

### 1.3 Margins & Layout Inside Charts

- All Recharts charts must explicitly set `margin`:
  - Example: `{ top: 16, right: 16, bottom: 16, left: 16 }`
- Goal:
  - No excessive bottom white space.
  - Axis labels and ticks visible but not overlapping.
- Legends:
  - On small/medium: prefer **top-right** or **disabled**.
  - On large/full: can show full legend at bottom or side.

Codex must:
- When touching chart code, **normalize margins via a shared constant** (e.g. `DEFAULT_CHART_MARGIN`) and use it across all charts.

### 1.4 Data Mapping & Transformation

Our data is **diverse**; each chart must be robust:

- Every chart uses **explicit field mapping** from `widget.dataMapping`:
  - `xAxis`, `yAxis`, `yAxes`, `aliases`, etc.
- Charts must:
  - Handle missing fields gracefully (warnings instead of crashes).
  - Support **multiple Y series** for grouped / stacked charts:
    - Grouped bar: multiple `yFields` per `xField`.
    - Horizontal stacked: sum of multiple `yFields`.

Transformation requirements:
- We want user-level control to:
  - Parse raw values (e.g., parse `"12.5%"` to `12.5`).
  - Concatenate fields (e.g., `state + " - " + city` for labels).
  - Compute derived metrics (e.g., `loss = input - output`).
- Codex MUST:
  - Design any new “transform” feature as a **layer separate from chart rendering**:
    - E.g. `lib/builder/data-transformer.ts` which receives raw rows + mapping config, returns clean rows for charts.
  - Use a **safe transformation approach** (no arbitrary `eval` of user strings). Prefer:
    - Predefined operations (concat, multiply, divide, % of, etc.).
    - Small declarative transform config, not free-form code.

---

## 2. Widget Card Header & Controls

Current problem: header is cluttered; name truncated; token timer area jumps.

Codex must enforce:

- Header layout priorities:
  1. **Title** visible, single-line, max width, truncated with tooltip if needed.
  2. Status (latency + health icon).
  3. Minimal controls.

### 2.1 Remove / Simplify

- REMOVE from default header:
  - Chart type badge (not needed for devs).
  - Expanded view button (unless we reintroduce with a strong UX case).
- Keep:
  - Refresh button.
  - Latency + health icon.
  - Chart/Table toggle (for > small).
  - AI insights button (medium and above, when data is valid).

### 2.2 Responsiveness in Header

- On **small** widgets:
  - Show: icon + shortened title + refresh only.
  - Hide: chart/table toggle, AI button, cache info.
- On **mobile / xs screens**:
  - Stack header into 2 rows if needed, but never allow timer / badges to resize container width during ticking.

Timer behavior:
- Token / session timer must have **fixed width**:
  - Use monospace + fixed `min-w` so ticking does not shift layout.

---

## 3. Canvas & Drag-Drop Behavior

- We use `@dnd-kit` over a CSS grid:
  - Vertical and horizontal drag must work smoothly.
  - Page should auto-scroll near viewport edges.
- Rules:
  - `SortableContext` contains only sortable widget items.
  - Non-sortable tiles (like “Add widget”) sit **outside** the context.
  - Widgets order is based on `position.y` then `position.x`, persisted in the store.
- Codex must:
  - Never reintroduce `min-h` on cards or wrappers that breaks `ResponsiveContainer`.
  - Ensure drag-overlay uses the **same grid span logic** as main cards.

---

## 4. Monitoring & AI Insights

We need:
- Clear, to-the-point monitoring.
- Self-learning check frequency.

### 4.1 Monitoring UI

- Icons:
  - Replace generic icons with:
    - Status: healthy / degraded / down.
    - Trend: improving / worsening.
- Insights:
  - Should be **short bullet points**, not paragraphs.
  - Each insight MUST answer one of:
    - What’s broken?
    - How often?
    - Since when?
    - Impact on dashboards?

Codex must:
- When adjusting monitoring UI, keep:
  - Dense table/grid layout.
  - Clear sort/filter on:
    - Latency, error count, status.

### 4.2 Health Check Scheduling Logic

High-level behavior (implementation can evolve):

- Each endpoint has:
  - `healthScore`, `latencyHistory`, `errorRate`, `lastCheckedAt`, `checkInterval`.
- Initial `checkInterval` (e.g. 1–5 minutes).
- Algorithm idea:
  - If endpoint stable (low errors, consistent latency):
    - Gradually **increase** interval (check less often).
  - If endpoint flaky (errors or high latency spikes):
    - **Decrease** interval (check more often).
- Checks must be **staggered**:
  - Do NOT hit all endpoints at the same time.
  - Use random jitter and queuing.

Codex must:
- When implementing or refactoring this:
  - Put logic in a dedicated module (e.g. `lib/monitoring/scheduler.ts`).
  - Make it easy to adjust constants (thresholds, min/max intervals).
  - Prefer background jobs / queues over blocking UI.

---

## 5. Builder AI Assistant & Final Viewer AI

### 5.1 Builder Assistant

- In the builder:
  - AI should **help dev configure charts and mappings**, not just chat randomly.
  - Examples:
    - Suggest best chart types for API schema.
    - Suggest field mappings (x, y, grouping).
    - Suggest labels / aliases.

Codex must:
- Wire builder AI into:
  - API config page.
  - Widget edit dialog.

### 5.2 Final Exported Dashboard AI

- Every exported dashboard must support:
  - AI **report generation**:
    - User describes desired report.
    - System selects charts + metrics.
    - Generates structured report (sections, bullets, maybe PDF).
  - Optionally AI chat:
    - “Why is loss high on feeder X this week?”
- Codex must:
  - Keep this logic isolated in:
    - `lib/ai/viewer-*` or `components/viewer/ai-*`.
  - Ensure no secrets are exposed in exported bundles.

---

## 6. Git Workflow & Branching

We follow **strict git hygiene**:

- Branches:
  - `main`  → production only.
  - `dev`   → integration branch.
  - `feature/*` → new features.
  - `fix/*`     → bug fixes.
- Rules for AI-generated changes:
  1. NEVER commit directly to `main`.
  2. Default base is `dev`.
  3. For any task:
     - Create a new branch:  
       `git checkout dev`  
       `git pull`  
       `git checkout -b feature/<short-task-name>`
  4. Run checks:
     - `npm run lint` (if configured)
     - `npx tsc --noEmit`
     - `npm test` (if tests exist)
  5. Use **conventional commits**:
     - `feat(canvas): improve widget drag behavior`
     - `fix(chart): correct grouped bar mapping`
  6. Open a PR into `dev`, get review, then merge.
  7. After merge:
     - Delete branch: `git branch -d feature/<short-task-name>` and remote: `git push origin --delete feature/<...>`.

Codex must:
- When suggesting git commands, always follow this flow.
- When proposing multi-file changes, group them in a single feature branch, not many small branches.

---

## 7. How Codex Should Work Step-by-Step

For ANY requested change:

1. **Locate this file** and confirm understanding with a short summary.
2. **Identify scope**:
   - Files, components, and UX pieces affected.
3. **Plan**:
   - Write a numbered plan (1–5 steps max) before editing code.
4. **Execute**:
   - Modify only the necessary files.
   - Keep diffs focused and small.
5. **Review**:
   - Explain how the changes respect:
     - Chart rules
     - Header cleanliness
     - Monitoring logic
     - Git workflow

If a requested change conflicts with these rules, Codex must say so and propose a compromise that keeps UX and architecture consistent.