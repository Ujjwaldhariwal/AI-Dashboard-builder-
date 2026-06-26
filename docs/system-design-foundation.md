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

Status: started.

Schema introspection persists table/column metadata in `data_source_columns`. The next hardening step is freshness:

- record introspection run metadata
- add schema cache age and hash
- refresh in the background
- avoid client/runtime requests triggering heavy introspection

### 5. Query Engine + Distributed Cache

Status: partially started.

The semantic query compiler produces guarded read-only SQL and query telemetry is persisted to `semantic_query_runs`. The missing scale pieces are:

- Redis-backed result cache
- distributed rate limiting
- query cost budget by tenant/project/source
- cache keys based on tenant, project, dataset/chart, query hash, and semantic version

### 6. Background Jobs

Status: not started.

Use BullMQ or a compatible queue for:

- dashboard health schedules
- PDF/export generation
- schema refreshes
- cache warming
- alert fan-out

Runtime routes should enqueue expensive work instead of blocking client requests.

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

1. Schema introspection freshness metadata.
2. Redis cache/rate-limit interface.
3. Queue contract for scheduled health and exports.
4. AI filter policy after the above are stable.
