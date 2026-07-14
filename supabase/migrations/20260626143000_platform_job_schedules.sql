create table if not exists platform_job_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  job_type text not null check (job_type in ('dashboard_health', 'schema_refresh', 'export', 'cache_warm')),
  target_type text check (target_type in ('dashboard', 'dashboard_version', 'data_source', 'dataset', 'chart', 'project', 'tenant')),
  target_id uuid,
  enabled boolean not null default true,
  interval_minutes integer not null check (interval_minutes between 5 and 43200),
  priority integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 25),
  next_run_at timestamptz not null default now(),
  last_enqueued_at timestamptz,
  last_job_id uuid references platform_jobs(id) on delete set null,
  last_error text,
  locked_by text,
  locked_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_job_schedules_due
on platform_job_schedules (enabled, next_run_at, priority desc)
where enabled = true;

create index if not exists idx_platform_job_schedules_tenant_project
on platform_job_schedules (tenant_id, project_id, job_type, enabled);

create unique index if not exists idx_platform_job_schedules_target
on platform_job_schedules (tenant_id, project_id, job_type, target_type, target_id);

alter table platform_job_schedules enable row level security;

grant select, insert, update on platform_job_schedules to authenticated;
grant select, insert, update on platform_job_schedules to service_role;

drop policy if exists "platform job schedules readable by tenant or project access" on platform_job_schedules;
drop policy if exists "platform job schedules writable by tenant or project editors" on platform_job_schedules;

create policy "platform job schedules readable by tenant or project access"
on platform_job_schedules for select
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and has_project_access(project_id))
  or has_tenant_access(tenant_id)
);

create policy "platform job schedules writable by tenant or project editors"
on platform_job_schedules for all
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and can_publish_project(project_id))
)
with check (
  is_platform_admin()
  or (project_id is not null and can_publish_project(project_id))
);

create or replace function claim_platform_job_schedules(batch_size integer, scheduler_id text)
returns setof platform_job_schedules
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from platform_job_schedules
    where enabled = true
      and next_run_at <= now()
    order by priority desc, next_run_at asc, created_at asc
    limit greatest(1, least(batch_size, 50))
    for update skip locked
  )
  update platform_job_schedules schedules
  set
    locked_by = scheduler_id,
    locked_at = now(),
    last_enqueued_at = now(),
    next_run_at = now() + make_interval(mins => schedules.interval_minutes),
    last_error = null,
    updated_at = now()
  from picked
  where schedules.id = picked.id
  returning schedules.*;
$$;

grant execute on function claim_platform_job_schedules(integer, text) to service_role;
