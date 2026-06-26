# System Design Foundation

Last updated: 2026-06-26

This project should scale as a governed DB-to-dashboard platform before AI features expand.

## Foundation Order

1. Meta DB schema + RLS policies
2. Tenant routing middleware
3. Connection pool manager
4. Schema introspector + cache
5. Query engine with distributed cache
6. Background jobs for exports and schedules
7. AI filter layer

AI belongs last because it should plan only against approved semantic metadata, not raw client databases.

## Current Position

### 1. Meta DB Schema + RLS

Status: strong and still improving.

The platform now has tenant/project metadata, data sources, schema metadata, semantic models, datasets, chart configs, publishing, versioning, rollback, dashboard health, query telemetry, and RLS boundaries.

### 2. Tenant Routing

Status: hardened for production host classification.

Current runtime resolves `/client/[tenantSlug]` directly for local/dev fallback. `src/proxy.ts` now also resolves verified custom hostnames from `tenant_domains` for authenticated requests and rewrites the root path to the tenant client runtime.

- custom domain maps to `tenant_domains.hostname`
- platform/system routes are served only from local development hosts or explicit `DASHBOARDOS_PLATFORM_HOSTNAMES`
- `NEXT_PUBLIC_APP_URL` is also treated as a platform hostname for deployment convenience
- optional `{tenant}.app-domain.com` routing is enabled by `DASHBOARDOS_TENANT_ROOT_DOMAINS`
- tenant subdomains resolve the subdomain label against an active `tenants.slug`
- resolver returns `tenant_id` and `tenant_slug`
- rewritten requests receive `x-dashboardos-tenant-id` and `x-dashboardos-tenant-slug`
- client runtime should prefer hostname context, with path slug as a fallback for local/dev
- authenticated requests to unknown tenant hostnames return `404` instead of falling through to admin/system routes

Remaining routing work:

- support public pre-login tenant branding on custom domains
- move verified tenant-domain lookup to a public-safe resolver if pre-login tenant branding must distinguish known and unknown custom domains before auth

### 3. Connection Pool Manager

Status: started.

`src/lib/data-sources/postgres-runtime.ts` now uses a bounded managed pool for read-only runtime execution:

- stable pool key comes from `data_source_id`
- default pool size is intentionally small
- idle pools are evicted
- active pool count is capped
- introspection remains one-off by default

This prevents every chart/dataset request from opening a fresh Postgres connection while still avoiding unbounded pools across many client databases.

Production notes:

- serverless deployments can multiply pools per instance
- prefer PgBouncer, RDS Proxy, Neon pooling, Supabase pooling, or equivalent where possible
- keep database users read-only
- keep per-source pool max low until real workload metrics justify increasing it

### 4. Schema Introspector + Cache

Status: freshness contract added.

Schema introspection persists current table/column metadata in `data_source_columns` and now records source-level freshness on `data_sources`:

- last introspected timestamp
- schema status: `ok`, `error`, or `pending_refresh`
- deterministic schema hash
- table and column counts
- next refresh timestamp
- refresh requested timestamp and reason

Each scan also writes `data_source_schema_runs`, giving operators a run ledger with counts, hash, elapsed time, trigger source, and error messages. Manual refresh requests now mark a source as `pending_refresh`; the next scheduler/queue sprint can consume that metadata without client/runtime routes triggering heavy introspection.

### 5. Query Engine + Distributed Cache

Status: Redis interface added with safe fallback.

The semantic query compiler produces guarded read-only SQL and query telemetry is persisted to `semantic_query_runs`. Runtime execution now has:

- Redis-backed result cache via Upstash-compatible REST env vars
- per-instance in-memory result cache fallback when Redis is not configured
- distributed rate limiting via the same Redis REST interface
- per-instance in-memory rate-limit fallback for local/demo environments
- cache keys scoped by tenant, project, dataset/chart, data source, SQL, semantic update timestamps, and schema hash

The runtime now supports query budget policies through `query_budget_policies` and `GET/POST /api/admin/query-budgets`. Runtime cache misses check tenant/project/source policies before opening a Postgres query. Exhausted budgets return `429` with `Retry-After` and reset metadata, and budget denials are recorded in `semantic_query_runs`.

Completed scale pieces now include:

- proactive cache warming through scheduled jobs

### 6. Background Jobs

Status: recurring schedules and worker execution started.

The platform now has `platform_jobs` as the shared queue contract for:

- dashboard health schedules
- PDF/export generation
- schema refreshes
- cache warming

`GET /api/admin/jobs` lists jobs by tenant/project/type/status for operators, while `POST /api/admin/jobs` lets trusted admin flows or external schedulers enqueue work with priority, run time, retry, payload, and dedupe metadata. Manual schema refresh requests now mark the data source `pending_refresh` and enqueue a deduped `schema_refresh` job.

`POST /api/admin/jobs/worker` is the first worker surface. It is protected by `DASHBOARDOS_WORKER_SECRET`, uses `SUPABASE_SERVICE_ROLE_KEY`, atomically claims ready jobs through `claim_platform_jobs`, and currently executes:

- `dashboard_health`: audits published dashboards and records `dashboard_health_runs`
- `schema_refresh`: introspects the target data source and refreshes schema metadata
- `cache_warm`: compiles published dataset/chart SQL, runs read-only queries, and writes query-result cache entries
- `export`: generates a durable `manifest_json` artifact for a published dashboard or dashboard version

Failed jobs return to `queued` with backoff until `max_attempts`, then become `failed`.

`platform_job_schedules` and `POST /api/admin/jobs/scheduler` now provide recurring job seeding. The scheduler route is protected by the same worker secret, claims due schedules atomically through `claim_platform_job_schedules`, advances `next_run_at`, and enqueues deduped jobs for the worker route. `GET/POST /api/admin/jobs/schedules` lets authenticated operators inspect and manage schedules.

Alert hooks now create persistent `platform_alerts` when a scheduled or manual dashboard health run finds a dashboard in `blocked` state. Repeated blocked runs refresh the existing open alert instead of spamming duplicates, and later non-blocked health runs auto-resolve the alert. Operators can list alerts through `GET /api/admin/alerts` and acknowledge/resolve them through `PATCH /api/admin/alerts/{id}`.

Remaining job work:

- add PDF/ZIP rendering and external object storage for export artifacts
- add external alert fan-out, such as email/webhooks, for newly blocked dashboards

### 7. AI Filter Layer

Status: intentionally last.

AI should only see and generate against:

- approved business fields
- approved metrics
- published semantic datasets
- allowed filters
- chart/report policies

AI should not receive raw credentials, arbitrary SQL access, or unrestricted raw schema by default.

## Next Architecture Sprints

1. Export artifact worker.
2. External alert fan-out for email/webhooks.
3. Stronger budget dimensions beyond query count, such as row and elapsed-time hard stops.
4. AI filter policy after the above are stable.
