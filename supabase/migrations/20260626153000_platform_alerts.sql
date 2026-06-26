create table if not exists platform_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  alert_key text not null,
  alert_type text not null check (alert_type in ('dashboard_blocked', 'chart_stale', 'schema_refresh_failed', 'job_failed')),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  state text not null default 'open' check (state in ('open', 'acknowledged', 'resolved')),
  title text not null,
  message text not null,
  source_type text not null check (source_type in ('dashboard', 'chart', 'data_source', 'job')),
  source_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_platform_alerts_active_key
on platform_alerts (alert_key)
where state in ('open', 'acknowledged');

create index if not exists idx_platform_alerts_tenant_project
on platform_alerts (tenant_id, project_id, state, last_seen_at desc);

create index if not exists idx_platform_alerts_source
on platform_alerts (source_type, source_id, state);

alter table platform_alerts enable row level security;

grant select, insert, update on platform_alerts to authenticated;
grant select, insert, update on platform_alerts to service_role;

drop policy if exists "platform alerts readable by tenant or project access" on platform_alerts;
drop policy if exists "platform alerts writable by tenant or project editors" on platform_alerts;

create policy "platform alerts readable by tenant or project access"
on platform_alerts for select
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and has_project_access(project_id))
  or has_tenant_access(tenant_id)
);

create policy "platform alerts writable by tenant or project editors"
on platform_alerts for update
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and can_publish_project(project_id))
)
with check (
  is_platform_admin()
  or (project_id is not null and can_publish_project(project_id))
);
