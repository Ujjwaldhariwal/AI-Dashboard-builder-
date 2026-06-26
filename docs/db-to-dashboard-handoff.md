# DB to Dashboard Handoff

Last updated: 2026-06-25

## Product Direction

We are evolving the current AI Dashboard Builder into a multitenant DB-to-dashboard platform.

The target product:
- Each client has isolated access through their own domain/login.
- Clients only see published read-only dashboards, charts, and PDF/report generation.
- Internal engineers/admins connect client databases, define semantic business models, create datasets, configure charts, validate, publish, and monitor health.
- Engineers should not see projects/dashboards outside their allowed tenant/project scope.
- Runtime dashboards must be fast, secure, smooth, and read-only.

Current priority from the user: strongest possible foundation first, enterprise UI polish later.

## Current Foundation Progress

Estimated foundation completion: about 70%.

Completed or started:
- Monokai-style admin shell and platform direction.
- Supabase migrations for multitenancy, projects, data sources, semantic model, datasets, and dashboard chart configs.
- Admin APIs for tenants, projects, data sources, semantic models, semantic datasets, dashboard charts.
- Client runtime APIs for published datasets and published chart execution.
- Semantic dataset query compiler.
- Chart template registry and dataset shape analyzer.
- Chart config validator for template compatibility, fields, metrics, tooltips, limits, and warnings.
- Admin chart composer with compatible chart template selection.
- Published chart runtime revalidation, so stale configs fail with `422` instead of breaking dashboards.
- Admin chart health audit endpoint.
- Shared chart health auditor service at `src/lib/semantic/chart-health-auditor.ts`.
- Admin chart UI now shows health states: `healthy`, `stale`, `blocked`.
- Admin published-dashboard APIs now exist for dashboard shells, version creation, and publish promotion.
- Admin publishing panel now creates dashboard shells, composes draft versions from eligible chart configs, lists versions, and publishes a selected version.
- Client dashboard rendering now prefers published dashboard versions, pages, and chart slots before falling back to legacy published chart listing.
- Dashboard-level health checks now roll up chart health through published versions and slots, persist `dashboard_health_runs`, and show client-visible health state.
- Publishing integrity is now enforced with composite database constraints so versions, pages, slots, health runs, publish events, and chart configs cannot silently cross tenant/project boundaries.
- Publish promotion now runs a version-specific dashboard health audit, blocks `blocked` releases, and records the publish-time health snapshot on successful promotion.
- Rollback promotion now exists as a governed endpoint: it rejects invalid rollback states, health-gates the target version, records a `rolled_back` event, writes audit metadata, and persists the rollback health snapshot.
- Authenticated default entry points now land in DashboardOS admin instead of legacy workspaces.
- Legacy widget persistence and endpoint-training APIs now return `410 Gone` with DashboardOS replacement pointers.
- Shared tenant/project access guard at `src/lib/security/project-access.ts`.
- RBAC/project access checks across high-risk admin data source, semantic model, dataset, chart, schema-column, and project routes.
- Client runtime tenant/project isolation for published dataset and chart execution.
- Authenticated custom-domain tenant routing has started in `src/proxy.ts`: verified `tenant_domains.hostname` entries rewrite root requests into the tenant client runtime and attach tenant headers.
- Production hostname rules now classify hosts before routing: local dev hosts, explicit platform allowlist hosts, optional `{tenant}.root-domain` tenant subdomains, and exact verified custom tenant domains.
- Tenant hostnames now serve the client runtime only; authenticated unknown tenant hosts return `404` instead of falling through to platform admin routes.
- Query runtime telemetry via `semantic_query_runs` and `src/lib/semantic/query-runtime-telemetry.ts`.
- Query runtime now has an Upstash-compatible Redis REST interface for distributed rate limiting and client result caching, with safe in-memory fallback when Redis is not configured.
- Read-only Postgres query execution now uses a bounded per-`data_source_id` pool manager for the hot runtime path instead of opening a fresh client for every chart/dataset request.
- Schema introspection freshness now records source-level schema status, hash, table/column counts, next refresh time, refresh request metadata, and per-run history in `data_source_schema_runs`.
- Background job queue contract now exists through `platform_jobs`, `src/lib/jobs/platform-jobs.ts`, and `GET/POST /api/admin/jobs` for dashboard health, schema refresh, export, cache-warm, and alert-delivery work.
- Manual schema refresh requests now enqueue a deduped `schema_refresh` job after marking the source `pending_refresh`.
- Worker execution has started through `POST /api/admin/jobs/worker`, protected by `DASHBOARDOS_WORKER_SECRET` and backed by a service-role Supabase client.
- The worker now executes `dashboard_health` jobs and `schema_refresh` jobs with retry/backoff state transitions.
- Recurring schedules now exist through `platform_job_schedules`, `GET/POST /api/admin/jobs/schedules`, and secret-protected `POST /api/admin/jobs/scheduler`.
- Persistent platform alerts now exist through `platform_alerts`, `GET /api/admin/alerts`, and `PATCH /api/admin/alerts/{id}`.
- Dashboard health jobs now open or refresh one `dashboard_blocked` alert per blocked dashboard and auto-resolve it once health recovers.
- Alert fan-out now exists through `platform_alert_channels`, `platform_alert_delivery_attempts`, `GET/POST /api/admin/alert-channels`, `GET /api/admin/alert-deliveries`, and `alert_delivery` worker jobs for webhook/email-gateway channels.
- Query budget policies now exist through `query_budget_policies` and `GET/POST /api/admin/query-budgets`.
- Admin preview, client dataset/chart runtime, and cache-warm jobs enforce tenant/project/source query budgets before opening source database queries.
- Runtime cache misses now also enforce post-execution row and elapsed-time budget projections before caching or returning query results.
- Cache-warm jobs now execute through the worker for dataset, chart, and project targets, writing the same query-result cache used by client runtime.
- Export artifact jobs now execute through the worker for published dashboards and dashboard versions, generating durable `manifest_json` records in `dashboard_export_artifacts`.
- Export artifacts now record storage bucket/path, byte size, SHA-256 checksum, and upload to `DASHBOARDOS_EXPORT_BUCKET`/`SUPABASE_EXPORT_BUCKET` when configured.
- Supabase schema cleanup now removes the legacy API-dashboard tables from the active database contract.
- Schema boundaries are documented in `docs/supabase-schema-boundaries.md`.
- System design scaling order is documented in `docs/system-design-foundation.md`.
- First-class dashboard publishing schema has started with dashboards, versions, pages, chart slots, and publish events.
- Apidog API inventory is maintained at `docs/apidog-api-inventory.md`.
- API inventory checker exists via `npm run api-docs:check`.
- Graphify is installed and used for codebase context. Run `npx graphify hook-rebuild` after code changes.

Recent pushed commits:
- `f3cd521 feat: add client chart runtime endpoint`
- `63029fc feat: revalidate client chart runtime`
- `f22b8bd feat: add chart health audit endpoint`
- `ec0739b feat: show chart audit health in admin`
- `a977d05 refactor: extract chart health auditor`
- `00aea45 feat: harden platform access and query telemetry`
- `c2be49d feat: rate limit query runtime calls`

Current branch:
- `feature/db-dashboard-foundation`

Remote:
- `origin` -> `https://github.com/Ujjwaldhariwal/AI-Dashboard-builder-.git`

## Important Current Files

- `src/lib/semantic/dataset-query-compiler.ts`
- `src/lib/semantic/chart-template-registry.ts`
- `src/lib/semantic/dataset-shape-analyzer.ts`
- `src/lib/semantic/chart-config-validator.ts`
- `src/lib/semantic/chart-health-auditor.ts`
- `src/lib/security/project-access.ts`
- `src/lib/security/runtime-rate-limit.ts`
- `src/lib/semantic/query-runtime-telemetry.ts`
- `src/lib/data-sources/postgres-runtime.ts`
- `src/lib/legacy/legacy-route-response.ts`
- `src/lib/publishing/dashboard-health-auditor.ts`
- `src/lib/jobs/platform-jobs.ts`
- `src/lib/jobs/platform-job-runner.ts`
- `src/lib/jobs/platform-job-schedules.ts`
- `src/lib/alerts/platform-alerts.ts`
- `src/lib/alerts/alert-delivery.ts`
- `src/lib/semantic/query-budget-policy.ts`
- `src/lib/semantic/query-cache-warmer.ts`
- `src/lib/publishing/dashboard-export-artifact.ts`
- `src/lib/data-sources/schema-introspection-runner.ts`
- `src/types/dashboard-chart.ts`
- `src/types/dashboard-publishing.ts`
- `src/lib/publishing/dashboard-publishing.ts`
- `src/types/chart-template.ts`
- `src/components/platform/published-dashboards-admin-panel.tsx`
- `src/app/(admin)/admin/publishing/page.tsx`
- `src/app/api/admin/published-dashboards/route.ts`
- `src/app/api/admin/published-dashboards/[id]/route.ts`
- `src/app/api/admin/published-dashboards/[id]/versions/route.ts`
- `src/app/api/admin/published-dashboards/[id]/publish/route.ts`
- `src/app/api/admin/published-dashboards/health/route.ts`
- `src/app/api/admin/jobs/route.ts`
- `src/app/api/admin/jobs/schedules/route.ts`
- `src/app/api/admin/jobs/scheduler/route.ts`
- `src/app/api/admin/jobs/worker/route.ts`
- `src/app/api/admin/dashboard-exports/route.ts`
- `src/app/api/admin/alert-channels/route.ts`
- `src/app/api/admin/alert-deliveries/route.ts`
- `src/app/api/admin/alerts/route.ts`
- `src/app/api/admin/alerts/[id]/route.ts`
- `src/app/api/admin/query-budgets/route.ts`
- `src/app/api/admin/dashboard-charts/route.ts`
- `src/app/api/admin/dashboard-charts/[id]/route.ts`
- `src/app/api/admin/dashboard-charts/validate/route.ts`
- `src/app/api/admin/dashboard-charts/audit/route.ts`
- `src/app/api/client/[tenantSlug]/charts/[id]/run/route.ts`
- `src/app/api/client/[tenantSlug]/datasets/[id]/run/route.ts`
- `src/app/(client)/client/[tenantSlug]/page.tsx`
- `src/proxy.ts`
- `src/components/platform/dashboard-charts-admin-panel.tsx`
- `src/components/client/published-charts-grid.tsx`
- `docs/apidog-api-inventory.md`

## Cleanup State

The previous unrelated chart/codegen/report dirty work was moved into a reversible stash:
- `stash@{0}: cleanup backup: pre-db-dashboard unrelated chart/codegen files`

Do not pop that stash into this DB-to-dashboard foundation branch unless intentionally resuming the older chart/export work.

## Next Sprint Recommendation

Next foundation sprint is now underway: production routing and runtime scale hardening.

Why:
- The platform should fail closed when published dashboard data drifts across tenant/project scope.
- Runtime health is now a release gate, so the next gap is operating it continuously.
- Runtime execution must stay bounded when 10-30 client databases are active at the same time.
- Enterprise clients need governed published dashboards before broader UI completion.

Suggested sprint sequence:
1. Add PDF/ZIP export rendering on top of the export artifact storage contract.
2. Add native email provider integration after the alert channel contract stabilizes.
3. Replace the remaining legacy builder/viewer Supabase assumptions with tenant/project admin flows.

## Major Flaws To Plan

1. Legacy UI/API routes still reference removed Supabase concepts and need replacement before demo.
2. Semantic model is still too shallow for enterprise analytics:
   - no certified fields
   - no business glossary
   - no time grain model
   - no calculated metrics
   - no metric ownership/versioning
3. Query runtime needs enterprise safeguards:
   - caching
   - persistent/distributed rate limiting
   - stronger query cost policies
4. Publishing model needs versioning:
   - dashboard versions
   - draft vs published separation
   - release notes/audit trail
5. No external alert delivery yet:
   - durable queue, recurring schedules, worker execution, and persistent alerts exist
   - blocked dashboard alerts are queryable in-app/API but not sent to email/webhooks yet
6. Query budgets are count-enforced before execution; row and elapsed totals are tracked for policy visibility but not yet hard-stopped mid-query.
6. Client dashboard needs PDF/report architecture.
7. UI still feels like panels/forms rather than an enterprise control center, but this is intentionally secondary until the foundation is stronger.

## Verification Pattern Used

For each sprint, usually run:

```bash
npx tsc --noEmit
npx eslint --no-warn-ignored --no-error-on-unmatched-pattern <changed-files>
git diff --check -- <changed-files>
npm run api-docs:check
npx graphify hook-rebuild
```

After `npx graphify hook-rebuild`, generated `.graphify/GRAPH_REPORT.md`, `.graphify/graph.json`, and `.graphify/scope.json` may change. Restore them unless intentionally committing graph artifacts.

## User Preference

The user wants slow, precise foundation-building over flashy UI work.

At the end of each sprint, report:
- what changed
- verification done
- commit hash if pushed
- approximate percentage done/pending
- major flaws or risks that still need planning
