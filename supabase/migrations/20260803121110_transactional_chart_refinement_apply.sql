-- Keep the durable chart-refinement proposal payload and lifecycle server-owned.
-- The transaction RPC sets a transaction-local marker before changing lifecycle
-- columns; direct Data API updates to these proposals are rejected by the trigger.
create or replace function guard_chart_refinement_proposal_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.artifact_type = 'chart'
    and old.proposal ? 'chartId'
    and current_setting('dashboardos.chart_refinement_proposal_id', true) is distinct from old.id::text then
    raise exception 'Chart refinement proposals can only be finalized through the governed transaction'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_workflow_chart_proposal_guard on ai_workflow_proposals;
create trigger ai_workflow_chart_proposal_guard
before update on ai_workflow_proposals
for each row execute function guard_chart_refinement_proposal_update();

create or replace function finalize_chart_refinement_proposal(
  p_tenant_id uuid,
  p_project_id uuid,
  p_chart_id uuid,
  p_proposal_id uuid,
  p_base_updated_at timestamptz,
  p_action text,
  p_rejection_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_proposal ai_workflow_proposals%rowtype;
  v_run ai_workflow_runs%rowtype;
  v_chart dashboard_chart_configs%rowtype;
  v_original_chart dashboard_chart_configs%rowtype;
  v_next jsonb;
  v_validation_state text;
  v_validation_issues jsonb;
  v_failure_state text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_action not in ('apply', 'reject') then
    raise exception 'Unsupported chart refinement action' using errcode = '22023';
  end if;
  if not can_publish_project(p_project_id) or not has_tenant_access(p_tenant_id) then
    raise exception 'Editor access required' using errcode = '42501';
  end if;

  select * into v_proposal
  from ai_workflow_proposals
  where id = p_proposal_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id
    and artifact_type = 'chart'
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'invalid_chart_proposal',
      'error', 'Chart refinement proposal was not found.'
    );
  end if;
  if v_proposal.status not in ('validated', 'needs_review') then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'invalid_chart_proposal',
      'error', 'Chart refinement proposal is no longer claimable.',
      'proposalId', v_proposal.id
    );
  end if;
  if v_proposal.proposal ->> 'chartId' is distinct from p_chart_id::text then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'invalid_chart_proposal',
      'error', 'Chart refinement proposal does not belong to this chart.',
      'proposalId', v_proposal.id
    );
  end if;

  select * into v_run
  from ai_workflow_runs
  where id = v_proposal.run_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id
    and workflow_type = 'chart_refinement'
  for update;

  if not found then
    raise exception 'Chart refinement workflow run is missing' using errcode = '23503';
  end if;

  select * into v_chart
  from dashboard_chart_configs
  where id = p_chart_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'chart_not_found',
      'error', 'Source chart was not found.',
      'proposalId', v_proposal.id
    );
  end if;
  v_original_chart := v_chart;

  perform set_config('dashboardos.chart_refinement_proposal_id', v_proposal.id::text, true);

  if p_action = 'reject' then
    update ai_workflow_proposals
    set status = 'rejected', reviewed_by = v_actor, reviewed_at = v_now, updated_at = v_now
    where id = v_proposal.id;

    update ai_workflow_runs
    set status = 'succeeded',
        output_summary = jsonb_build_object(
          'proposalId', v_proposal.id,
          'chartId', v_chart.id,
          'outcome', 'rejected',
          'reason', left(coalesce(nullif(trim(p_rejection_reason), ''), 'Reviewer rejected AI patch preview'), 500)
        ),
        validation_summary = v_proposal.validation,
        error_code = null,
        error_message = null,
        completed_at = v_now,
        updated_at = v_now
    where id = v_run.id;

    insert into audit_logs (
      tenant_id, project_id, actor_user_id, action, target_type, target_id, metadata, created_at
    ) values (
      p_tenant_id, p_project_id, v_actor, 'ai.chart_refine.patch_rejected',
      'dashboard_chart_config', v_chart.id,
      jsonb_build_object(
        'proposalId', v_proposal.id,
        'runId', v_run.id,
        'reason', left(coalesce(nullif(trim(p_rejection_reason), ''), 'Reviewer rejected AI patch preview'), 500),
        'transactional', true
      ),
      v_now
    );

    return jsonb_build_object(
      'ok', true,
      'outcome', 'rejected',
      'proposalId', v_proposal.id,
      'proposalStatus', 'rejected',
      'chart', to_jsonb(v_chart)
    );
  end if;

  if p_base_updated_at is null
    or (v_proposal.proposal ->> 'baseUpdatedAt')::timestamptz is distinct from p_base_updated_at then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'invalid_chart_proposal',
      'error', 'Proposal source revision does not match the apply request.',
      'proposalId', v_proposal.id,
      'chart', to_jsonb(v_chart)
    );
  end if;

  if v_chart.updated_at is distinct from p_base_updated_at then
    update ai_workflow_proposals
    set status = 'rejected', reviewed_by = v_actor, reviewed_at = v_now, updated_at = v_now
    where id = v_proposal.id;

    update ai_workflow_runs
    set status = 'failed',
        output_summary = jsonb_build_object(
          'proposalId', v_proposal.id,
          'chartId', v_chart.id,
          'outcome', 'rejected'
        ),
        validation_summary = v_proposal.validation,
        error_code = 'stale_chart_revision',
        error_message = 'Source chart changed after proposal generation.',
        completed_at = v_now,
        updated_at = v_now
    where id = v_run.id;

    insert into audit_logs (
      tenant_id, project_id, actor_user_id, action, target_type, target_id, metadata, created_at
    ) values (
      p_tenant_id, p_project_id, v_actor, 'ai.chart_refine.stale_revision_rejected',
      'dashboard_chart_config', v_chart.id,
      jsonb_build_object(
        'proposalId', v_proposal.id,
        'runId', v_run.id,
        'expectedRevision', p_base_updated_at,
        'actualRevision', v_chart.updated_at,
        'transactional', true
      ),
      v_now
    );

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'errorCode', 'stale_chart_revision',
      'error', 'Source chart changed after proposal generation.',
      'proposalId', v_proposal.id,
      'proposalStatus', 'rejected',
      'chart', to_jsonb(v_chart)
    );
  end if;

  v_next := v_proposal.proposal -> 'nextChart';
  v_validation_state := v_next ->> 'validationState';
  v_validation_issues := coalesce(v_proposal.validation -> 'issues', '[]'::jsonb);
  if jsonb_typeof(v_next) is distinct from 'object'
    or length(trim(coalesce(v_next ->> 'name', ''))) not between 2 and 120
    or coalesce(v_next ->> 'templateId', '') not in (
      'bar', 'horizontal-bar', 'grouped-bar', 'horizontal-stacked-bar', 'line', 'trend-composed',
      'pie', 'gauge', 'ring-gauge', 'kpi-card', 'kpi-grid', 'drilldown-bar', 'table-grid'
    )
    or jsonb_typeof(v_next -> 'encoding') is distinct from 'object'
    or jsonb_typeof(v_next -> 'presentation') is distinct from 'object'
    or coalesce(v_validation_state, '') not in ('valid', 'warning')
    or v_proposal.validation ->> 'state' is distinct from v_validation_state
    or jsonb_typeof(v_validation_issues) is distinct from 'array'
    or jsonb_typeof(v_proposal.proposal -> 'patch') is distinct from 'object'
    or v_proposal.proposal -> 'patch' ->> 'schemaVersion' is distinct from 'dashboardos.ai.chart_patch.v1'
    or coalesce(v_proposal.proposal ->> 'mode', '') not in ('general', 'presentation_only') then
    update ai_workflow_proposals
    set status = 'rejected', reviewed_by = v_actor, reviewed_at = v_now, updated_at = v_now
    where id = v_proposal.id;
    update ai_workflow_runs
    set status = 'failed',
        error_code = 'invalid_chart_proposal',
        error_message = 'Stored chart refinement proposal failed transaction validation.',
        completed_at = v_now,
        updated_at = v_now
    where id = v_run.id;
    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'errorCode', 'invalid_chart_proposal',
      'error', 'Stored chart refinement proposal is invalid.',
      'proposalId', v_proposal.id,
      'proposalStatus', 'rejected',
      'chart', to_jsonb(v_chart)
    );
  end if;

  begin
    update dashboard_chart_configs
    set name = trim(v_next ->> 'name'),
        description = nullif(v_next ->> 'description', ''),
        template_id = v_next ->> 'templateId',
        encoding = v_next -> 'encoding',
        presentation = v_next -> 'presentation',
        validation_state = v_validation_state,
        last_validated_at = v_now,
        status = 'draft',
        published_at = null,
        updated_at = v_now
    where id = v_chart.id
      and tenant_id = p_tenant_id
      and project_id = p_project_id
    returning * into v_chart;

    insert into dashboard_chart_validation_results (
      chart_id, tenant_id, project_id, state, issues, checked_by, checked_at
    ) values (
      v_chart.id, p_tenant_id, p_project_id, v_validation_state,
      v_validation_issues, v_actor, v_now
    );

    update ai_workflow_proposals
    set status = 'applied', reviewed_by = v_actor, reviewed_at = v_now, updated_at = v_now
    where id = v_proposal.id;

    update ai_workflow_runs
    set status = 'succeeded',
        output_summary = jsonb_build_object(
          'proposalId', v_proposal.id,
          'chartId', v_chart.id,
          'outcome', 'applied'
        ),
        validation_summary = v_proposal.validation,
        error_code = null,
        error_message = null,
        completed_at = v_now,
        updated_at = v_now
    where id = v_run.id;

    insert into audit_logs (
      tenant_id, project_id, actor_user_id, action, target_type, target_id, metadata, created_at
    ) values (
      p_tenant_id, p_project_id, v_actor, 'ai.chart_refine.patch_accepted',
      'dashboard_chart_config', v_chart.id,
      jsonb_build_object(
        'proposalId', v_proposal.id,
        'runId', v_run.id,
        'sourceRevision', p_base_updated_at,
        'newRevision', v_chart.updated_at,
        'status', v_chart.status,
        'transactional', true
      ),
      v_now
    );
  exception when others then
    v_failure_state := sqlstate;
    v_chart := v_original_chart;
    update ai_workflow_proposals
    set status = 'rejected', reviewed_by = v_actor, reviewed_at = v_now, updated_at = v_now
    where id = v_proposal.id;
    update ai_workflow_runs
    set status = 'failed',
        output_summary = jsonb_build_object(
          'proposalId', v_proposal.id,
          'chartId', v_chart.id,
          'outcome', 'rejected'
        ),
        validation_summary = v_proposal.validation,
        error_code = 'chart_refinement_apply_failed',
        error_message = 'The database transaction could not apply the stored chart refinement.',
        completed_at = v_now,
        updated_at = v_now
    where id = v_run.id;
    insert into audit_logs (
      tenant_id, project_id, actor_user_id, action, target_type, target_id, metadata, created_at
    ) values (
      p_tenant_id, p_project_id, v_actor, 'ai.chart_refine.apply_failed',
      'dashboard_chart_config', v_chart.id,
      jsonb_build_object(
        'proposalId', v_proposal.id,
        'runId', v_run.id,
        'sqlState', v_failure_state,
        'transactional', true
      ),
      v_now
    );
    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'errorCode', 'chart_refinement_apply_failed',
      'error', 'The database transaction could not apply the chart refinement.',
      'proposalId', v_proposal.id,
      'proposalStatus', 'rejected',
      'chart', to_jsonb(v_chart)
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'applied',
    'proposalId', v_proposal.id,
    'proposalStatus', 'applied',
    'chart', to_jsonb(v_chart)
  );
end;
$$;

revoke all on function guard_chart_refinement_proposal_update() from public, anon, authenticated;
revoke all on function finalize_chart_refinement_proposal(uuid, uuid, uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function finalize_chart_refinement_proposal(uuid, uuid, uuid, uuid, timestamptz, text, text) to authenticated, service_role;

comment on function finalize_chart_refinement_proposal(uuid, uuid, uuid, uuid, timestamptz, text, text) is
  'Atomically finalizes a durable chart-refinement proposal and, for apply, updates only the mutable source chart.';
