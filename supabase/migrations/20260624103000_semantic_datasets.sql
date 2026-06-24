create table if not exists semantic_datasets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  model_id uuid not null references business_models(id) on delete restrict,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  selection jsonb not null default '{"fieldIds":[],"metricIds":[],"relationshipIds":[]}'::jsonb,
  cache_policy jsonb not null default '{"ttlSeconds":300}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists idx_semantic_datasets_tenant_project on semantic_datasets (tenant_id, project_id);
create index if not exists idx_semantic_datasets_model on semantic_datasets (model_id);
create index if not exists idx_semantic_datasets_status on semantic_datasets (status);

alter table semantic_datasets enable row level security;

grant select, insert, update, delete on semantic_datasets to authenticated;

drop policy if exists "semantic datasets readable by project access" on semantic_datasets;
drop policy if exists "semantic datasets writable by project editors" on semantic_datasets;

create policy "semantic datasets readable by project access"
on semantic_datasets for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "semantic datasets writable by project editors"
on semantic_datasets for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
);
