alter table project_autopilot_runs
  drop constraint if exists project_autopilot_runs_current_step_check;

alter table project_autopilot_runs
  add constraint project_autopilot_runs_current_step_check
  check (current_step in (
    'schema_scope', 'semantic_model', 'dataset', 'charts', 'dashboard', 'publish_review'
  ));

alter table project_autopilot_steps
  drop constraint if exists project_autopilot_steps_step_key_check;

alter table project_autopilot_steps
  add constraint project_autopilot_steps_step_key_check
  check (step_key in (
    'schema_scope', 'semantic_model', 'dataset', 'charts', 'dashboard', 'publish_review'
  ));

create or replace function compose_project_autopilot_dashboard_draft(
  p_run_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_dashboard_name text,
  p_dashboard_description text,
  p_slots jsonb
)
returns table (
  dashboard_id uuid,
  version_id uuid,
  page_id uuid,
  chart_count integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_run project_autopilot_runs%rowtype;
  v_dashboard published_dashboards%rowtype;
  v_version dashboard_versions%rowtype;
  v_page dashboard_pages%rowtype;
  v_item jsonb;
  v_slug text;
  v_slot_count integer;
  v_unique_chart_count integer;
  v_valid_chart_count integer;
  v_existing_slot_count integer;
  v_dataset_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not can_publish_project(p_project_id) or not has_tenant_access(p_tenant_id) then
    raise exception 'Editor access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_slots) <> 'array' then
    raise exception 'Dashboard slots must be an array' using errcode = '22023';
  end if;
  v_slot_count := jsonb_array_length(p_slots);
  if v_slot_count < 1 or v_slot_count > 12 then
    raise exception 'Dashboard draft requires between 1 and 12 chart slots' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_dashboard_name, ''))) < 2 then
    raise exception 'Dashboard name is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text, 0));
  select * into v_run
  from project_autopilot_runs par
  where par.id = p_run_id
    and par.tenant_id = p_tenant_id
    and par.project_id = p_project_id
  for update;
  if not found then
    raise exception 'Autopilot run not found in project' using errcode = '23503';
  end if;
  if v_run.actor_user_id <> auth.uid() and not is_platform_admin() then
    raise exception 'Autopilot run belongs to another actor' using errcode = '42501';
  end if;
  if nullif(v_run.artifacts ->> 'datasetId', '') is null then
    raise exception 'Autopilot run has no governed dataset artifact' using errcode = '23514';
  end if;
  v_dataset_id := (v_run.artifacts ->> 'datasetId')::uuid;

  for v_item in select value from jsonb_array_elements(p_slots)
  loop
    if nullif(trim(v_item ->> 'chartConfigId'), '') is null
      or nullif(trim(v_item ->> 'slotKey'), '') is null then
      raise exception 'Every dashboard slot requires a chartConfigId and slotKey' using errcode = '22023';
    end if;
    if (v_item ->> 'rowIndex')::integer < 0
      or (v_item ->> 'columnIndex')::integer < 0
      or (v_item ->> 'columnIndex')::integer > 11
      or (v_item ->> 'width')::integer < 1
      or (v_item ->> 'width')::integer > 12
      or (v_item ->> 'columnIndex')::integer + (v_item ->> 'width')::integer > 12
      or (v_item ->> 'height')::integer < 1
      or (v_item ->> 'height')::integer > 24 then
      raise exception 'Dashboard slot geometry is outside the 12-column grid' using errcode = '22023';
    end if;
  end loop;

  select count(distinct value ->> 'chartConfigId') into v_unique_chart_count
  from jsonb_array_elements(p_slots);
  if v_unique_chart_count <> v_slot_count then
    raise exception 'Dashboard chart slots must be unique' using errcode = '23514';
  end if;

  select count(*) into v_valid_chart_count
  from dashboard_chart_configs dcc
  where dcc.tenant_id = p_tenant_id
    and dcc.project_id = p_project_id
    and dcc.dataset_id = v_dataset_id
    and dcc.validation_state = 'valid'
    and dcc.status in ('draft', 'published')
    and dcc.id in (
      select (value ->> 'chartConfigId')::uuid from jsonb_array_elements(p_slots)
    );
  if v_valid_chart_count <> v_slot_count then
    raise exception 'Every dashboard slot must reference a valid chart from the Autopilot dataset' using errcode = '23514';
  end if;

  update dashboard_chart_configs dcc
  set status = 'published',
      published_at = coalesce(dcc.published_at, v_now),
      updated_at = v_now
  where dcc.tenant_id = p_tenant_id
    and dcc.project_id = p_project_id
    and dcc.id in (
      select (value ->> 'chartConfigId')::uuid from jsonb_array_elements(p_slots)
    )
    and dcc.status = 'draft';

  v_slug := 'autopilot-' || replace(p_run_id::text, '-', '');
  select * into v_dashboard
  from published_dashboards pd
  where pd.project_id = p_project_id and pd.slug = v_slug;

  if found then
    select * into v_version
    from dashboard_versions dv
    where dv.dashboard_id = v_dashboard.id
      and dv.layout ->> 'autopilotRunId' = p_run_id::text
      and dv.status = 'draft'
    order by dv.version_number desc
    limit 1;
    if not found then
      raise exception 'Autopilot dashboard identity is already in use' using errcode = '23505';
    end if;
    select * into v_page
    from dashboard_pages dp
    where dp.version_id = v_version.id and dp.slug = 'overview';
    select count(*) into v_existing_slot_count
    from dashboard_chart_slots dcs
    where dcs.version_id = v_version.id;
    if v_page.id is null or v_existing_slot_count <> v_slot_count then
      raise exception 'Existing Autopilot dashboard draft is incomplete' using errcode = '23514';
    end if;
    return query select v_dashboard.id, v_version.id, v_page.id, v_existing_slot_count;
    return;
  end if;

  insert into published_dashboards (
    tenant_id, project_id, name, slug, description, status,
    created_by, updated_by, created_at, updated_at
  ) values (
    p_tenant_id, p_project_id, left(trim(p_dashboard_name), 120), v_slug,
    nullif(left(trim(coalesce(p_dashboard_description, '')), 500), ''), 'draft',
    auth.uid(), auth.uid(), v_now, v_now
  ) returning * into v_dashboard;

  insert into dashboard_versions (
    dashboard_id, tenant_id, project_id, version_number, status,
    release_snapshot_status, release_snapshot_created_at,
    title, notes, layout, created_by, created_at
  ) values (
    v_dashboard.id, p_tenant_id, p_project_id, 1, 'draft',
    'pending', null,
    left(trim(p_dashboard_name), 120) || ' draft',
    'Generated by governed project Autopilot. Review layout and readiness before publishing.',
    jsonb_build_object(
      'mode', 'responsive-grid',
      'columns', 12,
      'autopilotRunId', p_run_id,
      'source', 'dashboardos.project-autopilot.v1'
    ),
    auth.uid(), v_now
  ) returning * into v_version;

  insert into dashboard_pages (
    version_id, dashboard_id, tenant_id, project_id,
    title, slug, sort_order, layout, created_at
  ) values (
    v_version.id, v_dashboard.id, p_tenant_id, p_project_id,
    'Overview', 'overview', 0, jsonb_build_object('columns', 12), v_now
  ) returning * into v_page;

  for v_item in select value from jsonb_array_elements(p_slots)
  loop
    insert into dashboard_chart_slots (
      page_id, version_id, dashboard_id, tenant_id, project_id,
      chart_config_id, title, slot_key, row_index, column_index,
      width, height, settings, created_at
    ) values (
      v_page.id, v_version.id, v_dashboard.id, p_tenant_id, p_project_id,
      (v_item ->> 'chartConfigId')::uuid,
      nullif(left(trim(coalesce(v_item ->> 'title', '')), 120), ''),
      left(trim(v_item ->> 'slotKey'), 80),
      (v_item ->> 'rowIndex')::integer,
      (v_item ->> 'columnIndex')::integer,
      (v_item ->> 'width')::integer,
      (v_item ->> 'height')::integer,
      coalesce(v_item -> 'settings', '{}'::jsonb),
      v_now
    );
  end loop;

  insert into dashboard_publish_events (
    dashboard_id, version_id, tenant_id, project_id, actor_user_id,
    event_type, notes, metadata, created_at
  ) values
    (
      v_dashboard.id, null, p_tenant_id, p_project_id, auth.uid(),
      'created', 'Created by governed project Autopilot.',
      jsonb_build_object('autopilotRunId', p_run_id), v_now
    ),
    (
      v_dashboard.id, v_version.id, p_tenant_id, p_project_id, auth.uid(),
      'version_created', 'Responsive dashboard draft composed by Autopilot.',
      jsonb_build_object('autopilotRunId', p_run_id, 'slotCount', v_slot_count), v_now
    );

  insert into audit_logs (
    tenant_id, project_id, actor_user_id, action, target_type, target_id, metadata, created_at
  ) values (
    p_tenant_id, p_project_id, auth.uid(), 'project_autopilot.dashboard_composed',
    'dashboard_version', v_version.id,
    jsonb_build_object('runId', p_run_id, 'dashboardId', v_dashboard.id, 'slotCount', v_slot_count),
    v_now
  );

  return query select v_dashboard.id, v_version.id, v_page.id, v_slot_count;
end;
$$;

revoke all on function compose_project_autopilot_dashboard_draft(uuid, uuid, uuid, text, text, jsonb) from public;
grant execute on function compose_project_autopilot_dashboard_draft(uuid, uuid, uuid, text, text, jsonb) to authenticated, service_role;

comment on function compose_project_autopilot_dashboard_draft(uuid, uuid, uuid, text, text, jsonb) is
  'Atomically promotes validated Autopilot charts and composes an idempotent editable dashboard draft without publishing a client release.';
