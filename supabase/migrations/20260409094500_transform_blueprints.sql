create extension if not exists pgcrypto;

create table if not exists transform_blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  dashboard_id uuid references dashboards(id) on delete cascade,
  endpoint_id uuid references endpoints(id) on delete cascade,
  endpoint_name text not null,
  prompt text,
  transforms jsonb not null,
  sample_data jsonb,
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transform_blueprints_transforms_is_array
    check (jsonb_typeof(transforms) = 'array')
);

create index if not exists idx_transform_blueprints_user_created
  on transform_blueprints (user_id, created_at desc);

create index if not exists idx_transform_blueprints_user_endpoint_created
  on transform_blueprints (user_id, endpoint_name, created_at desc);

alter table transform_blueprints enable row level security;

drop policy if exists "own data" on transform_blueprints;

create policy "own data" on transform_blueprints
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
