create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  primary_domain text,
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hostname text not null unique,
  status text not null default 'pending' check (status in ('pending', 'verified', 'disabled')),
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'viewer')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists dashboard_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('lead', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  project_id uuid references dashboard_projects(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table dashboards add column if not exists tenant_id uuid references tenants(id) on delete set null;
alter table dashboards add column if not exists project_id uuid references dashboard_projects(id) on delete set null;
alter table dashboards add column if not exists publish_state text not null default 'draft'
  check (publish_state in ('draft', 'published', 'archived'));
alter table dashboards add column if not exists published_at timestamptz;

alter table endpoints add column if not exists tenant_id uuid references tenants(id) on delete set null;
alter table endpoints add column if not exists project_id uuid references dashboard_projects(id) on delete set null;

alter table widgets add column if not exists tenant_id uuid references tenants(id) on delete set null;
alter table widgets add column if not exists project_id uuid references dashboard_projects(id) on delete set null;

create index if not exists idx_tenants_slug on tenants (slug);
create index if not exists idx_tenant_domains_hostname on tenant_domains (hostname);
create index if not exists idx_tenant_domains_tenant_id on tenant_domains (tenant_id);
create index if not exists idx_tenant_memberships_user_id on tenant_memberships (user_id);
create index if not exists idx_tenant_memberships_tenant_id on tenant_memberships (tenant_id);
create index if not exists idx_dashboard_projects_tenant_id on dashboard_projects (tenant_id);
create index if not exists idx_project_assignments_user_id on project_assignments (user_id);
create index if not exists idx_project_assignments_project_id on project_assignments (project_id);
create index if not exists idx_audit_logs_tenant_project on audit_logs (tenant_id, project_id, created_at desc);
create index if not exists idx_dashboards_tenant_project on dashboards (tenant_id, project_id);
create index if not exists idx_endpoints_tenant_project on endpoints (tenant_id, project_id);
create index if not exists idx_widgets_tenant_project on widgets (tenant_id, project_id);

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from employees
    where employees.id = auth.uid()
      and employees.role = 'admin'
  );
$$;

create or replace function has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_platform_admin()
    or exists (
      select 1
      from tenant_memberships tm
      where tm.tenant_id = target_tenant_id
        and tm.user_id = auth.uid()
    )
    or exists (
      select 1
      from dashboard_projects dp
      join project_assignments pa on pa.project_id = dp.id
      where dp.tenant_id = target_tenant_id
        and pa.user_id = auth.uid()
    );
$$;

create or replace function has_project_access(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_platform_admin()
    or exists (
      select 1
      from project_assignments pa
      where pa.project_id = target_project_id
        and pa.user_id = auth.uid()
    )
    or exists (
      select 1
      from dashboard_projects dp
      join tenant_memberships tm on tm.tenant_id = dp.tenant_id
      where dp.id = target_project_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    );
$$;

create or replace function can_publish_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_platform_admin()
    or exists (
      select 1
      from project_assignments pa
      where pa.project_id = target_project_id
        and pa.user_id = auth.uid()
        and pa.role in ('lead', 'editor')
    )
    or exists (
      select 1
      from dashboard_projects dp
      join tenant_memberships tm on tm.tenant_id = dp.tenant_id
      where dp.id = target_project_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    );
$$;

revoke all on function is_platform_admin() from public, anon;
revoke all on function has_tenant_access(uuid) from public, anon;
revoke all on function has_project_access(uuid) from public, anon;
revoke all on function can_publish_project(uuid) from public, anon;
grant execute on function is_platform_admin() to authenticated;
grant execute on function has_tenant_access(uuid) to authenticated;
grant execute on function has_project_access(uuid) to authenticated;
grant execute on function can_publish_project(uuid) to authenticated;

alter table tenants enable row level security;
alter table tenant_domains enable row level security;
alter table tenant_memberships enable row level security;
alter table dashboard_projects enable row level security;
alter table project_assignments enable row level security;
alter table audit_logs enable row level security;

drop policy if exists "tenant readable by members" on tenants;
drop policy if exists "tenant manageable by platform admin" on tenants;
drop policy if exists "tenant domains readable by members" on tenant_domains;
drop policy if exists "tenant domains manageable by platform admin" on tenant_domains;
drop policy if exists "tenant memberships readable by members" on tenant_memberships;
drop policy if exists "tenant memberships manageable by platform admin" on tenant_memberships;
drop policy if exists "projects readable by assignment" on dashboard_projects;
drop policy if exists "projects writable by assignment" on dashboard_projects;
drop policy if exists "project assignments readable by project access" on project_assignments;
drop policy if exists "project assignments manageable by platform admin" on project_assignments;
drop policy if exists "audit logs readable by tenant access" on audit_logs;
drop policy if exists "audit logs insertable by authenticated users" on audit_logs;

create policy "tenant readable by members"
on tenants for select
using (has_tenant_access(id));

create policy "tenant manageable by platform admin"
on tenants for all
using (is_platform_admin())
with check (is_platform_admin());

create policy "tenant domains readable by members"
on tenant_domains for select
using (has_tenant_access(tenant_id));

create policy "tenant domains manageable by platform admin"
on tenant_domains for all
using (is_platform_admin())
with check (is_platform_admin());

create policy "tenant memberships readable by members"
on tenant_memberships for select
using (has_tenant_access(tenant_id));

create policy "tenant memberships manageable by platform admin"
on tenant_memberships for all
using (is_platform_admin())
with check (is_platform_admin());

create policy "projects readable by assignment"
on dashboard_projects for select
using (has_project_access(id) or has_tenant_access(tenant_id));

create policy "projects writable by assignment"
on dashboard_projects for all
using (can_publish_project(id))
with check (has_tenant_access(tenant_id));

create policy "project assignments readable by project access"
on project_assignments for select
using (has_project_access(project_id));

create policy "project assignments manageable by platform admin"
on project_assignments for all
using (is_platform_admin())
with check (is_platform_admin());

create policy "audit logs readable by tenant access"
on audit_logs for select
using (
  is_platform_admin()
  or (tenant_id is not null and has_tenant_access(tenant_id))
  or (project_id is not null and has_project_access(project_id))
);

create policy "audit logs insertable by authenticated users"
on audit_logs for insert
with check (
  auth.uid() is not null
  and (
    actor_user_id = auth.uid()
    or actor_user_id is null
    or is_platform_admin()
  )
);

drop policy if exists "tenant dashboards readable" on dashboards;
drop policy if exists "tenant dashboards writable" on dashboards;
drop policy if exists "tenant endpoints readable" on endpoints;
drop policy if exists "tenant endpoints writable" on endpoints;
drop policy if exists "tenant widgets readable" on widgets;
drop policy if exists "tenant widgets writable" on widgets;

create policy "tenant dashboards readable"
on dashboards for select
using (
  tenant_id is not null
  and (
    has_tenant_access(tenant_id)
    or (
      publish_state = 'published'
      and exists (
        select 1
        from tenant_memberships tm
        where tm.tenant_id = dashboards.tenant_id
          and tm.user_id = auth.uid()
      )
    )
  )
);

create policy "tenant dashboards writable"
on dashboards for all
using (
  project_id is not null
  and can_publish_project(project_id)
)
with check (
  project_id is not null
  and can_publish_project(project_id)
);

create policy "tenant endpoints readable"
on endpoints for select
using (
  tenant_id is not null
  and (
    has_tenant_access(tenant_id)
    or (project_id is not null and has_project_access(project_id))
  )
);

create policy "tenant endpoints writable"
on endpoints for all
using (
  project_id is not null
  and can_publish_project(project_id)
)
with check (
  project_id is not null
  and can_publish_project(project_id)
);

create policy "tenant widgets readable"
on widgets for select
using (
  tenant_id is not null
  and (
    has_tenant_access(tenant_id)
    or (project_id is not null and has_project_access(project_id))
  )
);

create policy "tenant widgets writable"
on widgets for all
using (
  project_id is not null
  and can_publish_project(project_id)
)
with check (
  project_id is not null
  and can_publish_project(project_id)
);
