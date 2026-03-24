create extension if not exists pgcrypto;

create table if not exists chart_groups (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  user_id uuid not null references auth.users,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chart_subgroups (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  group_id uuid not null references chart_groups(id) on delete cascade,
  user_id uuid not null references auth.users,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table widgets
  add column if not exists group_id uuid references chart_groups(id) on delete set null;

alter table widgets
  add column if not exists subgroup_id uuid references chart_subgroups(id) on delete set null;

alter table widgets
  add column if not exists section_name text;

create index if not exists idx_chart_groups_user_id on chart_groups (user_id);
create index if not exists idx_chart_groups_dashboard_id on chart_groups (dashboard_id);
create index if not exists idx_chart_subgroups_user_id on chart_subgroups (user_id);
create index if not exists idx_chart_subgroups_dashboard_id on chart_subgroups (dashboard_id);
create index if not exists idx_chart_subgroups_group_id on chart_subgroups (group_id);
create index if not exists idx_widgets_group_id on widgets (group_id);
create index if not exists idx_widgets_subgroup_id on widgets (subgroup_id);

alter table chart_groups enable row level security;
alter table chart_subgroups enable row level security;

drop policy if exists "own data" on chart_groups;
drop policy if exists "own data" on chart_subgroups;

create policy "own data" on chart_groups
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own data" on chart_subgroups
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

