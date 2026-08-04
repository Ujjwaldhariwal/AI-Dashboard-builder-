-- Repair drifted chart runtime tables so the live schema matches the current
-- DashboardOS chart config API contract.

alter table dashboard_chart_configs
  add column if not exists template_id text,
  add column if not exists presentation jsonb not null default '{
    "size": "standard",
    "showLegend": true,
    "showLabels": false,
    "valueFormat": null
  }'::jsonb,
  add column if not exists layout jsonb not null default '{"order":0,"gridSpan":1}'::jsonb,
  add column if not exists last_validated_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dashboard_chart_configs'
      and column_name = 'chart_type'
  ) then
    update dashboard_chart_configs
    set template_id = coalesce(template_id, nullif(chart_type, ''), 'bar')
    where template_id is null;

    alter table dashboard_chart_configs
      alter column chart_type drop not null;
  else
    update dashboard_chart_configs
    set template_id = coalesce(template_id, 'bar')
    where template_id is null;
  end if;
end $$;

alter table dashboard_chart_configs
  alter column template_id set not null,
  alter column validation_state set default 'unknown';

update dashboard_chart_configs
set validation_state = 'unknown'
where validation_state = 'pending';

alter table dashboard_chart_configs
  drop constraint if exists dashboard_chart_configs_validation_state_check;

alter table dashboard_chart_configs
  add constraint dashboard_chart_configs_validation_state_check
  check (validation_state in ('unknown', 'valid', 'warning', 'invalid'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dashboard_chart_configs_template_id_check'
  ) then
    alter table dashboard_chart_configs
      add constraint dashboard_chart_configs_template_id_check
      check (
        template_id in (
          'bar',
          'horizontal-bar',
          'grouped-bar',
          'horizontal-stacked-bar',
          'line',
          'trend-composed',
          'pie',
          'gauge',
          'ring-gauge',
          'kpi-card',
          'kpi-grid',
          'drilldown-bar',
          'table-grid'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'dashboard_chart_configs_project_id_name_key'
  ) then
    alter table dashboard_chart_configs
      add constraint dashboard_chart_configs_project_id_name_key
      unique (project_id, name);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dashboard_chart_validation_results'
      and column_name = 'chart_config_id'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dashboard_chart_validation_results'
      and column_name = 'chart_id'
  ) then
    alter table dashboard_chart_validation_results
      rename column chart_config_id to chart_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dashboard_chart_validation_results'
      and column_name = 'validation_state'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dashboard_chart_validation_results'
      and column_name = 'state'
  ) then
    alter table dashboard_chart_validation_results
      rename column validation_state to state;
  end if;
end $$;

alter table dashboard_chart_validation_results
  drop constraint if exists dashboard_chart_validation_results_validation_state_check,
  drop constraint if exists dashboard_chart_validation_results_state_check;

alter table dashboard_chart_validation_results
  add constraint dashboard_chart_validation_results_state_check
  check (state in ('valid', 'warning', 'invalid'));

create index if not exists idx_dashboard_chart_configs_tenant_project
on dashboard_chart_configs (tenant_id, project_id);

create index if not exists idx_dashboard_chart_configs_status
on dashboard_chart_configs (status);

create index if not exists idx_dashboard_chart_validation_results_chart
on dashboard_chart_validation_results (chart_id, checked_at desc);
;
