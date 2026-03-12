# Current Capabilities (Brief)

Last updated: March 12, 2026

## What can be done now
- Create, edit, duplicate, and delete dashboards from Workspaces.
- Add API endpoints (GET/POST) with auth modes: `none`, `api-key`, `bearer`, `basic`, and `custom-headers`.
- Load a Bosch UPPCL endpoint preset set in one click.
- Preview API responses live and create widgets from detected fields.

## Builder and visualization
- Build dashboards with drag/drop widgets and grouped sections.
- Use chart types:
  - `bar`, `line`, `area`, `pie`, `donut`
  - `horizontal-bar`, `horizontal-stacked-bar`
  - `grouped-bar`, `drilldown-bar`
  - `gauge`, `ring-gauge`, `status-card`, `table`
- Configure field mapping and field aliases (friendly labels).
- Apply dashboard-level global filters across widgets.

## AI-assisted flows
- AI chart suggestion endpoint supports expanded chart catalog.
- Builder AI chart suggester can generate and add widgets from endpoint data.
- Auth Flow page supports quick presets (simple/advanced setup).

## Runtime, auth, and monitoring
- Route protection is active via Next.js `proxy.ts` (replacing deprecated middleware convention).
- Public shared route support remains available (`/view/...`).
- Notification and monitoring stores persist safely with migration guards.
- Endpoint health/log tracking and notification counters are available.

## Export and project configuration
- Project config supports header subtitle and nav density (`comfortable` / `compact`).
- Export templates reflect updated header/sidebar config behavior.

## Operational status
- TypeScript build passes.
- Production build passes.
- Lint is configured for Next.js 16 flat config and runs successfully (warnings may remain).
