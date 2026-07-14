create table if not exists business_models (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'archived')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (project_id, name, version)
);

create table if not exists business_entities (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references business_models(id) on delete cascade,
  name text not null,
  semantic_key text not null,
  type text not null default 'dimension' check (type in ('fact', 'dimension', 'event', 'snapshot')),
  description text,
  source_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, semantic_key)
);

create table if not exists business_fields (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references business_entities(id) on delete cascade,
  name text not null,
  semantic_key text not null,
  role text not null default 'attribute'
    check (role in ('identifier', 'dimension', 'metric_source', 'date', 'attribute', 'hidden')),
  source_column jsonb not null default '{}'::jsonb,
  is_filterable boolean not null default false,
  is_tooltip_field boolean not null default false,
  display_format text,
  default_aggregation text
    check (
      default_aggregation is null
      or default_aggregation in ('sum', 'avg', 'min', 'max', 'count', 'count_distinct', 'ratio', 'custom')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, semantic_key)
);

create table if not exists business_metrics (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references business_models(id) on delete cascade,
  entity_id uuid references business_entities(id) on delete set null,
  name text not null,
  semantic_key text not null,
  aggregation text not null default 'sum'
    check (aggregation in ('sum', 'avg', 'min', 'max', 'count', 'count_distinct', 'ratio', 'custom')),
  expression jsonb not null default '{}'::jsonb,
  unit text,
  display_format text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, semantic_key)
);

create table if not exists business_relationships (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references business_models(id) on delete cascade,
  from_entity_id uuid not null references business_entities(id) on delete cascade,
  to_entity_id uuid not null references business_entities(id) on delete cascade,
  type text not null default 'many_to_one'
    check (type in ('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many')),
  join_config jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table dashboard_projects add column if not exists active_business_model_id uuid references business_models(id) on delete set null;

create index if not exists idx_business_models_tenant_project on business_models (tenant_id, project_id);
create index if not exists idx_business_models_status on business_models (status);
create index if not exists idx_business_entities_model_id on business_entities (model_id);
create index if not exists idx_business_fields_entity_id on business_fields (entity_id);
create index if not exists idx_business_fields_role on business_fields (role);
create index if not exists idx_business_metrics_model_id on business_metrics (model_id);
create index if not exists idx_business_relationships_model_id on business_relationships (model_id);

alter table business_models enable row level security;
alter table business_entities enable row level security;
alter table business_fields enable row level security;
alter table business_metrics enable row level security;
alter table business_relationships enable row level security;

drop policy if exists "business models readable by project access" on business_models;
drop policy if exists "business models writable by project editors" on business_models;
drop policy if exists "business entities readable by model access" on business_entities;
drop policy if exists "business entities writable by model editors" on business_entities;
drop policy if exists "business fields readable by model access" on business_fields;
drop policy if exists "business fields writable by model editors" on business_fields;
drop policy if exists "business metrics readable by model access" on business_metrics;
drop policy if exists "business metrics writable by model editors" on business_metrics;
drop policy if exists "business relationships readable by model access" on business_relationships;
drop policy if exists "business relationships writable by model editors" on business_relationships;

create policy "business models readable by project access"
on business_models for select
to authenticated
using (has_project_access(project_id) or has_tenant_access(tenant_id));

create policy "business models writable by project editors"
on business_models for all
to authenticated
using (can_publish_project(project_id))
with check (can_publish_project(project_id) and has_tenant_access(tenant_id));

create policy "business entities readable by model access"
on business_entities for select
to authenticated
using (
  exists (
    select 1
    from business_models bm
    where bm.id = business_entities.model_id
      and (has_project_access(bm.project_id) or has_tenant_access(bm.tenant_id))
  )
);

create policy "business entities writable by model editors"
on business_entities for all
to authenticated
using (
  exists (
    select 1
    from business_models bm
    where bm.id = business_entities.model_id
      and can_publish_project(bm.project_id)
  )
)
with check (
  exists (
    select 1
    from business_models bm
    where bm.id = business_entities.model_id
      and can_publish_project(bm.project_id)
  )
);

create policy "business fields readable by model access"
on business_fields for select
to authenticated
using (
  exists (
    select 1
    from business_entities be
    join business_models bm on bm.id = be.model_id
    where be.id = business_fields.entity_id
      and (has_project_access(bm.project_id) or has_tenant_access(bm.tenant_id))
  )
);

create policy "business fields writable by model editors"
on business_fields for all
to authenticated
using (
  exists (
    select 1
    from business_entities be
    join business_models bm on bm.id = be.model_id
    where be.id = business_fields.entity_id
      and can_publish_project(bm.project_id)
  )
)
with check (
  exists (
    select 1
    from business_entities be
    join business_models bm on bm.id = be.model_id
    where be.id = business_fields.entity_id
      and can_publish_project(bm.project_id)
  )
);

create policy "business metrics readable by model access"
on business_metrics for select
to authenticated
using (
  exists (
    select 1
    from business_models bm
    where bm.id = business_metrics.model_id
      and (has_project_access(bm.project_id) or has_tenant_access(bm.tenant_id))
  )
);

create policy "business metrics writable by model editors"
on business_metrics for all
to authenticated
using (
  exists (
    select 1
    from business_models bm
    where bm.id = business_metrics.model_id
      and can_publish_project(bm.project_id)
  )
)
with check (
  exists (
    select 1
    from business_models bm
    where bm.id = business_metrics.model_id
      and can_publish_project(bm.project_id)
  )
);

create policy "business relationships readable by model access"
on business_relationships for select
to authenticated
using (
  exists (
    select 1
    from business_models bm
    where bm.id = business_relationships.model_id
      and (has_project_access(bm.project_id) or has_tenant_access(bm.tenant_id))
  )
);

create policy "business relationships writable by model editors"
on business_relationships for all
to authenticated
using (
  exists (
    select 1
    from business_models bm
    where bm.id = business_relationships.model_id
      and can_publish_project(bm.project_id)
  )
)
with check (
  exists (
    select 1
    from business_models bm
    where bm.id = business_relationships.model_id
      and can_publish_project(bm.project_id)
  )
);
