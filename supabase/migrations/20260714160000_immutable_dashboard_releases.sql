alter table dashboard_versions
  add column if not exists release_snapshot_status text not null default 'pending'
    check (release_snapshot_status in ('pending', 'complete', 'legacy_backfill')),
  add column if not exists release_snapshot_created_at timestamptz;

create table if not exists dashboard_release_dataset_snapshots (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null,
  dashboard_id uuid not null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  source_dataset_id uuid not null,
  source_model_id uuid not null,
  dataset_config jsonb not null,
  semantic_snapshot jsonb not null,
  source_dataset_updated_at timestamptz,
  source_model_version integer not null,
  snapshot_origin text not null default 'publish'
    check (snapshot_origin in ('publish', 'legacy_backfill')),
  created_at timestamptz not null default now(),
  unique (version_id, source_dataset_id),
  foreign key (version_id, dashboard_id, tenant_id, project_id)
    references dashboard_versions (id, dashboard_id, tenant_id, project_id)
    on delete cascade
);

create table if not exists dashboard_release_chart_snapshots (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null,
  dashboard_id uuid not null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  slot_id uuid not null references dashboard_chart_slots(id) on delete cascade,
  dataset_snapshot_id uuid not null references dashboard_release_dataset_snapshots(id) on delete cascade,
  source_chart_config_id uuid not null,
  chart_config jsonb not null,
  source_chart_updated_at timestamptz,
  snapshot_origin text not null default 'publish'
    check (snapshot_origin in ('publish', 'legacy_backfill')),
  created_at timestamptz not null default now(),
  unique (version_id, slot_id),
  foreign key (version_id, dashboard_id, tenant_id, project_id)
    references dashboard_versions (id, dashboard_id, tenant_id, project_id)
    on delete cascade
);

create index if not exists idx_release_dataset_snapshots_scope
on dashboard_release_dataset_snapshots (tenant_id, project_id, dashboard_id, version_id);

create index if not exists idx_release_chart_snapshots_scope
on dashboard_release_chart_snapshots (tenant_id, project_id, dashboard_id, version_id);

create index if not exists idx_release_chart_snapshots_slot
on dashboard_release_chart_snapshots (slot_id);

alter table dashboard_release_dataset_snapshots enable row level security;
alter table dashboard_release_chart_snapshots enable row level security;

revoke all on dashboard_release_dataset_snapshots from anon, authenticated;
revoke all on dashboard_release_chart_snapshots from anon, authenticated;
grant select on dashboard_release_dataset_snapshots to authenticated;
grant select on dashboard_release_chart_snapshots to authenticated;

drop policy if exists "release dataset snapshots readable by release access" on dashboard_release_dataset_snapshots;
drop policy if exists "release chart snapshots readable by release access" on dashboard_release_chart_snapshots;

create policy "release dataset snapshots readable by release access"
on dashboard_release_dataset_snapshots for select
to authenticated
using (has_project_access(project_id) or has_tenant_access(tenant_id));

create policy "release chart snapshots readable by release access"
on dashboard_release_chart_snapshots for select
to authenticated
using (has_project_access(project_id) or has_tenant_access(tenant_id));

create or replace function build_dashboard_release_semantic_snapshot(p_model_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'model', to_jsonb(bm),
    'entities', coalesce((
      select jsonb_agg(to_jsonb(be) order by be.id)
      from business_entities be
      where be.model_id = bm.id
    ), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(to_jsonb(bf) order by bf.id)
      from business_fields bf
      join business_entities be on be.id = bf.entity_id
      where be.model_id = bm.id
    ), '[]'::jsonb),
    'metrics', coalesce((
      select jsonb_agg(to_jsonb(metric) order by metric.id)
      from business_metrics metric
      where metric.model_id = bm.id
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(to_jsonb(rel) order by rel.id)
      from business_relationships rel
      where rel.model_id = bm.id
    ), '[]'::jsonb),
    'sourceSchemaHashes', coalesce((
      select jsonb_object_agg(source_hash.data_source_id, source_hash.schema_hash)
      from (
        select distinct ds.id::text as data_source_id, ds.schema_hash
        from business_fields bf
        join business_entities be on be.id = bf.entity_id
        join data_sources ds on ds.id::text = bf.source_column ->> 'dataSourceId'
        where be.model_id = bm.id
          and ds.tenant_id = bm.tenant_id
          and ds.project_id = bm.project_id
      ) source_hash
    ), '{}'::jsonb)
  )
  from business_models bm
  where bm.id = p_model_id;
$$;

revoke all on function build_dashboard_release_semantic_snapshot(uuid) from public, anon, authenticated;

insert into dashboard_release_dataset_snapshots (
  version_id,
  dashboard_id,
  tenant_id,
  project_id,
  source_dataset_id,
  source_model_id,
  dataset_config,
  semantic_snapshot,
  source_dataset_updated_at,
  source_model_version,
  snapshot_origin,
  created_at
)
select
  captured.version_id,
  captured.dashboard_id,
  captured.tenant_id,
  captured.project_id,
  captured.dataset_id,
  captured.model_id,
  captured.dataset_config,
  build_dashboard_release_semantic_snapshot(captured.model_id),
  captured.dataset_updated_at,
  captured.model_version,
  'legacy_backfill',
  now()
from (
  select distinct on (dv.id, sd.id)
    dv.id as version_id,
    dv.dashboard_id,
    dv.tenant_id,
    dv.project_id,
    sd.id as dataset_id,
    sd.model_id,
    to_jsonb(sd) as dataset_config,
    sd.updated_at as dataset_updated_at,
    bm.version as model_version
  from dashboard_versions dv
  join dashboard_chart_slots slot on slot.version_id = dv.id
  join dashboard_chart_configs chart on chart.id = slot.chart_config_id
  join semantic_datasets sd on sd.id = chart.dataset_id
  join business_models bm on bm.id = sd.model_id
  where dv.status in ('published', 'retired')
  order by dv.id, sd.id
) captured
where not exists (
  select 1
  from dashboard_release_dataset_snapshots existing
  where existing.version_id = captured.version_id
    and existing.source_dataset_id = captured.dataset_id
);

insert into dashboard_release_chart_snapshots (
  version_id,
  dashboard_id,
  tenant_id,
  project_id,
  slot_id,
  dataset_snapshot_id,
  source_chart_config_id,
  chart_config,
  source_chart_updated_at,
  snapshot_origin,
  created_at
)
select
  dv.id,
  dv.dashboard_id,
  dv.tenant_id,
  dv.project_id,
  slot.id,
  dataset_snapshot.id,
  chart.id,
  to_jsonb(chart),
  chart.updated_at,
  'legacy_backfill',
  now()
from dashboard_versions dv
join dashboard_chart_slots slot on slot.version_id = dv.id
join dashboard_chart_configs chart on chart.id = slot.chart_config_id
join dashboard_release_dataset_snapshots dataset_snapshot
  on dataset_snapshot.version_id = dv.id
  and dataset_snapshot.source_dataset_id = chart.dataset_id
where dv.status in ('published', 'retired')
  and not exists (
    select 1
    from dashboard_release_chart_snapshots existing
    where existing.version_id = dv.id
      and existing.slot_id = slot.id
  );

update dashboard_versions version
set
  release_snapshot_status = 'legacy_backfill',
  release_snapshot_created_at = coalesce(version.release_snapshot_created_at, now())
where version.status in ('published', 'retired')
  and exists (
    select 1 from dashboard_chart_slots slot where slot.version_id = version.id
  )
  and (
    select count(*) from dashboard_release_chart_snapshots snapshot where snapshot.version_id = version.id
  ) = (
    select count(*) from dashboard_chart_slots slot where slot.version_id = version.id
  );

create or replace function guard_dashboard_release_version_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.release_snapshot_status <> 'pending' then
      raise exception 'New dashboard versions must begin as unsnapshotted drafts' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.release_snapshot_status <> 'pending' then
      raise exception 'Released dashboard versions cannot be deleted' using errcode = '55000';
    end if;
    return old;
  end if;

  if old.release_snapshot_status <> 'pending' and (
    new.dashboard_id is distinct from old.dashboard_id
    or new.tenant_id is distinct from old.tenant_id
    or new.project_id is distinct from old.project_id
    or new.version_number is distinct from old.version_number
    or new.title is distinct from old.title
    or new.notes is distinct from old.notes
    or new.layout is distinct from old.layout
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Released dashboard version content is immutable' using errcode = '55000';
  end if;

  if new.release_snapshot_status is distinct from old.release_snapshot_status
    or new.release_snapshot_created_at is distinct from old.release_snapshot_created_at
    or new.status is distinct from old.status
    or new.published_by is distinct from old.published_by
    or new.published_at is distinct from old.published_at then
    raise exception 'Dashboard release transitions must use the governed publish or rollback function' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_dashboard_release_version_mutation on dashboard_versions;
create trigger guard_dashboard_release_version_mutation
before insert or update or delete on dashboard_versions
for each row execute function guard_dashboard_release_version_mutation();

create or replace function guard_dashboard_release_child_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_snapshot_status text;
  v_new_snapshot_status text;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select release_snapshot_status
    into v_old_snapshot_status
    from dashboard_versions
    where id = old.version_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select release_snapshot_status
    into v_new_snapshot_status
    from dashboard_versions
    where id = new.version_id;
  end if;

  if (tg_op in ('UPDATE', 'DELETE') and v_old_snapshot_status is distinct from 'pending')
    or (tg_op in ('INSERT', 'UPDATE') and v_new_snapshot_status is distinct from 'pending') then
    raise exception 'Released dashboard pages and slots are immutable' using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_dashboard_release_page_mutation on dashboard_pages;
create trigger guard_dashboard_release_page_mutation
before insert or update or delete on dashboard_pages
for each row execute function guard_dashboard_release_child_mutation();

drop trigger if exists guard_dashboard_release_slot_mutation on dashboard_chart_slots;
create trigger guard_dashboard_release_slot_mutation
before insert or update or delete on dashboard_chart_slots
for each row execute function guard_dashboard_release_child_mutation();

create or replace function guard_published_dashboard_release_pointer()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.current_version_id is not null then
      raise exception 'New published-dashboard records must begin as draft shells' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.current_version_id is distinct from old.current_version_id
    or (new.status = 'published' and new.status is distinct from old.status) then
    raise exception 'Published dashboard release pointers must use the governed publish or rollback function' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_published_dashboard_release_pointer on published_dashboards;
create trigger guard_published_dashboard_release_pointer
before insert or update on published_dashboards
for each row execute function guard_published_dashboard_release_pointer();

create or replace function publish_dashboard_version_immutable(
  p_dashboard_id uuid,
  p_version_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_notes text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_dashboard published_dashboards%rowtype;
  v_version dashboard_versions%rowtype;
  v_now timestamptz := now();
  v_page_count integer;
  v_slot_count integer;
  v_dataset_count integer;
  v_inserted_datasets integer;
  v_inserted_charts integer;
  v_invalid_count integer;
begin
  if v_actor_id is null then
    raise exception 'Authenticated publish actor is required' using errcode = '28000';
  end if;
  if not can_publish_project(p_project_id) or not has_tenant_access(p_tenant_id) then
    raise exception 'Project editor access is required' using errcode = '42501';
  end if;

  select * into v_dashboard
  from published_dashboards
  where id = p_dashboard_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id
  for update;
  if not found then
    raise exception 'Dashboard not found for requested scope' using errcode = 'P0002';
  end if;
  if v_dashboard.status = 'archived' then
    raise exception 'Archived dashboards cannot be published' using errcode = '55000';
  end if;

  select * into v_version
  from dashboard_versions
  where id = p_version_id
    and dashboard_id = p_dashboard_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id
  for update;
  if not found then
    raise exception 'Dashboard version not found for requested scope' using errcode = 'P0002';
  end if;
  if v_version.status <> 'draft' or v_version.release_snapshot_status <> 'pending' then
    raise exception 'Only an unsnapshotted draft version can be published' using errcode = '55000';
  end if;

  select count(*) into v_page_count
  from dashboard_pages
  where version_id = p_version_id
    and dashboard_id = p_dashboard_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id;

  select count(*) into v_slot_count
  from dashboard_chart_slots
  where version_id = p_version_id
    and dashboard_id = p_dashboard_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id;

  if v_page_count = 0 or v_slot_count = 0 then
    raise exception 'Publish requires at least one page and one chart slot' using errcode = '22023';
  end if;

  perform chart.id
  from dashboard_chart_slots slot
  join dashboard_chart_configs chart on chart.id = slot.chart_config_id
  join semantic_datasets dataset on dataset.id = chart.dataset_id
  join business_models model on model.id = dataset.model_id
  where slot.version_id = p_version_id
  for update of chart, dataset, model;

  perform entity.id
  from business_entities entity
  where entity.model_id in (
    select distinct dataset.model_id
    from dashboard_chart_slots slot
    join dashboard_chart_configs chart on chart.id = slot.chart_config_id
    join semantic_datasets dataset on dataset.id = chart.dataset_id
    where slot.version_id = p_version_id
  )
  for share of entity;

  perform field.id
  from business_fields field
  join business_entities entity on entity.id = field.entity_id
  where entity.model_id in (
    select distinct dataset.model_id
    from dashboard_chart_slots slot
    join dashboard_chart_configs chart on chart.id = slot.chart_config_id
    join semantic_datasets dataset on dataset.id = chart.dataset_id
    where slot.version_id = p_version_id
  )
  for share of field;

  perform metric.id
  from business_metrics metric
  where metric.model_id in (
    select distinct dataset.model_id
    from dashboard_chart_slots slot
    join dashboard_chart_configs chart on chart.id = slot.chart_config_id
    join semantic_datasets dataset on dataset.id = chart.dataset_id
    where slot.version_id = p_version_id
  )
  for share of metric;

  perform relationship.id
  from business_relationships relationship
  where relationship.model_id in (
    select distinct dataset.model_id
    from dashboard_chart_slots slot
    join dashboard_chart_configs chart on chart.id = slot.chart_config_id
    join semantic_datasets dataset on dataset.id = chart.dataset_id
    where slot.version_id = p_version_id
  )
  for share of relationship;

  select count(*) into v_invalid_count
  from dashboard_chart_slots slot
  left join dashboard_chart_configs chart
    on chart.id = slot.chart_config_id
    and chart.tenant_id = slot.tenant_id
    and chart.project_id = slot.project_id
  left join semantic_datasets dataset
    on dataset.id = chart.dataset_id
    and dataset.tenant_id = slot.tenant_id
    and dataset.project_id = slot.project_id
  left join business_models model
    on model.id = dataset.model_id
    and model.tenant_id = slot.tenant_id
    and model.project_id = slot.project_id
  left join dashboard_projects project on project.id = slot.project_id
  where slot.version_id = p_version_id
    and (
      chart.id is null
      or chart.status <> 'published'
      or chart.validation_state <> 'valid'
      or dataset.id is null
      or dataset.status <> 'published'
      or model.id is null
      or model.status <> 'approved'
      or project.active_business_model_id is distinct from model.id
    );

  if v_invalid_count > 0 then
    raise exception 'Release snapshot inputs changed after preflight or are not publish-safe' using errcode = '22023';
  end if;

  if exists (select 1 from dashboard_release_chart_snapshots where version_id = p_version_id)
    or exists (select 1 from dashboard_release_dataset_snapshots where version_id = p_version_id) then
    raise exception 'Draft version already has release snapshots' using errcode = '55000';
  end if;

  select count(distinct chart.dataset_id) into v_dataset_count
  from dashboard_chart_slots slot
  join dashboard_chart_configs chart on chart.id = slot.chart_config_id
  where slot.version_id = p_version_id;

  insert into dashboard_release_dataset_snapshots (
    version_id,
    dashboard_id,
    tenant_id,
    project_id,
    source_dataset_id,
    source_model_id,
    dataset_config,
    semantic_snapshot,
    source_dataset_updated_at,
    source_model_version,
    snapshot_origin,
    created_at
  )
  select distinct on (dataset.id)
    p_version_id,
    p_dashboard_id,
    p_tenant_id,
    p_project_id,
    dataset.id,
    dataset.model_id,
    to_jsonb(dataset),
    build_dashboard_release_semantic_snapshot(dataset.model_id),
    dataset.updated_at,
    model.version,
    'publish',
    v_now
  from dashboard_chart_slots slot
  join dashboard_chart_configs chart on chart.id = slot.chart_config_id
  join semantic_datasets dataset on dataset.id = chart.dataset_id
  join business_models model on model.id = dataset.model_id
  where slot.version_id = p_version_id
  order by dataset.id;
  get diagnostics v_inserted_datasets = row_count;

  if v_inserted_datasets <> v_dataset_count then
    raise exception 'Release dataset snapshot count mismatch' using errcode = '22000';
  end if;

  insert into dashboard_release_chart_snapshots (
    version_id,
    dashboard_id,
    tenant_id,
    project_id,
    slot_id,
    dataset_snapshot_id,
    source_chart_config_id,
    chart_config,
    source_chart_updated_at,
    snapshot_origin,
    created_at
  )
  select
    p_version_id,
    p_dashboard_id,
    p_tenant_id,
    p_project_id,
    slot.id,
    dataset_snapshot.id,
    chart.id,
    to_jsonb(chart),
    chart.updated_at,
    'publish',
    v_now
  from dashboard_chart_slots slot
  join dashboard_chart_configs chart on chart.id = slot.chart_config_id
  join dashboard_release_dataset_snapshots dataset_snapshot
    on dataset_snapshot.version_id = p_version_id
    and dataset_snapshot.source_dataset_id = chart.dataset_id
  where slot.version_id = p_version_id;
  get diagnostics v_inserted_charts = row_count;

  if v_inserted_charts <> v_slot_count then
    raise exception 'Release chart snapshot count mismatch' using errcode = '22000';
  end if;

  update dashboard_versions
  set status = 'retired'
  where dashboard_id = p_dashboard_id
    and status = 'published'
    and id <> p_version_id;

  update dashboard_versions
  set
    status = 'published',
    published_by = v_actor_id,
    published_at = v_now,
    release_snapshot_status = 'complete',
    release_snapshot_created_at = v_now
  where id = p_version_id
  returning * into v_version;

  update published_dashboards
  set
    status = 'published',
    current_version_id = p_version_id,
    updated_by = v_actor_id,
    published_at = v_now,
    updated_at = v_now
  where id = p_dashboard_id
  returning * into v_dashboard;

  insert into published_dashboard_entitlements (
    tenant_id,
    project_id,
    dashboard_id,
    principal_type,
    can_view,
    can_export,
    created_by,
    created_at,
    updated_at
  )
  select
    p_tenant_id,
    p_project_id,
    p_dashboard_id,
    'tenant',
    true,
    true,
    v_actor_id,
    v_now,
    v_now
  where not exists (
    select 1
    from published_dashboard_entitlements entitlement
    where entitlement.dashboard_id = p_dashboard_id
      and entitlement.principal_type = 'tenant'
      and entitlement.principal_id is null
      and entitlement.role is null
  );

  update published_dashboard_entitlements
  set can_view = true, can_export = true, updated_at = v_now
  where dashboard_id = p_dashboard_id
    and principal_type = 'tenant'
    and principal_id is null
    and role is null;

  insert into dashboard_publish_events (
    dashboard_id,
    version_id,
    tenant_id,
    project_id,
    actor_user_id,
    event_type,
    notes,
    metadata,
    created_at
  ) values (
    p_dashboard_id,
    p_version_id,
    p_tenant_id,
    p_project_id,
    v_actor_id,
    'published',
    nullif(trim(p_notes), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'versionNumber', v_version.version_number,
      'releaseSnapshotStatus', v_version.release_snapshot_status,
      'releaseDatasetSnapshotCount', v_inserted_datasets,
      'releaseChartSnapshotCount', v_inserted_charts
    ),
    v_now
  );

  insert into audit_logs (
    tenant_id,
    project_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata,
    created_at
  ) values (
    p_tenant_id,
    p_project_id,
    v_actor_id,
    'published_dashboard.published',
    'published_dashboard',
    p_dashboard_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'versionId', p_version_id,
      'versionNumber', v_version.version_number,
      'releaseSnapshotStatus', v_version.release_snapshot_status,
      'releaseDatasetSnapshotCount', v_inserted_datasets,
      'releaseChartSnapshotCount', v_inserted_charts
    ),
    v_now
  );

  return jsonb_build_object(
    'dashboard', to_jsonb(v_dashboard),
    'version', to_jsonb(v_version),
    'releaseDatasetSnapshotCount', v_inserted_datasets,
    'releaseChartSnapshotCount', v_inserted_charts
  );
end;
$$;

create or replace function rollback_dashboard_release_immutable(
  p_dashboard_id uuid,
  p_version_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_notes text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_dashboard published_dashboards%rowtype;
  v_version dashboard_versions%rowtype;
  v_previous_version_id uuid;
  v_now timestamptz := now();
  v_slot_count integer;
  v_snapshot_count integer;
begin
  if v_actor_id is null then
    raise exception 'Authenticated rollback actor is required' using errcode = '28000';
  end if;
  if not can_publish_project(p_project_id) or not has_tenant_access(p_tenant_id) then
    raise exception 'Project editor access is required' using errcode = '42501';
  end if;

  select * into v_dashboard
  from published_dashboards
  where id = p_dashboard_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id
  for update;
  if not found then
    raise exception 'Dashboard not found for requested scope' using errcode = 'P0002';
  end if;
  if v_dashboard.status = 'archived' or v_dashboard.current_version_id is null then
    raise exception 'Rollback requires an active published dashboard' using errcode = '55000';
  end if;
  if v_dashboard.current_version_id = p_version_id then
    raise exception 'Selected release is already current' using errcode = '55000';
  end if;
  v_previous_version_id := v_dashboard.current_version_id;

  select * into v_version
  from dashboard_versions
  where id = p_version_id
    and dashboard_id = p_dashboard_id
    and tenant_id = p_tenant_id
    and project_id = p_project_id
  for update;
  if not found then
    raise exception 'Dashboard version not found for requested scope' using errcode = 'P0002';
  end if;
  if v_version.status = 'draft' or v_version.release_snapshot_status = 'pending' then
    raise exception 'Rollback requires a previously captured immutable release' using errcode = '55000';
  end if;

  select count(*) into v_slot_count
  from dashboard_chart_slots
  where version_id = p_version_id;

  select count(*) into v_snapshot_count
  from dashboard_release_chart_snapshots
  where version_id = p_version_id;

  if v_slot_count = 0 or v_snapshot_count <> v_slot_count then
    raise exception 'Rollback release snapshot is incomplete' using errcode = '55000';
  end if;

  update dashboard_versions
  set status = 'retired'
  where dashboard_id = p_dashboard_id
    and status = 'published'
    and id <> p_version_id;

  update dashboard_versions
  set
    status = 'published',
    published_by = v_actor_id,
    published_at = v_now
  where id = p_version_id
  returning * into v_version;

  update published_dashboards
  set
    status = 'published',
    current_version_id = p_version_id,
    updated_by = v_actor_id,
    published_at = v_now,
    updated_at = v_now
  where id = p_dashboard_id
  returning * into v_dashboard;

  insert into dashboard_publish_events (
    dashboard_id,
    version_id,
    tenant_id,
    project_id,
    actor_user_id,
    event_type,
    notes,
    metadata,
    created_at
  ) values (
    p_dashboard_id,
    p_version_id,
    p_tenant_id,
    p_project_id,
    v_actor_id,
    'rolled_back',
    nullif(trim(p_notes), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'versionNumber', v_version.version_number,
      'releaseSnapshotStatus', v_version.release_snapshot_status,
      'previousVersionId', v_previous_version_id
    ),
    v_now
  );

  insert into audit_logs (
    tenant_id,
    project_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata,
    created_at
  ) values (
    p_tenant_id,
    p_project_id,
    v_actor_id,
    'published_dashboard.rolled_back',
    'published_dashboard',
    p_dashboard_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'versionId', p_version_id,
      'versionNumber', v_version.version_number,
      'releaseSnapshotStatus', v_version.release_snapshot_status,
      'previousVersionId', v_previous_version_id
    ),
    v_now
  );

  return jsonb_build_object(
    'dashboard', to_jsonb(v_dashboard),
    'version', to_jsonb(v_version),
    'releaseChartSnapshotCount', v_snapshot_count
  );
end;
$$;

revoke all on function publish_dashboard_version_immutable(uuid, uuid, uuid, uuid, text, jsonb) from public, anon;
revoke all on function rollback_dashboard_release_immutable(uuid, uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function publish_dashboard_version_immutable(uuid, uuid, uuid, uuid, text, jsonb) to authenticated;
grant execute on function rollback_dashboard_release_immutable(uuid, uuid, uuid, uuid, text, jsonb) to authenticated;

comment on table dashboard_release_dataset_snapshots
is 'Immutable release-owned dataset and semantic runtime inputs captured per dashboard version.';

comment on table dashboard_release_chart_snapshots
is 'Immutable release-owned chart configuration captured per dashboard slot. Source chart edits require a new publish.';

comment on column dashboard_versions.release_snapshot_status
is 'pending for editable drafts, complete for transactionally captured releases, legacy_backfill for migration-time baselines whose original historical content cannot be proven.';
