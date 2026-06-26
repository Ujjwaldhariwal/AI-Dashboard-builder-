alter table data_sources
  add column if not exists schema_last_introspected_at timestamptz,
  add column if not exists schema_last_status text check (schema_last_status in ('ok', 'error', 'pending_refresh')),
  add column if not exists schema_last_error text,
  add column if not exists schema_hash text,
  add column if not exists schema_table_count int not null default 0,
  add column if not exists schema_column_count int not null default 0,
  add column if not exists schema_refresh_after timestamptz,
  add column if not exists schema_refresh_requested_at timestamptz,
  add column if not exists schema_refresh_reason text;

create table if not exists data_source_schema_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  data_source_id uuid not null references data_sources(id) on delete cascade,
  status text not null check (status in ('ok', 'error')),
  schema_hash text,
  table_count int not null default 0,
  column_count int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  elapsed_ms int not null default 0,
  error_message text,
  triggered_by uuid references auth.users(id) on delete set null,
  trigger_source text not null default 'manual' check (trigger_source in ('manual', 'scheduled', 'api')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_data_sources_schema_refresh
on data_sources (schema_last_status, schema_refresh_after);

create index if not exists idx_schema_runs_source_finished
on data_source_schema_runs (data_source_id, finished_at desc);

create index if not exists idx_schema_runs_tenant_project
on data_source_schema_runs (tenant_id, project_id, finished_at desc);

alter table data_source_schema_runs enable row level security;

drop policy if exists "schema runs readable by project access" on data_source_schema_runs;
drop policy if exists "schema runs writable by project editors" on data_source_schema_runs;

create policy "schema runs readable by project access"
on data_source_schema_runs for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "schema runs writable by project editors"
on data_source_schema_runs for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
);
