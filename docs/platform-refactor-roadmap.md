# DashboardOS Refactor Roadmap

DashboardOS is the next shape of the current AI Dashboard Builder: a multi-tenant managed dashboard platform where internal engineers configure secure database-backed dashboards and client users consume read-only analytics from tenant-specific domains.

## Product Expectations

- One deployable platform serves many clients.
- Each client maps to one tenant and only sees its own dashboards, filters, reports, branding, and users.
- Internal engineers only see assigned tenants/projects.
- Engineers connect databases, inspect schemas, define semantic datasets, configure widgets, and publish read-only dashboards.
- Client users cannot edit dashboards, datasets, credentials, schema mappings, or widget configuration.
- Client users can view charts, apply allowed filters, and generate custom PDF reports.
- Every data path must be tenant-scoped, audited, fast, and safe by default.

## Naming

- Product name: DashboardOS
- Repository package name: `dashboardos`
- Current builder routes remain during migration.

## Sprint 1 - Platform Spine

Goal: create the product structure without breaking the existing builder.

- Introduce `/admin` as the internal engineer command center.
- Introduce `/client/[tenantSlug]` as the future read-only tenant entry point.
- Add a shared platform shell with restrained enterprise navigation.
- Document the target domain model and migration path.
- Keep `/workspaces`, `/builder`, `/api-config`, and `/dashboard` working.

Exit criteria:

- Current builder still compiles.
- New platform routes compile.
- Roadmap is present in the repo.

## Sprint 2 - Tenancy And Access Model

Goal: make ownership explicit before adding database connectivity.

- Add tenant/project/user assignment types.
- Add Supabase tables and RLS plan for tenants, memberships, engineer assignments, dashboards, widgets, and audit logs.
- Move dashboard ownership from user-only to tenant/project scoped.
- Add route-level separation between admin and client access.
- Add audit event model for publish/configuration changes.

Exit criteria:

- Engineer can only see assigned projects.
- Client can only see tenant dashboards.
- Frontend checks are backed by database policies.

## Sprint 3 - Data Source Foundation

Goal: connect Postgres safely before adding more source types.

- Add `data_sources` model for encrypted Postgres credentials. _(started)_
- Build connection test route.
- Store credentials server-side only. _(started)_
- Enforce read-only connection expectations.
- Add query timeout, row limit, and audit events.
- Add schema introspection route for tables, columns, types, keys, and sampled rows.

Exit criteria:

- Admin can add a Postgres source and inspect schema metadata.
- No credentials are exposed to the browser.

## Sprint 4 - Semantic Business Model Layer

Goal: create the missing business-language bridge between raw client schemas and analytics.

- Add `business_models` per tenant/project.
- Add `business_entities` such as Customer, Invoice, Meter, Feeder, Region, SLA Event, Work Order.
- Add `business_fields` that map raw table/column references into friendly dimensions, dates, identifiers, attributes, and hidden fields.
- Add `business_metrics` such as Revenue, Collection Efficiency, Outage Count, Active Consumers, SLA Breach Rate.
- Add `business_relationships` so engineers can describe joins without exposing raw SQL to clients or AI.
- Add governance states: draft, review, approved, archived.
- Let AI suggest mappings from schema samples, but require engineer approval before use.

Exit criteria:

- Engineers can describe a client's database in business terms before creating datasets or widgets.
- AI and client-facing filters only see approved business fields and metrics, never raw schema by default.

## Sprint 5 - Semantic Dataset Layer

Goal: stop charts from depending on raw tables directly.

- Add `datasets` and bind them to approved business models.
- Let engineers select approved business entities, fields, metrics, and relationships.
- Support chart-specific axis, tooltip, filter, and aggregation config.
- Add safe dataset preview.
- Compile structured query plans into parameterized SQL.

Exit criteria:

- A widget can read from a semantic dataset instead of a REST endpoint.
- AI and users still never provide raw SQL or raw schema references.

## Sprint 6 - Published Client Dashboard

Goal: provide the client-facing read-only experience.

- Add publish state for dashboards and widgets.
- Build tenant-branded dashboard view.
- Add allowed filters and read-only chart interactions.
- Add PDF report flow based on published dashboard state.
- Remove edit links from client surfaces.

Exit criteria:

- Client route renders a published dashboard without builder controls.
- Reports use the same published filter state.

## Sprint 7 - Performance And Scale

Goal: make client dashboards fast and predictable.

- Add widget result cache with TTL.
- Add background refresh jobs.
- Add slow query logging.
- Add dashboard preload route.
- Add pagination for table widgets.
- Add query cost guards and max-result policies.

Exit criteria:

- Client dashboard primarily reads cached prepared results.
- Heavy live queries cannot degrade the whole platform.

## Sprint 8 - Controlled AI Layer

Goal: apply AI where it helps, without compromising security.

- Admin AI suggests semantic mappings and widgets from schema samples.
- Client AI converts natural language to filter/query-plan JSON only.
- AI explains charts and report summaries from already-authorized result data.
- Validate all AI output with strict schemas.

Exit criteria:

- AI never writes executable SQL.
- AI cannot access hidden columns or cross-tenant data.
