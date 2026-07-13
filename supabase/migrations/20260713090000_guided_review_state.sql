create table if not exists guided_schema_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  data_source_id uuid not null references data_sources(id) on delete cascade,
  schema_hash text,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (data_source_id, schema_hash)
);

create index if not exists idx_guided_schema_profiles_tenant_project
on guided_schema_profiles (tenant_id, project_id, updated_at desc);

create index if not exists idx_guided_schema_profiles_source
on guided_schema_profiles (data_source_id, updated_at desc);

alter table guided_schema_profiles enable row level security;

grant select, insert, update, delete on guided_schema_profiles to authenticated;

drop policy if exists "guided profiles readable by project access" on guided_schema_profiles;
drop policy if exists "guided profiles writable by project editors" on guided_schema_profiles;

create policy "guided profiles readable by project access"
on guided_schema_profiles for select
to authenticated
using (
  exists (
    select 1
    from dashboard_projects dp
    where dp.id = guided_schema_profiles.project_id
      and dp.tenant_id = guided_schema_profiles.tenant_id
      and (
        exists (
          select 1
          from tenant_memberships tm
          where tm.tenant_id = dp.tenant_id
            and tm.user_id = auth.uid()
        )
        or exists (
          select 1
          from project_assignments pa
          where pa.project_id = dp.id
            and pa.user_id = auth.uid()
        )
      )
  )
);

create policy "guided profiles writable by project editors"
on guided_schema_profiles for all
to authenticated
using (
  exists (
    select 1
    from dashboard_projects dp
    where dp.id = guided_schema_profiles.project_id
      and dp.tenant_id = guided_schema_profiles.tenant_id
      and (
        exists (
          select 1
          from tenant_memberships tm
          where tm.tenant_id = dp.tenant_id
            and tm.user_id = auth.uid()
            and tm.role in ('owner', 'admin')
        )
        or exists (
          select 1
          from project_assignments pa
          where pa.project_id = dp.id
            and pa.user_id = auth.uid()
            and pa.role in ('lead', 'editor')
        )
      )
  )
)
with check (
  exists (
    select 1
    from dashboard_projects dp
    where dp.id = guided_schema_profiles.project_id
      and dp.tenant_id = guided_schema_profiles.tenant_id
      and (
        exists (
          select 1
          from tenant_memberships tm
          where tm.tenant_id = dp.tenant_id
            and tm.user_id = auth.uid()
            and tm.role in ('owner', 'admin')
        )
        or exists (
          select 1
          from project_assignments pa
          where pa.project_id = dp.id
            and pa.user_id = auth.uid()
            and pa.role in ('lead', 'editor')
        )
      )
  )
);
