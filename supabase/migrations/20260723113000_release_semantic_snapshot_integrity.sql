create or replace function dashboard_release_semantic_snapshot_is_valid(
  p_dataset_config jsonb,
  p_semantic_snapshot jsonb
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  with selection as (
    select
      coalesce(p_dataset_config #> '{selection,fieldIds}', '[]'::jsonb) as field_ids,
      coalesce(p_dataset_config #> '{selection,metricIds}', '[]'::jsonb) as metric_ids,
      coalesce(p_dataset_config #> '{selection,relationshipIds}', '[]'::jsonb) as relationship_ids
  ), snapshot as (
    select
      coalesce(p_semantic_snapshot -> 'fields', '[]'::jsonb) as fields,
      coalesce(p_semantic_snapshot -> 'metrics', '[]'::jsonb) as metrics,
      coalesce(p_semantic_snapshot -> 'relationships', '[]'::jsonb) as relationships
  )
  select
    jsonb_typeof(selection.field_ids) = 'array'
    and jsonb_typeof(selection.metric_ids) = 'array'
    and jsonb_typeof(selection.relationship_ids) = 'array'
    and jsonb_typeof(snapshot.fields) = 'array'
    and jsonb_typeof(snapshot.metrics) = 'array'
    and jsonb_typeof(snapshot.relationships) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements_text(selection.field_ids) selected(field_id)
      where not exists (
        select 1 from jsonb_array_elements(snapshot.fields) field
        where field ->> 'id' = selected.field_id
      )
    )
    and not exists (
      select 1
      from jsonb_array_elements_text(selection.metric_ids) selected(metric_id)
      where not exists (
        select 1 from jsonb_array_elements(snapshot.metrics) metric
        where metric ->> 'id' = selected.metric_id
      )
    )
    and not exists (
      select 1
      from jsonb_array_elements_text(selection.relationship_ids) selected(relationship_id)
      where not exists (
        select 1 from jsonb_array_elements(snapshot.relationships) relationship
        where relationship ->> 'id' = selected.relationship_id
      )
    )
    and not exists (
      select 1
      from jsonb_array_elements(snapshot.metrics) metric
      where selection.metric_ids ? (metric ->> 'id')
        and (
          nullif(metric #>> '{expression,fieldId}', '') is null
          or not exists (
            select 1 from jsonb_array_elements(snapshot.fields) field
            where field ->> 'id' = metric #>> '{expression,fieldId}'
          )
        )
    )
  from selection, snapshot;
$$;

revoke all on function dashboard_release_semantic_snapshot_is_valid(jsonb, jsonb) from public, anon, authenticated;

create or replace function enforce_dashboard_release_semantic_snapshot_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not dashboard_release_semantic_snapshot_is_valid(new.dataset_config, new.semantic_snapshot) then
    raise exception 'Release dataset snapshot contains stale or incomplete semantic references'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function enforce_dashboard_release_semantic_snapshot_integrity() from public, anon, authenticated;

drop trigger if exists dashboard_release_dataset_snapshot_integrity
on dashboard_release_dataset_snapshots;

create trigger dashboard_release_dataset_snapshot_integrity
before insert on dashboard_release_dataset_snapshots
for each row execute function enforce_dashboard_release_semantic_snapshot_integrity();

comment on function dashboard_release_semantic_snapshot_is_valid(jsonb, jsonb) is
  'Checks that every governed dataset selection and metric source field exists in the immutable semantic snapshot.';

comment on trigger dashboard_release_dataset_snapshot_integrity on dashboard_release_dataset_snapshots is
  'Rejects publication when a release would capture stale semantic UUID references.';
