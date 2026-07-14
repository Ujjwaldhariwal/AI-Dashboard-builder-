create table if not exists query_budget_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  data_source_id uuid references data_sources(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  period text not null check (period in ('daily', 'monthly')),
  max_queries integer not null check (max_queries > 0),
  max_rows integer check (max_rows is null or max_rows > 0),
  max_elapsed_ms integer check (max_elapsed_ms is null or max_elapsed_ms > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint query_budget_scope_has_tenant check (tenant_id is not null)
);

create index if not exists idx_query_budget_policies_scope
on query_budget_policies (tenant_id, project_id, data_source_id, enabled);

alter table query_budget_policies enable row level security;

grant select, insert, update on query_budget_policies to authenticated;

drop policy if exists "query budget policies readable by tenant or project access" on query_budget_policies;
drop policy if exists "query budget policies writable by tenant or project editors" on query_budget_policies;

create policy "query budget policies readable by tenant or project access"
on query_budget_policies for select
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and has_project_access(project_id))
  or has_tenant_access(tenant_id)
);

create policy "query budget policies writable by tenant or project editors"
on query_budget_policies for all
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and can_publish_project(project_id))
)
with check (
  is_platform_admin()
  or (project_id is not null and can_publish_project(project_id))
);
