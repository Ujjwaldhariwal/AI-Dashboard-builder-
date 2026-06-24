create table if not exists data_source_columns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  data_source_id uuid not null references data_sources(id) on delete cascade,
  schema_name text not null,
  table_name text not null,
  column_name text not null,
  ordinal_position int not null,
  data_type text not null,
  udt_name text not null,
  is_nullable boolean not null default false,
  column_default text,
  created_at timestamptz not null default now(),
  unique (data_source_id, schema_name, table_name, column_name)
);

create index if not exists idx_data_source_columns_source on data_source_columns (data_source_id);
create index if not exists idx_data_source_columns_tenant_project on data_source_columns (tenant_id, project_id);
create index if not exists idx_data_source_columns_table on data_source_columns (data_source_id, schema_name, table_name);

alter table data_source_columns enable row level security;

drop policy if exists "data source columns readable by project access" on data_source_columns;
drop policy if exists "data source columns writable by project editors" on data_source_columns;

create policy "data source columns readable by project access"
on data_source_columns for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "data source columns writable by project editors"
on data_source_columns for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
);
