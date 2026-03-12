create extension if not exists pgcrypto;

create table if not exists dashboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table dashboards add column if not exists user_id uuid references auth.users;
alter table dashboards add column if not exists description text;
alter table dashboards add column if not exists created_at timestamptz default now();
alter table dashboards add column if not exists updated_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dashboards'
      and column_name = 'owner_id'
  ) then
    execute 'alter table dashboards alter column owner_id drop not null';
    execute 'update dashboards set user_id = owner_id where user_id is null and owner_id is not null';
  end if;
end $$;

create table if not exists endpoints (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid references dashboards on delete cascade,
  user_id uuid references auth.users,
  name text,
  url text,
  method text default 'GET',
  auth_type text,
  headers jsonb,
  body jsonb,
  refresh_interval int default 30,
  created_at timestamptz default now()
);

alter table endpoints add column if not exists dashboard_id uuid references dashboards on delete cascade;
alter table endpoints add column if not exists user_id uuid references auth.users;
alter table endpoints add column if not exists name text;
alter table endpoints add column if not exists url text;
alter table endpoints add column if not exists method text default 'GET';
alter table endpoints add column if not exists auth_type text;
alter table endpoints add column if not exists headers jsonb;
alter table endpoints add column if not exists body jsonb;
alter table endpoints add column if not exists refresh_interval int default 30;
alter table endpoints add column if not exists created_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'api_endpoints'
  ) then
    insert into endpoints (
      id,
      dashboard_id,
      user_id,
      name,
      url,
      method,
      auth_type,
      headers,
      body,
      refresh_interval,
      created_at
    )
    select
      ae.id,
      null,
      ae.owner_id,
      ae.name,
      ae.url,
      coalesce(ae.method, 'GET'),
      ae.auth_type,
      ae.headers,
      null,
      coalesce(ae.refresh_interval, 30),
      coalesce(ae.created_at, now())
    from api_endpoints ae
    on conflict (id) do nothing;
  end if;
end $$;

create table if not exists widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid references dashboards on delete cascade,
  endpoint_id uuid references endpoints on delete set null,
  user_id uuid references auth.users,
  title text,
  type text,
  data_mapping jsonb,
  style jsonb,
  position jsonb,
  size jsonb,
  created_at timestamptz default now()
);

alter table widgets add column if not exists dashboard_id uuid references dashboards on delete cascade;
alter table widgets add column if not exists endpoint_id uuid;
alter table widgets add column if not exists user_id uuid references auth.users;
alter table widgets add column if not exists title text;
alter table widgets add column if not exists type text;
alter table widgets add column if not exists data_mapping jsonb;
alter table widgets add column if not exists style jsonb;
alter table widgets add column if not exists size jsonb;
alter table widgets add column if not exists created_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'widgets'
      and column_name = 'owner_id'
  ) then
    execute 'alter table widgets alter column owner_id drop not null';
    execute 'update widgets set user_id = owner_id where user_id is null and owner_id is not null';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'widgets'
      and column_name = 'position'
      and udt_name <> 'jsonb'
  ) then
    execute $sql$
      alter table widgets
      alter column position drop default,
      alter column position type jsonb
      using case
        when position is null then null
        else jsonb_build_object('x', 0, 'y', position::int, 'w', 6, 'h', 4)
      end
    $sql$;
  end if;
end $$;

alter table widgets add column if not exists position jsonb;

update widgets
set style = '{}'::jsonb
where style is null;

update widgets
set position = coalesce(position, jsonb_build_object('x', 0, 'y', 0, 'w', 6, 'h', 4));

update widgets
set size = coalesce(size, position, jsonb_build_object('x', 0, 'y', 0, 'w', 6, 'h', 4));

alter table widgets drop constraint if exists widgets_endpoint_id_fkey;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'widgets_endpoint_id_fkey'
      and conrelid = 'public.widgets'::regclass
  ) then
    execute 'alter table widgets add constraint widgets_endpoint_id_fkey foreign key (endpoint_id) references endpoints(id) on delete set null';
  end if;
end $$;

create index if not exists idx_dashboards_user_id on dashboards (user_id);
create index if not exists idx_endpoints_user_id on endpoints (user_id);
create index if not exists idx_widgets_user_id on widgets (user_id);

alter table dashboards enable row level security;
alter table endpoints enable row level security;
alter table widgets enable row level security;

drop policy if exists "own data" on dashboards;
drop policy if exists "own data" on endpoints;
drop policy if exists "own data" on widgets;

create policy "own data" on dashboards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data" on endpoints for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data" on widgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
