create extension if not exists pgcrypto;

create table if not exists endpoint_profile_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  endpoint_name text,
  endpoint_url text,
  run_status text not null check (run_status in ('healthy', 'empty', 'unauthorized', 'http-error', 'network-error')),
  status_code int,
  latency_ms int,
  row_count int,
  error_class text,
  likely_reason text,
  shape_signature text,
  field_stats jsonb not null default '[]'::jsonb,
  candidate_mapping jsonb,
  confidence int not null default 0,
  confidence_band text not null default 'low' check (confidence_band in ('high', 'review', 'low')),
  pattern_class text not null default 'table-fallback',
  drift_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists endpoint_profiles (
  endpoint_id uuid primary key references endpoints(id) on delete cascade,
  user_id uuid not null references auth.users,
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  endpoint_name text,
  endpoint_url text,
  last_run_status text not null default 'empty' check (last_run_status in ('healthy', 'empty', 'unauthorized', 'http-error', 'network-error')),
  last_status_code int,
  last_latency_ms int,
  last_row_count int,
  last_error_class text,
  last_likely_reason text,
  shape_signature text,
  field_stats jsonb not null default '[]'::jsonb,
  best_mapping jsonb,
  confidence int not null default 0,
  confidence_band text not null default 'low' check (confidence_band in ('high', 'review', 'low')),
  pattern_class text not null default 'table-fallback',
  drift_flags jsonb not null default '{}'::jsonb,
  consecutive_unauthorized_count int not null default 0,
  consecutive_empty_count int not null default 0,
  total_runs int not null default 0,
  successful_runs int not null default 0,
  last_profiled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists endpoint_mapping_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  endpoint_id uuid not null references endpoints(id) on delete cascade,
  widget_id uuid references widgets(id) on delete set null,
  source_action text not null check (source_action in ('create_widget', 'edit_widget', 'review_override', 'review_accept')),
  accepted_mapping jsonb not null,
  previous_mapping jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_endpoint_profile_runs_user_dashboard_endpoint
  on endpoint_profile_runs (user_id, dashboard_id, endpoint_id);

create index if not exists idx_endpoint_profiles_user_dashboard_endpoint
  on endpoint_profiles (user_id, dashboard_id, endpoint_id);

create index if not exists idx_endpoint_mapping_feedback_user_dashboard_endpoint
  on endpoint_mapping_feedback (user_id, dashboard_id, endpoint_id);

alter table endpoint_profile_runs enable row level security;
alter table endpoint_profiles enable row level security;
alter table endpoint_mapping_feedback enable row level security;

drop policy if exists "own data" on endpoint_profile_runs;
drop policy if exists "own data" on endpoint_profiles;
drop policy if exists "own data" on endpoint_mapping_feedback;

create policy "own data" on endpoint_profile_runs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own data" on endpoint_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own data" on endpoint_mapping_feedback
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);