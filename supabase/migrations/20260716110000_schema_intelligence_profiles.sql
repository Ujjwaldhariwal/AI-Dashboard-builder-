create unique index if not exists idx_data_sources_scoped_identity
on data_sources (id, tenant_id, project_id);

create table if not exists data_source_schema_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  data_source_id uuid not null references data_sources(id) on delete cascade,
  schema_hash text not null,
  profile_version int not null check (profile_version > 0),
  selected_schemas text[] not null default array['public']::text[],
  table_profiles jsonb not null default '[]'::jsonb check (jsonb_typeof(table_profiles) = 'array'),
  column_profiles jsonb not null default '[]'::jsonb check (jsonb_typeof(column_profiles) = 'array'),
  join_candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(join_candidates) = 'array'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (data_source_id, schema_hash, profile_version),
  constraint data_source_schema_profiles_project_scope
    foreign key (data_source_id, tenant_id, project_id)
    references data_sources(id, tenant_id, project_id)
    on delete cascade
);

create index if not exists idx_schema_profiles_project_generated
on data_source_schema_profiles (tenant_id, project_id, generated_at desc);

create index if not exists idx_schema_profiles_source_generated
on data_source_schema_profiles (data_source_id, generated_at desc);

alter table data_source_schema_profiles enable row level security;

grant select, insert, update on data_source_schema_profiles to authenticated;
grant all on data_source_schema_profiles to service_role;

drop policy if exists "schema profiles readable by project access" on data_source_schema_profiles;
drop policy if exists "schema profiles creatable by project editors" on data_source_schema_profiles;
drop policy if exists "schema profiles mutable by project editors" on data_source_schema_profiles;

create policy "schema profiles readable by project access"
on data_source_schema_profiles for select
to authenticated
using (
  has_project_access(project_id)
  and exists (
    select 1 from dashboard_projects project_row
    where project_row.id = data_source_schema_profiles.project_id
      and project_row.tenant_id = data_source_schema_profiles.tenant_id
  )
);

create policy "schema profiles creatable by project editors"
on data_source_schema_profiles for insert
to authenticated
with check (
  can_publish_project(project_id)
  and exists (
    select 1 from data_sources source_row
    where source_row.id = data_source_schema_profiles.data_source_id
      and source_row.project_id = data_source_schema_profiles.project_id
      and source_row.tenant_id = data_source_schema_profiles.tenant_id
  )
);

create policy "schema profiles mutable by project editors"
on data_source_schema_profiles for update
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and exists (
    select 1 from data_sources source_row
    where source_row.id = data_source_schema_profiles.data_source_id
      and source_row.project_id = data_source_schema_profiles.project_id
      and source_row.tenant_id = data_source_schema_profiles.tenant_id
  )
);

create or replace function set_schema_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists data_source_schema_profiles_set_updated_at on data_source_schema_profiles;
create trigger data_source_schema_profiles_set_updated_at
before update on data_source_schema_profiles
for each row execute function set_schema_profile_updated_at();

revoke all on function set_schema_profile_updated_at() from public, anon;

comment on table data_source_schema_profiles
is 'Versioned, schema-hash keyed intelligence profiles. Only bounded statistics and masked examples are stored; raw sampled rows are never persisted.';
