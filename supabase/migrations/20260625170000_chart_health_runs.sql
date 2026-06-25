create table if not exists chart_health_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  checked_by uuid references auth.users(id) on delete set null,
  status_filter text not null default 'published',
  total_count integer not null default 0,
  healthy_count integer not null default 0,
  stale_count integer not null default 0,
  blocked_count integer not null default 0,
  degraded_chart_ids uuid[] not null default '{}'::uuid[],
  summary jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_chart_health_runs_tenant_project
on chart_health_runs (tenant_id, project_id, checked_at desc);

alter table chart_health_runs enable row level security;

drop policy if exists "chart health runs readable by project access" on chart_health_runs;
drop policy if exists "chart health runs insertable by project access" on chart_health_runs;

create policy "chart health runs readable by project access"
on chart_health_runs for select
using (
  is_platform_admin()
  or (project_id is not null and has_project_access(project_id))
  or (tenant_id is not null and has_tenant_access(tenant_id))
);

create policy "chart health runs insertable by project access"
on chart_health_runs for insert
with check (
  auth.uid() is not null
  and checked_by = auth.uid()
  and (
    is_platform_admin()
    or (project_id is not null and has_project_access(project_id))
    or (tenant_id is not null and has_tenant_access(tenant_id))
  )
);
