create table if not exists semantic_query_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  dataset_id uuid references semantic_datasets(id) on delete set null,
  chart_id uuid references dashboard_chart_configs(id) on delete set null,
  data_source_id uuid references data_sources(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  surface text not null check (surface in ('admin_preview', 'client_dataset', 'client_chart')),
  status text not null check (status in ('success', 'error')),
  query_hash text,
  row_count integer,
  elapsed_ms integer,
  timeout_ms integer,
  error_message text,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_semantic_query_runs_tenant_project
on semantic_query_runs (tenant_id, project_id, created_at desc);

create index if not exists idx_semantic_query_runs_dataset
on semantic_query_runs (dataset_id, created_at desc);

create index if not exists idx_semantic_query_runs_chart
on semantic_query_runs (chart_id, created_at desc);

alter table semantic_query_runs enable row level security;

drop policy if exists "semantic query runs readable by project access" on semantic_query_runs;
drop policy if exists "semantic query runs insertable by project access" on semantic_query_runs;

create policy "semantic query runs readable by project access"
on semantic_query_runs for select
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "semantic query runs insertable by project access"
on semantic_query_runs for insert
with check (
  auth.uid() is not null
  and actor_user_id = auth.uid()
  and has_project_access(project_id)
  and has_tenant_access(tenant_id)
);
