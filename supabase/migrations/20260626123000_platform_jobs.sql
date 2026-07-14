create table if not exists platform_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  job_type text not null check (job_type in ('dashboard_health', 'schema_refresh', 'export', 'cache_warm')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  target_type text check (target_type in ('dashboard', 'dashboard_version', 'data_source', 'dataset', 'chart', 'project', 'tenant')),
  target_id uuid,
  priority integer not null default 0,
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 25),
  dedupe_key text,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_jobs_ready
on platform_jobs (status, run_after, priority desc, created_at)
where status = 'queued';

create index if not exists idx_platform_jobs_tenant_project
on platform_jobs (tenant_id, project_id, created_at desc);

create index if not exists idx_platform_jobs_type_status
on platform_jobs (job_type, status, created_at desc);

create unique index if not exists idx_platform_jobs_active_dedupe
on platform_jobs (dedupe_key)
where dedupe_key is not null and status in ('queued', 'running');

alter table platform_jobs enable row level security;

grant select, insert on platform_jobs to authenticated;
grant select, insert, update on platform_jobs to service_role;

drop policy if exists "platform jobs readable by tenant or project access" on platform_jobs;
drop policy if exists "platform jobs insertable by tenant or project editors" on platform_jobs;

create policy "platform jobs readable by tenant or project access"
on platform_jobs for select
to authenticated
using (
  is_platform_admin()
  or (project_id is not null and has_project_access(project_id))
  or has_tenant_access(tenant_id)
);

create policy "platform jobs insertable by tenant or project editors"
on platform_jobs for insert
to authenticated
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and (
    is_platform_admin()
    or (project_id is not null and has_project_access(project_id))
    or has_tenant_access(tenant_id)
  )
);
