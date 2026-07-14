alter table semantic_query_runs
  drop constraint if exists semantic_query_runs_surface_check;

alter table semantic_query_runs
  add constraint semantic_query_runs_surface_check
  check (surface in ('admin_preview', 'client_dataset', 'client_chart', 'cache_warm'));
