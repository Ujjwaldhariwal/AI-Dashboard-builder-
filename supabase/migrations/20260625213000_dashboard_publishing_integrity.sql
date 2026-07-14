do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'published_dashboards_id_tenant_project_key'
  ) then
    alter table published_dashboards
    add constraint published_dashboards_id_tenant_project_key
    unique (id, tenant_id, project_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_versions_id_dashboard_tenant_project_key'
  ) then
    alter table dashboard_versions
    add constraint dashboard_versions_id_dashboard_tenant_project_key
    unique (id, dashboard_id, tenant_id, project_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_pages_id_version_dashboard_tenant_project_key'
  ) then
    alter table dashboard_pages
    add constraint dashboard_pages_id_version_dashboard_tenant_project_key
    unique (id, version_id, dashboard_id, tenant_id, project_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_chart_configs_id_tenant_project_key'
  ) then
    alter table dashboard_chart_configs
    add constraint dashboard_chart_configs_id_tenant_project_key
    unique (id, tenant_id, project_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_versions_dashboard_scope_fk'
  ) then
    alter table dashboard_versions
    add constraint dashboard_versions_dashboard_scope_fk
    foreign key (dashboard_id, tenant_id, project_id)
    references published_dashboards (id, tenant_id, project_id)
    on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'published_dashboards_current_version_scope_fk'
  ) then
    alter table published_dashboards
    add constraint published_dashboards_current_version_scope_fk
    foreign key (current_version_id, id, tenant_id, project_id)
    references dashboard_versions (id, dashboard_id, tenant_id, project_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_pages_version_scope_fk'
  ) then
    alter table dashboard_pages
    add constraint dashboard_pages_version_scope_fk
    foreign key (version_id, dashboard_id, tenant_id, project_id)
    references dashboard_versions (id, dashboard_id, tenant_id, project_id)
    on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_chart_slots_page_scope_fk'
  ) then
    alter table dashboard_chart_slots
    add constraint dashboard_chart_slots_page_scope_fk
    foreign key (page_id, version_id, dashboard_id, tenant_id, project_id)
    references dashboard_pages (id, version_id, dashboard_id, tenant_id, project_id)
    on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_chart_slots_chart_scope_fk'
  ) then
    alter table dashboard_chart_slots
    add constraint dashboard_chart_slots_chart_scope_fk
    foreign key (chart_config_id, tenant_id, project_id)
    references dashboard_chart_configs (id, tenant_id, project_id)
    on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_publish_events_dashboard_scope_fk'
  ) then
    alter table dashboard_publish_events
    add constraint dashboard_publish_events_dashboard_scope_fk
    foreign key (dashboard_id, tenant_id, project_id)
    references published_dashboards (id, tenant_id, project_id)
    on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_publish_events_version_scope_fk'
  ) then
    alter table dashboard_publish_events
    add constraint dashboard_publish_events_version_scope_fk
    foreign key (version_id, dashboard_id, tenant_id, project_id)
    references dashboard_versions (id, dashboard_id, tenant_id, project_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_health_runs_dashboard_scope_fk'
  ) then
    alter table dashboard_health_runs
    add constraint dashboard_health_runs_dashboard_scope_fk
    foreign key (dashboard_id, tenant_id, project_id)
    references published_dashboards (id, tenant_id, project_id)
    on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_health_runs_version_scope_fk'
  ) then
    alter table dashboard_health_runs
    add constraint dashboard_health_runs_version_scope_fk
    foreign key (version_id, dashboard_id, tenant_id, project_id)
    references dashboard_versions (id, dashboard_id, tenant_id, project_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dashboard_health_runs_scope_required'
  ) then
    alter table dashboard_health_runs
    add constraint dashboard_health_runs_scope_required
    check (
      tenant_id is not null
      and project_id is not null
      and dashboard_id is not null
    )
    not valid;
  end if;
end $$;
