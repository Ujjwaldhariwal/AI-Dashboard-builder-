create table if not exists dashboard_health_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  dashboard_id uuid references published_dashboards(id) on delete cascade,
  version_id uuid references dashboard_versions(id) on delete set null,
  status text not null check (status in ('healthy', 'stale', 'blocked')),
  issues jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_dashboard_health_runs_dashboard on dashboard_health_runs (dashboard_id, checked_at desc);
create index if not exists idx_dashboard_health_runs_scope on dashboard_health_runs (tenant_id, project_id, checked_at desc);
alter table dashboard_health_runs enable row level security;
grant select, insert on dashboard_health_runs to authenticated;
drop policy if exists "dashboard health readable by project access" on dashboard_health_runs;
drop policy if exists "dashboard health insertable by project editors" on dashboard_health_runs;
create policy "dashboard health readable by project access" on dashboard_health_runs for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "dashboard health insertable by project editors" on dashboard_health_runs for insert to authenticated with check (can_publish_project(project_id) and has_tenant_access(tenant_id));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'published_dashboards_id_tenant_project_key') then
    alter table published_dashboards add constraint published_dashboards_id_tenant_project_key unique (id, tenant_id, project_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_versions_id_dashboard_tenant_project_key') then
    alter table dashboard_versions add constraint dashboard_versions_id_dashboard_tenant_project_key unique (id, dashboard_id, tenant_id, project_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_pages_id_version_dashboard_tenant_project_key') then
    alter table dashboard_pages add constraint dashboard_pages_id_version_dashboard_tenant_project_key unique (id, version_id, dashboard_id, tenant_id, project_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dashboard_versions_dashboard_scope_fk') then
    alter table dashboard_versions add constraint dashboard_versions_dashboard_scope_fk foreign key (dashboard_id, tenant_id, project_id) references published_dashboards (id, tenant_id, project_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'published_dashboards_current_version_scope_fk') then
    alter table published_dashboards add constraint published_dashboards_current_version_scope_fk foreign key (current_version_id, id, tenant_id, project_id) references dashboard_versions (id, dashboard_id, tenant_id, project_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_pages_version_scope_fk') then
    alter table dashboard_pages add constraint dashboard_pages_version_scope_fk foreign key (version_id, dashboard_id, tenant_id, project_id) references dashboard_versions (id, dashboard_id, tenant_id, project_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_chart_slots_page_scope_fk') then
    alter table dashboard_chart_slots add constraint dashboard_chart_slots_page_scope_fk foreign key (page_id, version_id, dashboard_id, tenant_id, project_id) references dashboard_pages (id, version_id, dashboard_id, tenant_id, project_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_chart_slots_chart_scope_fk') then
    alter table dashboard_chart_slots add constraint dashboard_chart_slots_chart_scope_fk foreign key (chart_config_id, tenant_id, project_id) references dashboard_chart_configs (id, tenant_id, project_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_publish_events_dashboard_scope_fk') then
    alter table dashboard_publish_events add constraint dashboard_publish_events_dashboard_scope_fk foreign key (dashboard_id, tenant_id, project_id) references published_dashboards (id, tenant_id, project_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_publish_events_version_scope_fk') then
    alter table dashboard_publish_events add constraint dashboard_publish_events_version_scope_fk foreign key (version_id, dashboard_id, tenant_id, project_id) references dashboard_versions (id, dashboard_id, tenant_id, project_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_health_runs_dashboard_scope_fk') then
    alter table dashboard_health_runs add constraint dashboard_health_runs_dashboard_scope_fk foreign key (dashboard_id, tenant_id, project_id) references published_dashboards (id, tenant_id, project_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_health_runs_version_scope_fk') then
    alter table dashboard_health_runs add constraint dashboard_health_runs_version_scope_fk foreign key (version_id, dashboard_id, tenant_id, project_id) references dashboard_versions (id, dashboard_id, tenant_id, project_id);
  end if;
end $$;

alter table data_sources add column if not exists schema_last_introspected_at timestamptz;
alter table data_sources add column if not exists schema_last_status text;
alter table data_sources add column if not exists schema_last_error text;
alter table data_sources add column if not exists schema_hash text;
alter table data_sources add column if not exists schema_table_count integer;
alter table data_sources add column if not exists schema_column_count integer;
alter table data_sources add column if not exists schema_refresh_after timestamptz;
alter table data_sources add column if not exists schema_refresh_requested_at timestamptz;
alter table data_sources add column if not exists schema_refresh_reason text;
create index if not exists idx_data_sources_schema_refresh_after on data_sources (schema_refresh_after) where schema_refresh_after is not null;

create table if not exists platform_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  job_type text not null check (job_type in ('dashboard_health', 'schema_refresh', 'export', 'cache_warm', 'alert_delivery')),
  target_type text not null check (target_type in ('dashboard', 'dashboard_version', 'data_source', 'dataset', 'chart', 'project', 'tenant', 'alert')),
  target_id uuid,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  priority integer not null default 50,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_platform_jobs_queue on platform_jobs (status, scheduled_for, priority desc);
create index if not exists idx_platform_jobs_scope on platform_jobs (tenant_id, project_id, created_at desc);
alter table platform_jobs enable row level security;
grant select, insert, update on platform_jobs to authenticated;
drop policy if exists "platform jobs readable by scoped access" on platform_jobs;
drop policy if exists "platform jobs insertable by project editors" on platform_jobs;
drop policy if exists "platform jobs updatable by project editors" on platform_jobs;
create policy "platform jobs readable by scoped access" on platform_jobs for select to authenticated using (is_platform_admin() or (project_id is not null and has_project_access(project_id)) or (tenant_id is not null and has_tenant_access(tenant_id)));
create policy "platform jobs insertable by project editors" on platform_jobs for insert to authenticated with check (is_platform_admin() or (project_id is not null and can_publish_project(project_id)) or (tenant_id is not null and has_tenant_access(tenant_id)));
create policy "platform jobs updatable by project editors" on platform_jobs for update to authenticated using (is_platform_admin() or (project_id is not null and can_publish_project(project_id))) with check (is_platform_admin() or (project_id is not null and can_publish_project(project_id)));

alter table platform_jobs add column if not exists claimed_by text;
alter table platform_jobs add column if not exists claimed_at timestamptz;
create index if not exists idx_platform_jobs_claimed on platform_jobs (claimed_by, claimed_at) where claimed_by is not null;

create table if not exists platform_job_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  job_type text not null,
  target_type text not null,
  target_id uuid,
  cadence text not null check (cadence in ('manual', 'hourly', 'daily', 'weekly')),
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_platform_job_schedules_next on platform_job_schedules (enabled, next_run_at);
alter table platform_job_schedules enable row level security;
grant select, insert, update, delete on platform_job_schedules to authenticated;
drop policy if exists "platform job schedules readable by scoped access" on platform_job_schedules;
drop policy if exists "platform job schedules writable by project editors" on platform_job_schedules;
create policy "platform job schedules readable by scoped access" on platform_job_schedules for select to authenticated using (is_platform_admin() or (project_id is not null and has_project_access(project_id)) or (tenant_id is not null and has_tenant_access(tenant_id)));
create policy "platform job schedules writable by project editors" on platform_job_schedules for all to authenticated using (is_platform_admin() or (project_id is not null and can_publish_project(project_id))) with check (is_platform_admin() or (project_id is not null and can_publish_project(project_id)) or (tenant_id is not null and has_tenant_access(tenant_id)));

create table if not exists platform_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  source_type text not null,
  source_id uuid,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
create index if not exists idx_platform_alerts_scope on platform_alerts (tenant_id, project_id, status, created_at desc);
alter table platform_alerts enable row level security;
grant select, insert, update on platform_alerts to authenticated;
drop policy if exists "platform alerts readable by tenant access" on platform_alerts;
drop policy if exists "platform alerts writable by project editors" on platform_alerts;
create policy "platform alerts readable by tenant access" on platform_alerts for select to authenticated using (has_tenant_access(tenant_id) or (project_id is not null and has_project_access(project_id)));
create policy "platform alerts writable by project editors" on platform_alerts for all to authenticated using (is_platform_admin() or (project_id is not null and can_publish_project(project_id))) with check (is_platform_admin() or has_tenant_access(tenant_id));

create table if not exists query_budget_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  scope text not null check (scope in ('tenant', 'project')),
  max_rows integer not null default 5000,
  timeout_ms integer not null default 15000,
  max_concurrency integer not null default 5,
  cache_ttl_seconds integer not null default 300,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, project_id, scope)
);
alter table query_budget_policies enable row level security;
grant select, insert, update, delete on query_budget_policies to authenticated;
drop policy if exists "query budget readable by tenant access" on query_budget_policies;
drop policy if exists "query budget writable by tenant admins" on query_budget_policies;
create policy "query budget readable by tenant access" on query_budget_policies for select to authenticated using (has_tenant_access(tenant_id));
create policy "query budget writable by tenant admins" on query_budget_policies for all to authenticated using (is_platform_admin() or has_tenant_access(tenant_id)) with check (is_platform_admin() or has_tenant_access(tenant_id));

alter table semantic_query_runs add column if not exists warmed_by_job_id uuid references platform_jobs(id) on delete set null;

create table if not exists dashboard_export_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  dashboard_id uuid not null references published_dashboards(id) on delete cascade,
  version_id uuid not null references dashboard_versions(id) on delete cascade,
  job_id uuid references platform_jobs(id) on delete set null,
  export_type text not null check (export_type in ('pdf', 'zip')),
  artifact_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  storage_bucket text,
  storage_path text,
  content_base64 text,
  manifest jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists idx_dashboard_export_artifacts_scope on dashboard_export_artifacts (tenant_id, project_id, dashboard_id, created_at desc);
create index if not exists idx_dashboard_export_artifacts_job on dashboard_export_artifacts (job_id);
alter table dashboard_export_artifacts add column if not exists storage_etag text;
alter table dashboard_export_artifacts add column if not exists storage_metadata jsonb not null default '{}'::jsonb;
alter table dashboard_export_artifacts add column if not exists checksum_sha256 text;
alter table dashboard_export_artifacts enable row level security;
grant select, insert on dashboard_export_artifacts to authenticated;
drop policy if exists "dashboard export artifacts readable by project access" on dashboard_export_artifacts;
drop policy if exists "dashboard export artifacts insertable by project editors" on dashboard_export_artifacts;
create policy "dashboard export artifacts readable by project access" on dashboard_export_artifacts for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "dashboard export artifacts insertable by project editors" on dashboard_export_artifacts for insert to authenticated with check (can_publish_project(project_id) and has_tenant_access(tenant_id));

create table if not exists alert_delivery_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  name text not null,
  channel_type text not null check (channel_type in ('email', 'webhook')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists alert_delivery_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references dashboard_projects(id) on delete cascade,
  alert_id uuid references platform_alerts(id) on delete cascade,
  channel_id uuid references alert_delivery_channels(id) on delete set null,
  job_id uuid references platform_jobs(id) on delete set null,
  status text not null check (status in ('queued', 'succeeded', 'failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table alert_delivery_channels enable row level security;
alter table alert_delivery_runs enable row level security;
grant select, insert, update, delete on alert_delivery_channels to authenticated;
grant select, insert on alert_delivery_runs to authenticated;
drop policy if exists "alert channels readable by tenant access" on alert_delivery_channels;
drop policy if exists "alert channels writable by tenant admins" on alert_delivery_channels;
drop policy if exists "alert delivery runs readable by tenant access" on alert_delivery_runs;
drop policy if exists "alert delivery runs insertable by project editors" on alert_delivery_runs;
create policy "alert channels readable by tenant access" on alert_delivery_channels for select to authenticated using (has_tenant_access(tenant_id));
create policy "alert channels writable by tenant admins" on alert_delivery_channels for all to authenticated using (is_platform_admin() or has_tenant_access(tenant_id)) with check (is_platform_admin() or has_tenant_access(tenant_id));
create policy "alert delivery runs readable by tenant access" on alert_delivery_runs for select to authenticated using (has_tenant_access(tenant_id) or (project_id is not null and has_project_access(project_id)));
create policy "alert delivery runs insertable by project editors" on alert_delivery_runs for insert to authenticated with check (is_platform_admin() or (project_id is not null and can_publish_project(project_id)) or has_tenant_access(tenant_id));

create table if not exists tenant_capabilities (
  tenant_id uuid not null references tenants(id) on delete cascade,
  capability text not null check (capability in ('ai_chat', 'client_runtime', 'dataset_preview', 'report_exports')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, capability)
);
create table if not exists published_dashboard_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  dashboard_id uuid not null references published_dashboards(id) on delete cascade,
  principal_type text not null check (principal_type in ('tenant', 'role', 'user')),
  principal_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner', 'admin', 'viewer')),
  can_view boolean not null default true,
  can_export boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((principal_type = 'tenant' and principal_id is null and role is null) or (principal_type = 'role' and principal_id is null and role is not null) or (principal_type = 'user' and principal_id is not null and role is null))
);
create table if not exists semantic_dataset_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  dataset_id uuid not null references semantic_datasets(id) on delete cascade,
  principal_type text not null check (principal_type in ('tenant', 'role', 'user')),
  principal_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner', 'admin', 'viewer')),
  can_preview boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((principal_type = 'tenant' and principal_id is null and role is null) or (principal_type = 'role' and principal_id is null and role is not null) or (principal_type = 'user' and principal_id is not null and role is null))
);
create index if not exists idx_tenant_capabilities_enabled on tenant_capabilities (tenant_id, capability, enabled);
create index if not exists idx_dashboard_entitlements_scope on published_dashboard_entitlements (tenant_id, project_id, dashboard_id);
create index if not exists idx_dataset_entitlements_scope on semantic_dataset_entitlements (tenant_id, project_id, dataset_id);
create unique index if not exists idx_dashboard_entitlements_unique_principal on published_dashboard_entitlements (dashboard_id, principal_type, coalesce(principal_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(role, ''));
create unique index if not exists idx_dataset_entitlements_unique_principal on semantic_dataset_entitlements (dataset_id, principal_type, coalesce(principal_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(role, ''));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'published_dashboard_entitlements_scope_fk') then
    alter table published_dashboard_entitlements add constraint published_dashboard_entitlements_scope_fk foreign key (dashboard_id, tenant_id, project_id) references published_dashboards (id, tenant_id, project_id) on delete cascade;
  end if;
end $$;

alter table tenant_capabilities enable row level security;
alter table published_dashboard_entitlements enable row level security;
alter table semantic_dataset_entitlements enable row level security;
grant select, insert, update, delete on tenant_capabilities to authenticated;
grant select, insert, update, delete on published_dashboard_entitlements to authenticated;
grant select, insert, update, delete on semantic_dataset_entitlements to authenticated;
drop policy if exists "tenant capabilities readable by tenant access" on tenant_capabilities;
drop policy if exists "tenant capabilities writable by tenant admins" on tenant_capabilities;
drop policy if exists "dashboard entitlements readable by project access" on published_dashboard_entitlements;
drop policy if exists "dashboard entitlements writable by project editors" on published_dashboard_entitlements;
drop policy if exists "dataset entitlements readable by project access" on semantic_dataset_entitlements;
drop policy if exists "dataset entitlements writable by project editors" on semantic_dataset_entitlements;
create policy "tenant capabilities readable by tenant access" on tenant_capabilities for select to authenticated using (has_tenant_access(tenant_id));
create policy "tenant capabilities writable by tenant admins" on tenant_capabilities for all to authenticated using (is_platform_admin() or exists (select 1 from tenant_memberships tm where tm.tenant_id = tenant_capabilities.tenant_id and tm.user_id = auth.uid() and tm.role in ('owner', 'admin'))) with check (is_platform_admin() or exists (select 1 from tenant_memberships tm where tm.tenant_id = tenant_capabilities.tenant_id and tm.user_id = auth.uid() and tm.role in ('owner', 'admin')));
create policy "dashboard entitlements readable by project access" on published_dashboard_entitlements for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "dashboard entitlements writable by project editors" on published_dashboard_entitlements for all to authenticated using (can_publish_project(project_id)) with check (can_publish_project(project_id) and has_tenant_access(tenant_id));
create policy "dataset entitlements readable by project access" on semantic_dataset_entitlements for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "dataset entitlements writable by project editors" on semantic_dataset_entitlements for all to authenticated using (can_publish_project(project_id)) with check (can_publish_project(project_id) and has_tenant_access(tenant_id));

insert into tenant_capabilities (tenant_id, capability, enabled)
select tenants.id, capability, true from tenants cross join (values ('ai_chat'), ('client_runtime'), ('dataset_preview'), ('report_exports')) as defaults(capability) where tenants.status = 'active'
on conflict (tenant_id, capability) do nothing;
insert into published_dashboard_entitlements (tenant_id, project_id, dashboard_id, principal_type, can_view, can_export)
select tenant_id, project_id, id, 'tenant', true, true from published_dashboards where status = 'published'
and not exists (select 1 from published_dashboard_entitlements pde where pde.dashboard_id = published_dashboards.id and pde.principal_type = 'tenant' and pde.principal_id is null and pde.role is null);
insert into semantic_dataset_entitlements (tenant_id, project_id, dataset_id, principal_type, can_preview)
select tenant_id, project_id, id, 'tenant', true from semantic_datasets where status = 'published'
and not exists (select 1 from semantic_dataset_entitlements sde where sde.dataset_id = semantic_datasets.id and sde.principal_type = 'tenant' and sde.principal_id is null and sde.role is null);;
