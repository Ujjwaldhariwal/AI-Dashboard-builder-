create table if not exists dashboard_chart_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  dataset_id uuid not null references semantic_datasets(id) on delete restrict,
  name text not null,
  description text,
  chart_type text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  validation_state text not null default 'pending' check (validation_state in ('pending', 'valid', 'warning', 'invalid')),
  encoding jsonb not null default '{}'::jsonb,
  style jsonb not null default '{}'::jsonb,
  interactions jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dashboard_chart_validation_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  chart_config_id uuid not null references dashboard_chart_configs(id) on delete cascade,
  validation_state text not null check (validation_state in ('valid', 'warning', 'invalid')),
  issues jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users(id) on delete set null
);

create table if not exists semantic_query_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  dataset_id uuid references semantic_datasets(id) on delete set null,
  chart_config_id uuid references dashboard_chart_configs(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'blocked')),
  row_count integer,
  elapsed_ms integer,
  cache_hit boolean not null default false,
  query_hash text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists chart_health_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  chart_config_id uuid not null references dashboard_chart_configs(id) on delete cascade,
  status text not null check (status in ('healthy', 'warning', 'blocked')),
  issues jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_dashboard_chart_configs_scope on dashboard_chart_configs (tenant_id, project_id, status);
create index if not exists idx_dashboard_chart_configs_dataset on dashboard_chart_configs (dataset_id);
create index if not exists idx_dashboard_chart_validation_results_chart on dashboard_chart_validation_results (chart_config_id, checked_at desc);
create index if not exists idx_semantic_query_runs_scope on semantic_query_runs (tenant_id, project_id, created_at desc);
create index if not exists idx_semantic_query_runs_dataset on semantic_query_runs (dataset_id, created_at desc);
create index if not exists idx_chart_health_runs_chart on chart_health_runs (chart_config_id, checked_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dashboard_chart_configs_id_tenant_project_key') then
    alter table dashboard_chart_configs add constraint dashboard_chart_configs_id_tenant_project_key unique (id, tenant_id, project_id);
  end if;
end $$;

alter table dashboard_chart_configs enable row level security;
alter table dashboard_chart_validation_results enable row level security;
alter table semantic_query_runs enable row level security;
alter table chart_health_runs enable row level security;

grant select, insert, update, delete on dashboard_chart_configs to authenticated;
grant select, insert on dashboard_chart_validation_results to authenticated;
grant select, insert on semantic_query_runs to authenticated;
grant select, insert on chart_health_runs to authenticated;

drop policy if exists "dashboard charts readable by project access" on dashboard_chart_configs;
drop policy if exists "dashboard charts writable by project editors" on dashboard_chart_configs;
drop policy if exists "chart validation readable by project access" on dashboard_chart_validation_results;
drop policy if exists "chart validation insertable by project editors" on dashboard_chart_validation_results;
drop policy if exists "semantic query runs readable by project access" on semantic_query_runs;
drop policy if exists "semantic query runs insertable by project access" on semantic_query_runs;
drop policy if exists "chart health readable by project access" on chart_health_runs;
drop policy if exists "chart health insertable by project editors" on chart_health_runs;

create policy "dashboard charts readable by project access" on dashboard_chart_configs for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "dashboard charts writable by project editors" on dashboard_chart_configs for all to authenticated using (can_publish_project(project_id)) with check (can_publish_project(project_id) and has_tenant_access(tenant_id));
create policy "chart validation readable by project access" on dashboard_chart_validation_results for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "chart validation insertable by project editors" on dashboard_chart_validation_results for insert to authenticated with check (can_publish_project(project_id) and has_tenant_access(tenant_id));
create policy "semantic query runs readable by project access" on semantic_query_runs for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "semantic query runs insertable by project access" on semantic_query_runs for insert to authenticated with check (has_project_access(project_id) and has_tenant_access(tenant_id));
create policy "chart health readable by project access" on chart_health_runs for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "chart health insertable by project editors" on chart_health_runs for insert to authenticated with check (can_publish_project(project_id) and has_tenant_access(tenant_id));

create table if not exists published_dashboards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  current_version_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create table if not exists dashboard_versions (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references published_dashboards(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  title text not null,
  notes text,
  layout jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dashboard_id, version_number)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'published_dashboards_current_version_fk') then
    alter table published_dashboards add constraint published_dashboards_current_version_fk foreign key (current_version_id) references dashboard_versions(id) on delete set null;
  end if;
end $$;

create table if not exists dashboard_pages (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references dashboard_versions(id) on delete cascade,
  dashboard_id uuid not null references published_dashboards(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  title text not null,
  slug text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (version_id, slug)
);

create table if not exists dashboard_chart_slots (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references dashboard_pages(id) on delete cascade,
  version_id uuid not null references dashboard_versions(id) on delete cascade,
  dashboard_id uuid not null references published_dashboards(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  chart_config_id uuid not null references dashboard_chart_configs(id) on delete restrict,
  title text,
  slot_key text not null,
  row_index integer not null default 0 check (row_index >= 0),
  column_index integer not null default 0 check (column_index >= 0),
  width integer not null default 6 check (width between 1 and 12),
  height integer not null default 4 check (height between 1 and 24),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (page_id, slot_key)
);

create table if not exists dashboard_publish_events (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references published_dashboards(id) on delete cascade,
  version_id uuid references dashboard_versions(id) on delete set null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created', 'version_created', 'published', 'rolled_back', 'archived')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_published_dashboards_tenant_project on published_dashboards (tenant_id, project_id, status);
create index if not exists idx_dashboard_versions_dashboard on dashboard_versions (dashboard_id, version_number desc);
create index if not exists idx_dashboard_pages_version on dashboard_pages (version_id, sort_order);
create index if not exists idx_dashboard_chart_slots_page on dashboard_chart_slots (page_id, row_index, column_index);
create index if not exists idx_dashboard_chart_slots_chart on dashboard_chart_slots (chart_config_id);
create index if not exists idx_dashboard_publish_events_dashboard on dashboard_publish_events (dashboard_id, created_at desc);

alter table published_dashboards enable row level security;
alter table dashboard_versions enable row level security;
alter table dashboard_pages enable row level security;
alter table dashboard_chart_slots enable row level security;
alter table dashboard_publish_events enable row level security;

grant select, insert, update, delete on published_dashboards to authenticated;
grant select, insert, update, delete on dashboard_versions to authenticated;
grant select, insert, update, delete on dashboard_pages to authenticated;
grant select, insert, update, delete on dashboard_chart_slots to authenticated;
grant select, insert on dashboard_publish_events to authenticated;

drop policy if exists "published dashboards readable by project access" on published_dashboards;
drop policy if exists "published dashboards writable by project editors" on published_dashboards;
drop policy if exists "dashboard versions readable by project access" on dashboard_versions;
drop policy if exists "dashboard versions writable by project editors" on dashboard_versions;
drop policy if exists "dashboard pages readable by project access" on dashboard_pages;
drop policy if exists "dashboard pages writable by project editors" on dashboard_pages;
drop policy if exists "dashboard chart slots readable by project access" on dashboard_chart_slots;
drop policy if exists "dashboard chart slots writable by project editors" on dashboard_chart_slots;
drop policy if exists "dashboard publish events readable by project access" on dashboard_publish_events;
drop policy if exists "dashboard publish events insertable by project editors" on dashboard_publish_events;

create policy "published dashboards readable by project access" on published_dashboards for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "published dashboards writable by project editors" on published_dashboards for all to authenticated using (can_publish_project(project_id)) with check (can_publish_project(project_id) and has_tenant_access(tenant_id));
create policy "dashboard versions readable by project access" on dashboard_versions for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "dashboard versions writable by project editors" on dashboard_versions for all to authenticated using (can_publish_project(project_id)) with check (can_publish_project(project_id) and has_tenant_access(tenant_id));
create policy "dashboard pages readable by project access" on dashboard_pages for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "dashboard pages writable by project editors" on dashboard_pages for all to authenticated using (can_publish_project(project_id)) with check (can_publish_project(project_id) and has_tenant_access(tenant_id));
create policy "dashboard chart slots readable by project access" on dashboard_chart_slots for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "dashboard chart slots writable by project editors" on dashboard_chart_slots for all to authenticated using (can_publish_project(project_id)) with check (can_publish_project(project_id) and has_tenant_access(tenant_id));
create policy "dashboard publish events readable by project access" on dashboard_publish_events for select to authenticated using (has_project_access(project_id) or has_tenant_access(tenant_id));
create policy "dashboard publish events insertable by project editors" on dashboard_publish_events for insert to authenticated with check (can_publish_project(project_id) and has_tenant_access(tenant_id));;
