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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'published_dashboards_current_version_fk'
  ) then
    alter table published_dashboards
    add constraint published_dashboards_current_version_fk
    foreign key (current_version_id) references dashboard_versions(id) on delete set null;
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

create index if not exists idx_published_dashboards_tenant_project
on published_dashboards (tenant_id, project_id, status);

create index if not exists idx_dashboard_versions_dashboard
on dashboard_versions (dashboard_id, version_number desc);

create index if not exists idx_dashboard_pages_version
on dashboard_pages (version_id, sort_order);

create index if not exists idx_dashboard_chart_slots_page
on dashboard_chart_slots (page_id, row_index, column_index);

create index if not exists idx_dashboard_chart_slots_chart
on dashboard_chart_slots (chart_config_id);

create index if not exists idx_dashboard_publish_events_dashboard
on dashboard_publish_events (dashboard_id, created_at desc);

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

create policy "published dashboards readable by project access"
on published_dashboards for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "published dashboards writable by project editors"
on published_dashboards for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
);

create policy "dashboard versions readable by project access"
on dashboard_versions for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "dashboard versions writable by project editors"
on dashboard_versions for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
  and exists (
    select 1
    from published_dashboards pd
    where pd.id = dashboard_versions.dashboard_id
      and pd.tenant_id = dashboard_versions.tenant_id
      and pd.project_id = dashboard_versions.project_id
  )
);

create policy "dashboard pages readable by project access"
on dashboard_pages for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "dashboard pages writable by project editors"
on dashboard_pages for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
  and exists (
    select 1
    from dashboard_versions dv
    where dv.id = dashboard_pages.version_id
      and dv.dashboard_id = dashboard_pages.dashboard_id
      and dv.tenant_id = dashboard_pages.tenant_id
      and dv.project_id = dashboard_pages.project_id
  )
);

create policy "dashboard chart slots readable by project access"
on dashboard_chart_slots for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "dashboard chart slots writable by project editors"
on dashboard_chart_slots for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
  and exists (
    select 1
    from dashboard_pages dp
    where dp.id = dashboard_chart_slots.page_id
      and dp.version_id = dashboard_chart_slots.version_id
      and dp.dashboard_id = dashboard_chart_slots.dashboard_id
      and dp.tenant_id = dashboard_chart_slots.tenant_id
      and dp.project_id = dashboard_chart_slots.project_id
  )
  and exists (
    select 1
    from dashboard_chart_configs dcc
    where dcc.id = dashboard_chart_slots.chart_config_id
      and dcc.tenant_id = dashboard_chart_slots.tenant_id
      and dcc.project_id = dashboard_chart_slots.project_id
      and dcc.status = 'published'
      and dcc.validation_state in ('valid', 'warning')
  )
);

create policy "dashboard publish events readable by project access"
on dashboard_publish_events for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "dashboard publish events insertable by project editors"
on dashboard_publish_events for insert
to authenticated
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
  and (
    actor_user_id = auth.uid()
    or actor_user_id is null
    or is_platform_admin()
  )
);
