-- Reconcile schema objects that were only partially represented by the
-- historical remote repair migrations. This migration is intentionally
-- additive: the remote repair policies are stricter than the original local
-- policy names, so RLS policies are not replaced here.

create index if not exists idx_dashboard_chart_validation_results_project
on dashboard_chart_validation_results (tenant_id, project_id, checked_at desc);

alter table chart_health_runs
  add column if not exists status_filter text not null default 'published',
  add column if not exists total_count integer not null default 0,
  add column if not exists healthy_count integer not null default 0,
  add column if not exists stale_count integer not null default 0,
  add column if not exists blocked_count integer not null default 0,
  add column if not exists degraded_chart_ids uuid[] not null default '{}'::uuid[],
  add column if not exists summary jsonb not null default '{}'::jsonb,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_chart_health_runs_tenant_project
on chart_health_runs (tenant_id, project_id, checked_at desc);

alter table platform_jobs
  add column if not exists run_after timestamptz,
  add column if not exists dedupe_key text,
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists completed_at timestamptz;

update platform_jobs
set
  run_after = coalesce(run_after, scheduled_for, created_at, now()),
  locked_by = coalesce(locked_by, claimed_by),
  locked_at = coalesce(locked_at, claimed_at),
  completed_at = coalesce(completed_at, finished_at)
where run_after is null
   or (locked_by is null and claimed_by is not null)
   or (locked_at is null and claimed_at is not null)
   or (completed_at is null and finished_at is not null);

alter table platform_jobs
  alter column run_after set default now(),
  alter column run_after set not null;

create index if not exists idx_platform_jobs_ready
on platform_jobs (status, run_after, priority desc, created_at)
where status = 'queued';

create index if not exists idx_platform_jobs_tenant_project
on platform_jobs (tenant_id, project_id, created_at desc);

create index if not exists idx_platform_jobs_type_status
on platform_jobs (job_type, status, created_at desc);

create unique index if not exists idx_platform_jobs_active_dedupe
on platform_jobs (dedupe_key)
where dedupe_key is not null and status in ('queued', 'running');

create or replace function claim_platform_jobs(batch_size integer, worker_id text)
returns setof platform_jobs
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from platform_jobs
    where status = 'queued'
      and run_after <= now()
    order by priority desc, run_after asc, created_at asc
    limit greatest(1, least(batch_size, 25))
    for update skip locked
  )
  update platform_jobs jobs
  set
    status = 'running',
    locked_by = worker_id,
    locked_at = now(),
    started_at = coalesce(jobs.started_at, now()),
    attempts = jobs.attempts + 1,
    error_message = null,
    updated_at = now()
  from picked
  where jobs.id = picked.id
  returning jobs.*;
$$;

revoke all on function claim_platform_jobs(integer, text) from public, anon, authenticated;
grant execute on function claim_platform_jobs(integer, text) to service_role;

alter table platform_job_schedules
  add column if not exists interval_minutes integer not null default 60
    check (interval_minutes between 5 and 43200),
  add column if not exists priority integer not null default 0,
  add column if not exists max_attempts integer not null default 3
    check (max_attempts between 1 and 25),
  add column if not exists last_enqueued_at timestamptz,
  add column if not exists last_job_id uuid references platform_jobs(id) on delete set null,
  add column if not exists last_error text,
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz;

create index if not exists idx_platform_job_schedules_due
on platform_job_schedules (enabled, next_run_at, priority desc)
where enabled = true;

create index if not exists idx_platform_job_schedules_tenant_project
on platform_job_schedules (tenant_id, project_id, job_type, enabled);

create unique index if not exists idx_platform_job_schedules_target
on platform_job_schedules (tenant_id, project_id, job_type, target_type, target_id);

create or replace function claim_platform_job_schedules(batch_size integer, scheduler_id text)
returns setof platform_job_schedules
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from platform_job_schedules
    where enabled = true
      and next_run_at <= now()
    order by priority desc, next_run_at asc, created_at asc
    limit greatest(1, least(batch_size, 50))
    for update skip locked
  )
  update platform_job_schedules schedules
  set
    locked_by = scheduler_id,
    locked_at = now(),
    last_enqueued_at = now(),
    next_run_at = now() + make_interval(mins => schedules.interval_minutes),
    last_error = null,
    updated_at = now()
  from picked
  where schedules.id = picked.id
  returning schedules.*;
$$;

revoke all on function claim_platform_job_schedules(integer, text) from public, anon, authenticated;
grant execute on function claim_platform_job_schedules(integer, text) to service_role;

alter table platform_alerts
  add column if not exists alert_key text,
  add column if not exists alert_type text,
  add column if not exists state text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists acknowledged_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz;

update platform_alerts
set
  alert_key = coalesce(alert_key, id::text),
  alert_type = coalesce(
    alert_type,
    case source_type
      when 'dashboard' then 'dashboard_blocked'
      when 'chart' then 'chart_stale'
      when 'data_source' then 'schema_refresh_failed'
      else 'job_failed'
    end
  ),
  state = coalesce(
    state,
    case when status in ('open', 'acknowledged', 'resolved') then status else 'open' end
  ),
  first_seen_at = coalesce(first_seen_at, created_at, now()),
  last_seen_at = coalesce(last_seen_at, created_at, now()),
  updated_at = coalesce(updated_at, created_at, now())
where alert_key is null
   or alert_type is null
   or state is null
   or first_seen_at is null
   or last_seen_at is null
   or updated_at is null;

alter table platform_alerts
  alter column alert_key set not null,
  alter column alert_type set not null,
  alter column state set default 'open',
  alter column state set not null,
  alter column first_seen_at set default now(),
  alter column first_seen_at set not null,
  alter column last_seen_at set default now(),
  alter column last_seen_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.platform_alerts'::regclass
      and conname = 'platform_alerts_alert_type_check'
  ) then
    alter table platform_alerts
      add constraint platform_alerts_alert_type_check
      check (alert_type in ('dashboard_blocked', 'chart_stale', 'schema_refresh_failed', 'job_failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.platform_alerts'::regclass
      and conname = 'platform_alerts_state_check'
  ) then
    alter table platform_alerts
      add constraint platform_alerts_state_check
      check (state in ('open', 'acknowledged', 'resolved'));
  end if;
end
$$;

create unique index if not exists idx_platform_alerts_active_key
on platform_alerts (alert_key)
where state in ('open', 'acknowledged');

create index if not exists idx_platform_alerts_tenant_project
on platform_alerts (tenant_id, project_id, state, last_seen_at desc);

create index if not exists idx_platform_alerts_source
on platform_alerts (source_type, source_id, state);

alter table dashboard_export_artifacts
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists status text not null default 'succeeded'
    check (status in ('succeeded', 'failed')),
  add column if not exists content_type text not null default 'application/json',
  add column if not exists artifact jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists error_message text,
  add column if not exists storage_status text not null default 'inline'
    check (storage_status in ('inline', 'uploaded', 'failed', 'skipped')),
  add column if not exists storage_error text,
  add column if not exists byte_size integer check (byte_size is null or byte_size >= 0);

update dashboard_export_artifacts
set
  requested_by = coalesce(requested_by, created_by),
  content_type = coalesce(nullif(content_type, ''), mime_type, 'application/json'),
  artifact = case
    when artifact = '{}'::jsonb and manifest <> '{}'::jsonb then manifest
    else artifact
  end,
  byte_size = coalesce(byte_size, greatest(0, least(size_bytes, 2147483647))::integer)
where requested_by is null
   or content_type is null
   or (artifact = '{}'::jsonb and manifest <> '{}'::jsonb)
   or byte_size is null;

create index if not exists idx_dashboard_export_artifacts_dashboard
on dashboard_export_artifacts (dashboard_id, created_at desc);

create index if not exists idx_dashboard_export_artifacts_version
on dashboard_export_artifacts (version_id, created_at desc);

create index if not exists idx_dashboard_export_artifacts_tenant_project
on dashboard_export_artifacts (tenant_id, project_id, created_at desc);

create index if not exists idx_dashboard_export_artifacts_storage_path
on dashboard_export_artifacts (storage_bucket, storage_path)
where storage_path is not null;

create index if not exists idx_dashboard_entitlements_user
on published_dashboard_entitlements (principal_type, principal_id)
where principal_type = 'user';

create index if not exists idx_dataset_entitlements_user
on semantic_dataset_entitlements (principal_type, principal_id)
where principal_type = 'user';

create or replace function apply_data_source_schema_snapshot_atomic(
  p_data_source_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_columns jsonb,
  p_schema_hash text,
  p_table_count int,
  p_column_count int,
  p_introspected_at timestamptz,
  p_refresh_after timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source data_sources%rowtype;
  v_inserted_count int := 0;
begin
  if jsonb_typeof(p_columns) is distinct from 'array' then
    raise exception 'Schema snapshot columns must be a JSON array' using errcode = '22023';
  end if;

  select *
  into v_source
  from data_sources
  where id = p_data_source_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id
  for update;

  if not found then
    raise exception 'Data source not found for the requested tenant/project scope' using errcode = 'P0002';
  end if;

  delete from data_source_columns
  where data_source_id = p_data_source_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id;

  if jsonb_array_length(p_columns) > 0 then
    insert into data_source_columns (
      tenant_id,
      project_id,
      data_source_id,
      schema_name,
      table_name,
      column_name,
      ordinal_position,
      data_type,
      udt_name,
      is_nullable,
      column_default
    )
    select
      p_tenant_id,
      p_project_id,
      p_data_source_id,
      column_row.schema_name,
      column_row.table_name,
      column_row.column_name,
      column_row.ordinal_position,
      column_row.data_type,
      column_row.udt_name,
      column_row.is_nullable,
      column_row.column_default
    from jsonb_to_recordset(p_columns) as column_row(
      schema_name text,
      table_name text,
      column_name text,
      ordinal_position int,
      data_type text,
      udt_name text,
      is_nullable boolean,
      column_default text
    );

    get diagnostics v_inserted_count = row_count;
  end if;

  if v_inserted_count <> p_column_count then
    raise exception 'Schema snapshot column count mismatch: expected %, inserted %', p_column_count, v_inserted_count
      using errcode = '22000';
  end if;

  update data_sources
  set
    status = case when status = 'disabled' then status else 'active' end,
    last_tested_at = p_introspected_at,
    last_test_status = 'ok',
    last_error = null,
    schema_last_introspected_at = p_introspected_at,
    schema_last_status = 'ok',
    schema_last_error = null,
    schema_hash = p_schema_hash,
    schema_table_count = p_table_count,
    schema_column_count = p_column_count,
    schema_refresh_after = p_refresh_after,
    schema_refresh_requested_at = null,
    schema_refresh_reason = null,
    updated_at = p_introspected_at
  where id = p_data_source_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id;

  if not found then
    raise exception 'Schema snapshot source update was not authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'dataSourceId', p_data_source_id,
    'schemaHash', p_schema_hash,
    'tableCount', p_table_count,
    'columnCount', v_inserted_count
  );
end;
$$;

revoke all on function apply_data_source_schema_snapshot_atomic(
  uuid, uuid, uuid, jsonb, text, int, int, timestamptz, timestamptz
) from public, anon;
grant execute on function apply_data_source_schema_snapshot_atomic(
  uuid, uuid, uuid, jsonb, text, int, int, timestamptz, timestamptz
) to authenticated, service_role;

comment on function apply_data_source_schema_snapshot_atomic(
  uuid, uuid, uuid, jsonb, text, int, int, timestamptz, timestamptz
) is 'Compatibility RPC for atomic column snapshots. New callers use apply_data_source_schema_inventory_atomic.';
