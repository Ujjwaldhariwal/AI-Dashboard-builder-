-- Repair runtime query-execution schema drift.
--
-- The published client dashboard runtime reads query_budget_policies and writes
-- semantic_query_runs after chart execution. A drifted live database still had
-- older shapes for both tables.

alter table query_budget_policies
  add column if not exists data_source_id uuid references data_sources(id) on delete cascade,
  add column if not exists name text,
  add column if not exists enabled boolean not null default true,
  add column if not exists period text not null default 'daily',
  add column if not exists max_queries integer not null default 100000,
  add column if not exists max_elapsed_ms integer,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update query_budget_policies
set
  name = coalesce(name, initcap(coalesce(nullif(scope, ''), 'tenant')) || ' query budget'),
  period = coalesce(nullif(period, ''), 'daily'),
  max_queries = coalesce(nullif(max_queries, 0), 100000),
  max_elapsed_ms = coalesce(max_elapsed_ms, timeout_ms)
where name is null
  or period is null
  or max_queries is null
  or max_queries <= 0
  or (max_elapsed_ms is null and timeout_ms is not null);

alter table query_budget_policies
  alter column name set not null,
  alter column max_rows drop not null,
  alter column scope drop not null;

alter table query_budget_policies
  drop constraint if exists query_budget_policies_period_check,
  drop constraint if exists query_budget_policies_max_queries_check,
  drop constraint if exists query_budget_policies_max_rows_check,
  drop constraint if exists query_budget_policies_max_elapsed_ms_check;

alter table query_budget_policies
  add constraint query_budget_policies_period_check
  check (period in ('daily', 'monthly')),
  add constraint query_budget_policies_max_queries_check
  check (max_queries > 0),
  add constraint query_budget_policies_max_rows_check
  check (max_rows is null or max_rows > 0),
  add constraint query_budget_policies_max_elapsed_ms_check
  check (max_elapsed_ms is null or max_elapsed_ms > 0);

create index if not exists idx_query_budget_policies_scope
on query_budget_policies (tenant_id, project_id, data_source_id, enabled);

grant select, insert, update on query_budget_policies to authenticated;

alter table semantic_query_runs
  add column if not exists chart_id uuid references dashboard_chart_configs(id) on delete set null,
  add column if not exists data_source_id uuid references data_sources(id) on delete set null,
  add column if not exists surface text,
  add column if not exists timeout_ms integer,
  add column if not exists warnings jsonb not null default '[]'::jsonb;

update semantic_query_runs
set
  chart_id = coalesce(chart_id, chart_config_id),
  surface = coalesce(nullif(surface, ''), 'admin_preview')
where chart_id is null
  or surface is null;

alter table semantic_query_runs
  alter column surface set not null;

alter table semantic_query_runs
  drop constraint if exists semantic_query_runs_surface_check,
  drop constraint if exists semantic_query_runs_status_check;

alter table semantic_query_runs
  add constraint semantic_query_runs_surface_check
  check (surface in ('admin_preview', 'client_dataset', 'client_chart', 'cache_warm')),
  add constraint semantic_query_runs_status_check
  check (status in ('success', 'error', 'running', 'succeeded', 'failed', 'blocked'));

create index if not exists idx_semantic_query_runs_tenant_project
on semantic_query_runs (tenant_id, project_id, created_at desc);

create index if not exists idx_semantic_query_runs_dataset
on semantic_query_runs (dataset_id, created_at desc);

create index if not exists idx_semantic_query_runs_chart
on semantic_query_runs (chart_id, created_at desc);

create index if not exists idx_semantic_query_runs_data_source
on semantic_query_runs (data_source_id, created_at desc);;
