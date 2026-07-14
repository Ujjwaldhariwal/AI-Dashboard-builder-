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
  check (
    (principal_type = 'tenant' and principal_id is null and role is null)
    or (principal_type = 'role' and principal_id is null and role is not null)
    or (principal_type = 'user' and principal_id is not null and role is null)
  )
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
  check (
    (principal_type = 'tenant' and principal_id is null and role is null)
    or (principal_type = 'role' and principal_id is null and role is not null)
    or (principal_type = 'user' and principal_id is not null and role is null)
  )
);

create index if not exists idx_tenant_capabilities_enabled
on tenant_capabilities (tenant_id, capability, enabled);

create index if not exists idx_dashboard_entitlements_scope
on published_dashboard_entitlements (tenant_id, project_id, dashboard_id);

create index if not exists idx_dashboard_entitlements_user
on published_dashboard_entitlements (principal_type, principal_id)
where principal_type = 'user';

create unique index if not exists idx_dashboard_entitlements_unique_principal
on published_dashboard_entitlements (
  dashboard_id,
  principal_type,
  coalesce(principal_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(role, '')
);

create index if not exists idx_dataset_entitlements_scope
on semantic_dataset_entitlements (tenant_id, project_id, dataset_id);

create index if not exists idx_dataset_entitlements_user
on semantic_dataset_entitlements (principal_type, principal_id)
where principal_type = 'user';

create unique index if not exists idx_dataset_entitlements_unique_principal
on semantic_dataset_entitlements (
  dataset_id,
  principal_type,
  coalesce(principal_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(role, '')
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'published_dashboard_entitlements_scope_fk'
  ) then
    alter table published_dashboard_entitlements
    add constraint published_dashboard_entitlements_scope_fk
    foreign key (dashboard_id, tenant_id, project_id)
    references published_dashboards (id, tenant_id, project_id)
    on delete cascade;
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

create policy "tenant capabilities readable by tenant access"
on tenant_capabilities for select
to authenticated
using (has_tenant_access(tenant_id));

create policy "tenant capabilities writable by tenant admins"
on tenant_capabilities for all
to authenticated
using (
  is_platform_admin()
  or exists (
    select 1
    from tenant_memberships tm
    where tm.tenant_id = tenant_capabilities.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  )
)
with check (
  is_platform_admin()
  or exists (
    select 1
    from tenant_memberships tm
    where tm.tenant_id = tenant_capabilities.tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  )
);

create policy "dashboard entitlements readable by project access"
on published_dashboard_entitlements for select
to authenticated
using (has_project_access(project_id) or has_tenant_access(tenant_id));

create policy "dashboard entitlements writable by project editors"
on published_dashboard_entitlements for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
  and exists (
    select 1
    from published_dashboards pd
    where pd.id = published_dashboard_entitlements.dashboard_id
      and pd.tenant_id = published_dashboard_entitlements.tenant_id
      and pd.project_id = published_dashboard_entitlements.project_id
  )
);

create policy "dataset entitlements readable by project access"
on semantic_dataset_entitlements for select
to authenticated
using (has_project_access(project_id) or has_tenant_access(tenant_id));

create policy "dataset entitlements writable by project editors"
on semantic_dataset_entitlements for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
  and exists (
    select 1
    from semantic_datasets sd
    where sd.id = semantic_dataset_entitlements.dataset_id
      and sd.tenant_id = semantic_dataset_entitlements.tenant_id
      and sd.project_id = semantic_dataset_entitlements.project_id
  )
);

insert into tenant_capabilities (tenant_id, capability, enabled)
select tenants.id, capability, true
from tenants
cross join (
  values ('ai_chat'), ('client_runtime'), ('dataset_preview'), ('report_exports')
) as defaults(capability)
where tenants.status = 'active'
on conflict (tenant_id, capability) do nothing;

insert into published_dashboard_entitlements (
  tenant_id,
  project_id,
  dashboard_id,
  principal_type,
  can_view,
  can_export
)
select
  tenant_id,
  project_id,
  id,
  'tenant',
  true,
  true
from published_dashboards
where status = 'published'
and not exists (
  select 1
  from published_dashboard_entitlements pde
  where pde.dashboard_id = published_dashboards.id
    and pde.principal_type = 'tenant'
    and pde.principal_id is null
    and pde.role is null
);

insert into semantic_dataset_entitlements (
  tenant_id,
  project_id,
  dataset_id,
  principal_type,
  can_preview
)
select
  tenant_id,
  project_id,
  id,
  'tenant',
  true
from semantic_datasets
where status = 'published'
and not exists (
  select 1
  from semantic_dataset_entitlements sde
  where sde.dataset_id = semantic_datasets.id
    and sde.principal_type = 'tenant'
    and sde.principal_id is null
    and sde.role is null
);
