alter table platform_jobs
drop constraint if exists platform_jobs_job_type_check;

alter table platform_jobs
add constraint platform_jobs_job_type_check
check (job_type in ('dashboard_health', 'schema_refresh', 'export', 'cache_warm', 'alert_delivery'));

alter table platform_jobs
drop constraint if exists platform_jobs_target_type_check;

alter table platform_jobs
add constraint platform_jobs_target_type_check
check (target_type in ('dashboard', 'dashboard_version', 'data_source', 'dataset', 'chart', 'project', 'tenant', 'alert'));

alter table platform_job_schedules
drop constraint if exists platform_job_schedules_job_type_check;

alter table platform_job_schedules
add constraint platform_job_schedules_job_type_check
check (job_type in ('dashboard_health', 'schema_refresh', 'export', 'cache_warm', 'alert_delivery'));

alter table platform_job_schedules
drop constraint if exists platform_job_schedules_target_type_check;

alter table platform_job_schedules
add constraint platform_job_schedules_target_type_check
check (target_type in ('dashboard', 'dashboard_version', 'data_source', 'dataset', 'chart', 'project', 'tenant', 'alert'));

create table if not exists platform_alert_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  name text not null,
  channel_type text not null check (channel_type in ('webhook', 'email')),
  enabled boolean not null default true,
  severity_min text not null default 'warning' check (severity_min in ('info', 'warning', 'critical')),
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, project_id, name)
);

create unique index if not exists idx_platform_alert_channels_tenant_name
on platform_alert_channels (tenant_id, name)
where project_id is null;

create unique index if not exists idx_platform_alert_channels_project_name
on platform_alert_channels (tenant_id, project_id, name)
where project_id is not null;

create table if not exists platform_alert_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  alert_id uuid not null references platform_alerts(id) on delete cascade,
  channel_id uuid references platform_alert_channels(id) on delete set null,
  job_id uuid references platform_jobs(id) on delete set null,
  channel_type text not null check (channel_type in ('webhook', 'email')),
  destination text not null,
  status text not null check (status in ('succeeded', 'failed', 'skipped')),
  request_payload jsonb not null default '{}'::jsonb,
  response_status integer,
  response_body text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_platform_alert_channels_scope
on platform_alert_channels (tenant_id, project_id, enabled, channel_type);

create index if not exists idx_platform_alert_delivery_attempts_alert
on platform_alert_delivery_attempts (alert_id, attempted_at desc);

create index if not exists idx_platform_alert_delivery_attempts_tenant_project
on platform_alert_delivery_attempts (tenant_id, project_id, attempted_at desc);

alter table platform_alert_channels enable row level security;
alter table platform_alert_delivery_attempts enable row level security;

grant select, insert, update on platform_alert_channels to authenticated;
grant select, insert, update on platform_alert_channels to service_role;
grant select, insert on platform_alert_delivery_attempts to authenticated;
grant select, insert on platform_alert_delivery_attempts to service_role;

drop policy if exists "platform alert channels readable by tenant or project access" on platform_alert_channels;
drop policy if exists "platform alert channels writable by tenant or project editors" on platform_alert_channels;
drop policy if exists "platform alert deliveries readable by tenant or project access" on platform_alert_delivery_attempts;
drop policy if exists "platform alert deliveries insertable by tenant or project editors" on platform_alert_delivery_attempts;

create policy "platform alert channels readable by tenant or project access"
on platform_alert_channels for select
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and has_project_access(project_id))
  or has_tenant_access(tenant_id)
);

create policy "platform alert channels writable by tenant or project editors"
on platform_alert_channels for all
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and can_publish_project(project_id))
  or (
    project_id is null
    and exists (
      select 1
      from tenant_memberships tm
      where tm.tenant_id = platform_alert_channels.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  )
)
with check (
  is_platform_admin()
  or (project_id is not null and can_publish_project(project_id))
  or (
    project_id is null
    and exists (
      select 1
      from tenant_memberships tm
      where tm.tenant_id = platform_alert_channels.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  )
);

create policy "platform alert deliveries readable by tenant or project access"
on platform_alert_delivery_attempts for select
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and has_project_access(project_id))
  or has_tenant_access(tenant_id)
);

create policy "platform alert deliveries insertable by tenant or project editors"
on platform_alert_delivery_attempts for insert
to authenticated
with check (
  is_platform_admin()
  or (project_id is not null and can_publish_project(project_id))
  or (
    project_id is null
    and exists (
      select 1
      from tenant_memberships tm
      where tm.tenant_id = platform_alert_delivery_attempts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  )
);
