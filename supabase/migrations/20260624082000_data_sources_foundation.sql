create table if not exists data_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  name text not null,
  type text not null default 'postgres' check (type in ('postgres')),
  status text not null default 'draft' check (status in ('draft', 'active', 'error', 'disabled')),
  connection_config jsonb not null default '{}'::jsonb,
  credential_ciphertext text not null,
  credential_key_id text,
  last_tested_at timestamptz,
  last_test_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_data_sources_tenant_project on data_sources (tenant_id, project_id);
create index if not exists idx_data_sources_status on data_sources (status);

alter table data_sources enable row level security;

drop policy if exists "data sources readable by project access" on data_sources;
drop policy if exists "data sources writable by project editors" on data_sources;

create policy "data sources readable by project access"
on data_sources for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "data sources writable by project editors"
on data_sources for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
);
