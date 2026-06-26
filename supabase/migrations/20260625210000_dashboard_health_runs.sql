create table if not exists dashboard_health_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  dashboard_id uuid references published_dashboards(id) on delete cascade,
  version_id uuid references dashboard_versions(id) on delete set null,
  checked_by uuid references auth.users(id) on delete set null,
  health_state text not null check (health_state in ('healthy', 'stale', 'blocked')),
  total_slots integer not null default 0,
  healthy_slots integer not null default 0,
  stale_slots integer not null default 0,
  blocked_slots integer not null default 0,
  degraded_chart_ids uuid[] not null default '{}'::uuid[],
  summary jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_dashboard_health_runs_dashboard
on dashboard_health_runs (dashboard_id, checked_at desc);

create index if not exists idx_dashboard_health_runs_tenant_project
on dashboard_health_runs (tenant_id, project_id, checked_at desc);

create index if not exists idx_dashboard_health_runs_state
on dashboard_health_runs (health_state, checked_at desc);

alter table dashboard_health_runs enable row level security;

grant select, insert on dashboard_health_runs to authenticated;

drop policy if exists "dashboard health runs readable by project access" on dashboard_health_runs;
drop policy if exists "dashboard health runs insertable by project access" on dashboard_health_runs;

create policy "dashboard health runs readable by project access"
on dashboard_health_runs for select
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and has_project_access(project_id))
  or (tenant_id is not null and has_tenant_access(tenant_id))
);

create policy "dashboard health runs insertable by project access"
on dashboard_health_runs for insert
to authenticated
with check (
  auth.uid() is not null
  and checked_by = auth.uid()
  and (
    is_platform_admin()
    or (project_id is not null and has_project_access(project_id))
    or (tenant_id is not null and has_tenant_access(tenant_id))
  )
);
