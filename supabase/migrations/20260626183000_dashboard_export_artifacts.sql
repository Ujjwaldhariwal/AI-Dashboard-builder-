create table if not exists dashboard_export_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  dashboard_id uuid not null references published_dashboards(id) on delete cascade,
  version_id uuid references dashboard_versions(id) on delete set null,
  job_id uuid references platform_jobs(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  export_type text not null default 'manifest_json' check (export_type in ('manifest_json')),
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  artifact_name text not null,
  content_type text not null default 'application/json',
  artifact jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_dashboard_export_artifacts_dashboard
on dashboard_export_artifacts (dashboard_id, created_at desc);

create index if not exists idx_dashboard_export_artifacts_version
on dashboard_export_artifacts (version_id, created_at desc);

create index if not exists idx_dashboard_export_artifacts_tenant_project
on dashboard_export_artifacts (tenant_id, project_id, created_at desc);

create index if not exists idx_dashboard_export_artifacts_job
on dashboard_export_artifacts (job_id);

alter table dashboard_export_artifacts enable row level security;

grant select, insert on dashboard_export_artifacts to authenticated;

drop policy if exists "dashboard export artifacts readable by project access" on dashboard_export_artifacts;
drop policy if exists "dashboard export artifacts insertable by project editors" on dashboard_export_artifacts;

create policy "dashboard export artifacts readable by project access"
on dashboard_export_artifacts for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "dashboard export artifacts insertable by project editors"
on dashboard_export_artifacts for insert
to authenticated
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
  and exists (
    select 1
    from published_dashboards pd
    where pd.id = dashboard_export_artifacts.dashboard_id
      and pd.tenant_id = dashboard_export_artifacts.tenant_id
      and pd.project_id = dashboard_export_artifacts.project_id
  )
  and (
    version_id is null
    or exists (
      select 1
      from dashboard_versions dv
      where dv.id = dashboard_export_artifacts.version_id
        and dv.dashboard_id = dashboard_export_artifacts.dashboard_id
        and dv.tenant_id = dashboard_export_artifacts.tenant_id
        and dv.project_id = dashboard_export_artifacts.project_id
    )
  )
  and (
    requested_by = auth.uid()
    or requested_by is null
    or is_platform_admin()
  )
);
