create or replace function create_dashboard_chart_drafts(
  p_tenant_id uuid,
  p_project_id uuid,
  p_dataset_id uuid,
  p_charts jsonb
)
returns setof dashboard_chart_configs
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_dataset semantic_datasets%rowtype;
  v_item jsonb;
  v_encoding jsonb;
  v_chart dashboard_chart_configs%rowtype;
  v_base_name text;
  v_name text;
  v_suffix integer;
  v_now timestamptz := now();
  v_field_ids jsonb;
  v_metric_ids jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not can_publish_project(p_project_id) or not has_tenant_access(p_tenant_id) then
    raise exception 'Editor access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_charts) <> 'array' or jsonb_array_length(p_charts) < 1 or jsonb_array_length(p_charts) > 12 then
    raise exception 'Chart suite must contain between 1 and 12 drafts' using errcode = '22023';
  end if;

  select * into v_dataset
  from semantic_datasets
  where id = p_dataset_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id
    and status = 'published';
  if not found then
    raise exception 'Published dataset not found in project' using errcode = '23503';
  end if;
  if not exists (
    select 1 from business_models
    where id = v_dataset.model_id
      and tenant_id = p_tenant_id
      and project_id = p_project_id
      and status = 'approved'
  ) then
    raise exception 'Dataset semantic model is not approved' using errcode = '23514';
  end if;

  v_field_ids := coalesce(v_dataset.selection -> 'fieldIds', '[]'::jsonb);
  v_metric_ids := coalesce(v_dataset.selection -> 'metricIds', '[]'::jsonb);
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text, 0));

  for v_item in select value from jsonb_array_elements(p_charts)
  loop
    v_encoding := coalesce(v_item -> 'encoding', '{}'::jsonb);
    if coalesce(v_item ->> 'templateId', '') not in (
      'bar', 'horizontal-bar', 'grouped-bar', 'horizontal-stacked-bar', 'line', 'trend-composed',
      'pie', 'gauge', 'ring-gauge', 'kpi-card', 'kpi-grid', 'drilldown-bar', 'table-grid'
    ) then
      raise exception 'Unsupported chart template' using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(v_encoding -> 'yMetricIds', '[]'::jsonb)) < 1 then
      raise exception 'Every chart requires at least one metric' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(coalesce(v_encoding -> 'yMetricIds', '[]'::jsonb)) as metric(metric_id)
      where not (v_metric_ids ? metric_id)
    ) then
      raise exception 'Chart metric is outside the governed dataset' using errcode = '23514';
    end if;
    if nullif(v_encoding ->> 'xAxisFieldId', '') is not null
      and not (v_field_ids ? (v_encoding ->> 'xAxisFieldId')) then
      raise exception 'Chart axis is outside the governed dataset' using errcode = '23514';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(coalesce(v_encoding -> 'tooltipFieldIds', '[]'::jsonb)) as tooltip(tooltip_id)
      where not (v_field_ids ? tooltip_id) and not (v_metric_ids ? tooltip_id)
    ) then
      raise exception 'Chart tooltip is outside the governed dataset' using errcode = '23514';
    end if;

    v_base_name := left(trim(coalesce(v_item ->> 'name', '')), 120);
    if length(v_base_name) < 2 then raise exception 'Chart name is required' using errcode = '22023'; end if;
    v_name := v_base_name;
    v_suffix := 2;
    while exists (select 1 from dashboard_chart_configs where project_id = p_project_id and lower(name) = lower(v_name)) loop
      v_name := left(v_base_name, 112) || ' (' || v_suffix::text || ')';
      v_suffix := v_suffix + 1;
    end loop;

    insert into dashboard_chart_configs (
      tenant_id, project_id, dataset_id, name, description, status, template_id, encoding,
      presentation, interactions, layout, validation_state, last_validated_at, created_at, updated_at
    ) values (
      p_tenant_id, p_project_id, p_dataset_id, v_name, nullif(trim(v_item ->> 'description'), ''), 'draft',
      v_item ->> 'templateId', v_encoding, coalesce(v_item -> 'presentation', '{}'::jsonb),
      '{}'::jsonb, coalesce(v_item -> 'layout', '{}'::jsonb), coalesce(v_item ->> 'validationState', 'valid'),
      v_now, v_now, v_now
    ) returning * into v_chart;

    insert into dashboard_chart_validation_results (
      chart_id, tenant_id, project_id, state, issues, checked_by, checked_at
    ) values (
      v_chart.id, p_tenant_id, p_project_id, v_chart.validation_state,
      coalesce(v_item -> 'validationIssues', '[]'::jsonb), auth.uid(), v_now
    );
    insert into audit_logs (
      tenant_id, project_id, actor_user_id, action, target_type, target_id, metadata, created_at
    ) values (
      p_tenant_id, p_project_id, auth.uid(), 'dashboard_chart.created', 'dashboard_chart_config', v_chart.id,
      jsonb_build_object('datasetId', p_dataset_id, 'templateId', v_chart.template_id, 'source', 'chart_suite_copilot'), v_now
    );
    return next v_chart;
  end loop;
end;
$$;

revoke all on function create_dashboard_chart_drafts(uuid, uuid, uuid, jsonb) from public;
grant execute on function create_dashboard_chart_drafts(uuid, uuid, uuid, jsonb) to authenticated, service_role;

comment on function create_dashboard_chart_drafts(uuid, uuid, uuid, jsonb) is
  'Atomically materializes a validated, editable chart suite from one governed dataset.';
