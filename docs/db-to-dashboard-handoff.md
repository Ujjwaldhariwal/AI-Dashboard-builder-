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

Estimated foundation completion: about 56%.

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
- Shared tenant/project access guard at `src/lib/security/project-access.ts`.
- RBAC/project access checks across high-risk admin data source, semantic model, dataset, chart, schema-column, and project routes.
- Client runtime tenant/project isolation for published dataset and chart execution.
- Query runtime telemetry via `semantic_query_runs` and `src/lib/semantic/query-runtime-telemetry.ts`.
- Lightweight in-memory query runtime rate limiting via `src/lib/security/runtime-rate-limit.ts`.
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
- `src/types/dashboard-chart.ts`
- `src/types/chart-template.ts`
- `src/app/api/admin/dashboard-charts/route.ts`
- `src/app/api/admin/dashboard-charts/[id]/route.ts`
- `src/app/api/admin/dashboard-charts/validate/route.ts`
- `src/app/api/admin/dashboard-charts/audit/route.ts`
- `src/app/api/client/[tenantSlug]/charts/[id]/run/route.ts`
- `src/app/api/client/[tenantSlug]/datasets/[id]/run/route.ts`
- `src/components/platform/dashboard-charts-admin-panel.tsx`
- `src/components/client/published-charts-grid.tsx`
- `docs/apidog-api-inventory.md`

## Cleanup State

The previous unrelated chart/codegen/report dirty work was moved into a reversible stash:
- `stash@{0}: cleanup backup: pre-db-dashboard unrelated chart/codegen files`

Do not pop that stash into this DB-to-dashboard foundation branch unless intentionally resuming the older chart/export work.

## Next Sprint Recommendation

Next foundation sprint should be scheduled chart health checks and degraded dashboard reporting.

Why:
- RBAC and runtime guardrails now have a solid first pass.
- Chart health audit currently runs only on demand.
- Enterprise clients need stale/broken dashboards detected before a viewer opens them.

Suggested sprint:
1. Add a `chart_health_runs` / scheduled health snapshot migration.
2. Add a service that calls `auditDashboardCharts` per tenant/project and persists summary + failed chart ids.
3. Add an admin endpoint for latest degraded dashboard state.
4. Keep alerts as a later layer; first persist reliable health history.
5. Update Apidog inventory security notes where needed.

## Major Flaws To Plan

1. RBAC and project membership enforcement still needs a final pass over legacy non-platform routes.
2. Semantic model is still too shallow for enterprise analytics:
   - no certified fields
   - no business glossary
   - no time grain model
   - no calculated metrics
   - no metric ownership/versioning
3. Query runtime needs enterprise safeguards:
   - caching
   - persistent/distributed rate limiting
   - caching
   - stronger query cost policies
4. No scheduled health checks yet:
   - chart audit is manual/API-driven only
   - no alerts
   - no degraded dashboard reporting
5. Publishing model needs versioning:
   - dashboard versions
   - rollback
   - draft vs published separation
   - release notes/audit trail
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
