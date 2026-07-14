create table if not exists dashboard_chart_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  dataset_id uuid not null references semantic_datasets(id) on delete restrict,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  template_id text not null check (
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
  ),
  encoding jsonb not null default '{
    "yMetricIds": [],
    "tooltipFieldIds": [],
    "labelById": {},
    "colorById": {}
  }'::jsonb,
  presentation jsonb not null default '{
    "size": "standard",
    "showLegend": true,
    "showLabels": false,
    "valueFormat": null
  }'::jsonb,
  interactions jsonb not null default '{}'::jsonb,
  layout jsonb not null default '{"order":0,"gridSpan":1}'::jsonb,
  validation_state text not null default 'unknown' check (validation_state in ('unknown', 'valid', 'warning', 'invalid')),
  last_validated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists dashboard_chart_validation_results (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references dashboard_chart_configs(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  state text not null check (state in ('valid', 'warning', 'invalid')),
  issues jsonb not null default '[]'::jsonb,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz not null default now()
);

create index if not exists idx_dashboard_chart_configs_tenant_project
on dashboard_chart_configs (tenant_id, project_id);

create index if not exists idx_dashboard_chart_configs_dataset
on dashboard_chart_configs (dataset_id);

create index if not exists idx_dashboard_chart_configs_status
on dashboard_chart_configs (status);

create index if not exists idx_dashboard_chart_validation_results_chart
on dashboard_chart_validation_results (chart_id, checked_at desc);

create index if not exists idx_dashboard_chart_validation_results_project
on dashboard_chart_validation_results (tenant_id, project_id, checked_at desc);

alter table dashboard_chart_configs enable row level security;
alter table dashboard_chart_validation_results enable row level security;

grant select, insert, update, delete on dashboard_chart_configs to authenticated;
grant select, insert, update, delete on dashboard_chart_validation_results to authenticated;

drop policy if exists "dashboard chart configs readable by project access" on dashboard_chart_configs;
drop policy if exists "dashboard chart configs writable by project editors" on dashboard_chart_configs;
drop policy if exists "dashboard chart validations readable by project access" on dashboard_chart_validation_results;
drop policy if exists "dashboard chart validations writable by project editors" on dashboard_chart_validation_results;

create policy "dashboard chart configs readable by project access"
on dashboard_chart_configs for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "dashboard chart configs writable by project editors"
on dashboard_chart_configs for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
  and exists (
    select 1
    from semantic_datasets sd
    where sd.id = dashboard_chart_configs.dataset_id
      and sd.tenant_id = dashboard_chart_configs.tenant_id
      and sd.project_id = dashboard_chart_configs.project_id
  )
);

create policy "dashboard chart validations readable by project access"
on dashboard_chart_validation_results for select
to authenticated
using (
  has_project_access(project_id)
  or has_tenant_access(tenant_id)
);

create policy "dashboard chart validations writable by project editors"
on dashboard_chart_validation_results for all
to authenticated
using (can_publish_project(project_id))
with check (
  can_publish_project(project_id)
  and has_tenant_access(tenant_id)
  and exists (
    select 1
    from dashboard_chart_configs dcc
    where dcc.id = dashboard_chart_validation_results.chart_id
      and dcc.tenant_id = dashboard_chart_validation_results.tenant_id
      and dcc.project_id = dashboard_chart_validation_results.project_id
  )
);
