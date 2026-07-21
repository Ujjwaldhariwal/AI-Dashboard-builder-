alter table data_sources
  add column if not exists schema_object_count int not null default 0,
  add column if not exists schema_base_table_count int not null default 0,
  add column if not exists schema_view_count int not null default 0,
  add column if not exists schema_included_object_count int not null default 0,
  add column if not exists schema_included_column_count int not null default 0,
  add column if not exists schema_excluded_object_count int not null default 0,
  add column if not exists schema_review_object_count int not null default 0,
  add column if not exists schema_scope_status text not null default 'unconfirmed'
    check (schema_scope_status in ('unconfirmed', 'confirmed', 'review_required'));

create unique index if not exists idx_data_sources_scoped_identity
on data_sources (id, tenant_id, project_id);

create table if not exists data_source_relations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  data_source_id uuid not null references data_sources(id) on delete cascade,
  schema_name text not null,
  relation_name text not null,
  relation_type text not null check (relation_type in ('table', 'partitioned_table', 'view', 'materialized_view', 'foreign_table')),
  column_count int not null default 0 check (column_count >= 0),
  estimated_row_count bigint,
  comment text,
  fingerprint text not null,
  classification text not null check (classification in ('business_candidate', 'internal', 'needs_review')),
  reason_code text not null,
  reason text not null,
  is_available boolean not null default true,
  first_discovered_at timestamptz not null default now(),
  last_discovered_at timestamptz not null default now(),
  unique (data_source_id, schema_name, relation_name),
  unique (id, tenant_id, project_id, data_source_id),
  constraint data_source_relations_project_scope
    foreign key (data_source_id, tenant_id, project_id)
    references data_sources(id, tenant_id, project_id)
    on delete cascade
);

create index if not exists idx_data_source_relations_source_available
on data_source_relations (data_source_id, is_available, schema_name, relation_name);

create table if not exists data_source_relation_selections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references dashboard_projects(id) on delete cascade,
  data_source_id uuid not null references data_sources(id) on delete cascade,
  relation_id uuid not null references data_source_relations(id) on delete cascade,
  status text not null check (status in ('included', 'excluded', 'review')),
  decision_source text not null check (decision_source in ('system_rule', 'user', 'compatibility_migration')),
  reason_code text not null,
  reason_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  inventory_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (relation_id),
  constraint data_source_relation_selections_scope
    foreign key (relation_id, tenant_id, project_id, data_source_id)
    references data_source_relations(id, tenant_id, project_id, data_source_id)
    on delete cascade
);

create index if not exists idx_data_source_relation_selections_source_status
on data_source_relation_selections (data_source_id, status);

alter table data_source_columns
  add column if not exists relation_id uuid references data_source_relations(id) on delete cascade;

create index if not exists idx_data_source_columns_relation
on data_source_columns (relation_id);

alter table data_source_relations enable row level security;
alter table data_source_relation_selections enable row level security;

grant select, insert, update on data_source_relations to authenticated;
grant select, insert, update on data_source_relation_selections to authenticated;
grant all on data_source_relations, data_source_relation_selections to service_role;

drop policy if exists "data source relations readable by project access" on data_source_relations;
drop policy if exists "data source relations writable by project editors" on data_source_relations;
drop policy if exists "data source selections readable by project access" on data_source_relation_selections;
drop policy if exists "data source selections writable by project editors" on data_source_relation_selections;

create policy "data source relations readable by project access"
on data_source_relations for select to authenticated
using (has_project_access(project_id) and has_tenant_access(tenant_id));

create policy "data source relations writable by project editors"
on data_source_relations for all to authenticated
using (can_publish_project(project_id) and has_tenant_access(tenant_id))
with check (can_publish_project(project_id) and has_tenant_access(tenant_id));

create policy "data source selections readable by project access"
on data_source_relation_selections for select to authenticated
using (has_project_access(project_id) and has_tenant_access(tenant_id));

create policy "data source selections writable by project editors"
on data_source_relation_selections for all to authenticated
using (can_publish_project(project_id) and has_tenant_access(tenant_id))
with check (can_publish_project(project_id) and has_tenant_access(tenant_id));

insert into data_source_relations (
  tenant_id, project_id, data_source_id, schema_name, relation_name, relation_type,
  column_count, fingerprint, classification, reason_code, reason,
  is_available, first_discovered_at, last_discovered_at
)
select
  column_row.tenant_id,
  column_row.project_id,
  column_row.data_source_id,
  column_row.schema_name,
  column_row.table_name,
  'table',
  count(*)::int,
  md5(string_agg(column_row.column_name || ':' || column_row.data_type || ':' || column_row.ordinal_position::text, '|' order by column_row.ordinal_position)),
  'business_candidate',
  'compatibility_migration',
  'Included temporarily to preserve existing dashboards until scope review.',
  true,
  min(column_row.created_at),
  now()
from data_source_columns column_row
group by column_row.tenant_id, column_row.project_id, column_row.data_source_id, column_row.schema_name, column_row.table_name
on conflict (data_source_id, schema_name, relation_name) do nothing;

insert into data_source_relation_selections (
  tenant_id, project_id, data_source_id, relation_id, status, decision_source,
  reason_code, reason_note, decided_at, inventory_fingerprint
)
select
  relation.tenant_id,
  relation.project_id,
  relation.data_source_id,
  relation.id,
  'included',
  'compatibility_migration',
  'compatibility_migration',
  'Included temporarily to preserve existing dashboards until scope review.',
  now(),
  relation.fingerprint
from data_source_relations relation
on conflict (relation_id) do nothing;

update data_source_columns column_row
set relation_id = relation.id
from data_source_relations relation
where column_row.relation_id is null
  and relation.data_source_id = column_row.data_source_id
  and relation.schema_name = column_row.schema_name
  and relation.relation_name = column_row.table_name;

update data_sources source
set
  schema_object_count = summary.object_count,
  schema_base_table_count = summary.table_count,
  schema_view_count = summary.view_count,
  schema_included_object_count = summary.included_count,
  schema_included_column_count = summary.included_columns,
  schema_excluded_object_count = summary.excluded_count,
  schema_review_object_count = summary.review_count,
  schema_scope_status = case when summary.object_count > 0 then 'confirmed' else 'unconfirmed' end
from (
  select
    relation.data_source_id,
    count(*) filter (where relation.is_available)::int as object_count,
    count(*) filter (where relation.is_available and relation.relation_type in ('table', 'partitioned_table'))::int as table_count,
    count(*) filter (where relation.is_available and relation.relation_type in ('view', 'materialized_view'))::int as view_count,
    count(*) filter (where relation.is_available and selection.status = 'included')::int as included_count,
    coalesce(sum(relation.column_count) filter (where relation.is_available and selection.status = 'included'), 0)::int as included_columns,
    count(*) filter (where relation.is_available and selection.status = 'excluded')::int as excluded_count,
    count(*) filter (where relation.is_available and selection.status = 'review')::int as review_count
  from data_source_relations relation
  join data_source_relation_selections selection on selection.relation_id = relation.id
  group by relation.data_source_id
) summary
where source.id = summary.data_source_id;

create or replace function apply_data_source_schema_inventory_atomic(
  p_data_source_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_columns jsonb,
  p_relations jsonb,
  p_schema_hash text,
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
  v_column_count int := 0;
  v_object_count int := 0;
  v_table_count int := 0;
  v_view_count int := 0;
  v_included_count int := 0;
  v_included_columns int := 0;
  v_excluded_count int := 0;
  v_review_count int := 0;
begin
  if jsonb_typeof(p_columns) is distinct from 'array' or jsonb_typeof(p_relations) is distinct from 'array' then
    raise exception 'Schema columns and relations must be JSON arrays' using errcode = '22023';
  end if;

  select * into v_source
  from data_sources
  where id = p_data_source_id and tenant_id = p_tenant_id and project_id = p_project_id
  for update;

  if not found then
    raise exception 'Data source not found for the requested tenant/project scope' using errcode = 'P0002';
  end if;

  update data_source_relations
  set is_available = false, last_discovered_at = p_introspected_at
  where data_source_id = p_data_source_id and tenant_id = p_tenant_id and project_id = p_project_id;

  insert into data_source_relations (
    tenant_id, project_id, data_source_id, schema_name, relation_name, relation_type,
    column_count, estimated_row_count, comment, fingerprint, classification,
    reason_code, reason, is_available, first_discovered_at, last_discovered_at
  )
  select
    p_tenant_id, p_project_id, p_data_source_id,
    relation_row.schema_name, relation_row.relation_name, relation_row.relation_type,
    relation_row.column_count, relation_row.estimated_row_count, relation_row.comment,
    relation_row.fingerprint, relation_row.classification, relation_row.reason_code,
    relation_row.reason, true, p_introspected_at, p_introspected_at
  from jsonb_to_recordset(p_relations) as relation_row(
    schema_name text,
    relation_name text,
    relation_type text,
    column_count int,
    estimated_row_count bigint,
    comment text,
    fingerprint text,
    classification text,
    suggested_status text,
    reason_code text,
    reason text
  )
  on conflict (data_source_id, schema_name, relation_name) do update set
    relation_type = excluded.relation_type,
    column_count = excluded.column_count,
    estimated_row_count = excluded.estimated_row_count,
    comment = excluded.comment,
    fingerprint = excluded.fingerprint,
    classification = excluded.classification,
    reason_code = excluded.reason_code,
    reason = excluded.reason,
    is_available = true,
    last_discovered_at = excluded.last_discovered_at;

  insert into data_source_relation_selections (
    tenant_id, project_id, data_source_id, relation_id, status, decision_source,
    reason_code, reason_note, inventory_fingerprint, created_at, updated_at
  )
  select
    relation.tenant_id, relation.project_id, relation.data_source_id, relation.id,
    case when relation.classification = 'internal' then 'excluded' else 'review' end,
    'system_rule', relation.reason_code, relation.reason, relation.fingerprint,
    p_introspected_at, p_introspected_at
  from data_source_relations relation
  where relation.data_source_id = p_data_source_id and relation.is_available
  on conflict (relation_id) do nothing;

  update data_source_relation_selections selection
  set
    status = case when relation.classification = 'internal' then 'excluded' else 'review' end,
    decision_source = 'system_rule',
    reason_code = case when relation.classification = 'internal' then relation.reason_code else 'schema_changed' end,
    reason_note = case when relation.classification = 'internal' then relation.reason else 'The relation structure changed and must be confirmed again.' end,
    decided_by = null,
    decided_at = null,
    inventory_fingerprint = relation.fingerprint,
    updated_at = p_introspected_at
  from data_source_relations relation
  where selection.relation_id = relation.id
    and relation.data_source_id = p_data_source_id
    and relation.is_available
    and selection.inventory_fingerprint is distinct from relation.fingerprint;

  delete from data_source_columns
  where data_source_id = p_data_source_id and tenant_id = p_tenant_id and project_id = p_project_id;

  insert into data_source_columns (
    tenant_id, project_id, data_source_id, relation_id, schema_name, table_name,
    column_name, ordinal_position, data_type, udt_name, is_nullable, column_default
  )
  select
    p_tenant_id, p_project_id, p_data_source_id, relation.id,
    column_row.schema_name, column_row.table_name, column_row.column_name,
    column_row.ordinal_position, column_row.data_type, column_row.udt_name,
    column_row.is_nullable, column_row.column_default
  from jsonb_to_recordset(p_columns) as column_row(
    schema_name text,
    table_name text,
    column_name text,
    ordinal_position int,
    data_type text,
    udt_name text,
    is_nullable boolean,
    column_default text
  )
  join data_source_relations relation
    on relation.data_source_id = p_data_source_id
   and relation.schema_name = column_row.schema_name
   and relation.relation_name = column_row.table_name
   and relation.is_available;

  get diagnostics v_column_count = row_count;

  select
    count(*)::int,
    count(*) filter (where relation.relation_type in ('table', 'partitioned_table'))::int,
    count(*) filter (where relation.relation_type in ('view', 'materialized_view'))::int,
    count(*) filter (where selection.status = 'included')::int,
    coalesce(sum(relation.column_count) filter (where selection.status = 'included'), 0)::int,
    count(*) filter (where selection.status = 'excluded')::int,
    count(*) filter (where selection.status = 'review')::int
  into v_object_count, v_table_count, v_view_count, v_included_count,
       v_included_columns, v_excluded_count, v_review_count
  from data_source_relations relation
  join data_source_relation_selections selection on selection.relation_id = relation.id
  where relation.data_source_id = p_data_source_id and relation.is_available;

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
    schema_table_count = v_object_count,
    schema_column_count = v_column_count,
    schema_object_count = v_object_count,
    schema_base_table_count = v_table_count,
    schema_view_count = v_view_count,
    schema_included_object_count = v_included_count,
    schema_included_column_count = v_included_columns,
    schema_excluded_object_count = v_excluded_count,
    schema_review_object_count = v_review_count,
    schema_scope_status = case when v_review_count > 0 then 'review_required' else 'confirmed' end,
    schema_refresh_after = p_refresh_after,
    schema_refresh_requested_at = null,
    schema_refresh_reason = null,
    updated_at = p_introspected_at
  where id = p_data_source_id and tenant_id = p_tenant_id and project_id = p_project_id;

  return jsonb_build_object(
    'discoveredObjectCount', v_object_count,
    'discoveredTableCount', v_table_count,
    'discoveredViewCount', v_view_count,
    'discoveredColumnCount', v_column_count,
    'includedObjectCount', v_included_count,
    'includedColumnCount', v_included_columns,
    'excludedObjectCount', v_excluded_count,
    'reviewObjectCount', v_review_count,
    'scopeStatus', case when v_review_count > 0 then 'review_required' else 'confirmed' end
  );
end;
$$;

create or replace function confirm_data_source_schema_selection(
  p_data_source_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_inventory_hash text,
  p_decisions jsonb,
  p_decided_by uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source data_sources%rowtype;
  v_available_count int;
  v_decision_count int;
  v_included_count int;
  v_included_columns int;
  v_excluded_count int;
begin
  if jsonb_typeof(p_decisions) is distinct from 'array' then
    raise exception 'Schema selection decisions must be a JSON array' using errcode = '22023';
  end if;

  select * into v_source
  from data_sources
  where id = p_data_source_id and tenant_id = p_tenant_id and project_id = p_project_id
  for update;

  if not found then
    raise exception 'Data source not found for the requested tenant/project scope' using errcode = 'P0002';
  end if;
  if v_source.schema_hash is distinct from p_inventory_hash then
    raise exception 'Schema inventory changed; reload before confirming selection' using errcode = '40001';
  end if;

  select count(*)::int into v_available_count
  from data_source_relations
  where data_source_id = p_data_source_id and is_available;

  select count(distinct decision.relation_id)::int into v_decision_count
  from jsonb_to_recordset(p_decisions) as decision(relation_id uuid, status text)
  join data_source_relations relation
    on relation.id = decision.relation_id
   and relation.data_source_id = p_data_source_id
   and relation.is_available
  where decision.status in ('included', 'excluded');

  if v_decision_count <> jsonb_array_length(p_decisions) then
    raise exception 'Each relation must have exactly one valid decision' using errcode = '22023';
  end if;
  if v_decision_count <> v_available_count then
    raise exception 'Confirm every currently available relation as included or excluded' using errcode = '22023';
  end if;

  update data_source_relation_selections selection
  set
    status = decision.status,
    decision_source = 'user',
    reason_code = 'user_confirmed',
    reason_note = case when decision.status = 'included' then 'Included in analytics scope by user.' else 'Excluded from analytics scope by user.' end,
    decided_by = p_decided_by,
    decided_at = now(),
    inventory_fingerprint = relation.fingerprint,
    updated_at = now()
  from jsonb_to_recordset(p_decisions) as decision(relation_id uuid, status text)
  join data_source_relations relation on relation.id = decision.relation_id
  where selection.relation_id = decision.relation_id
    and relation.data_source_id = p_data_source_id
    and relation.is_available
    and decision.status in ('included', 'excluded');

  select
    count(*) filter (where selection.status = 'included')::int,
    coalesce(sum(relation.column_count) filter (where selection.status = 'included'), 0)::int,
    count(*) filter (where selection.status = 'excluded')::int
  into v_included_count, v_included_columns, v_excluded_count
  from data_source_relations relation
  join data_source_relation_selections selection on selection.relation_id = relation.id
  where relation.data_source_id = p_data_source_id and relation.is_available;

  update data_sources
  set
    schema_included_object_count = v_included_count,
    schema_included_column_count = v_included_columns,
    schema_excluded_object_count = v_excluded_count,
    schema_review_object_count = 0,
    schema_scope_status = 'confirmed',
    updated_at = now()
  where id = p_data_source_id and tenant_id = p_tenant_id and project_id = p_project_id;

  return jsonb_build_object(
    'includedObjectCount', v_included_count,
    'includedColumnCount', v_included_columns,
    'excludedObjectCount', v_excluded_count,
    'reviewObjectCount', 0,
    'scopeStatus', 'confirmed'
  );
end;
$$;

revoke all on function apply_data_source_schema_inventory_atomic(uuid, uuid, uuid, jsonb, jsonb, text, timestamptz, timestamptz) from public;
revoke all on function confirm_data_source_schema_selection(uuid, uuid, uuid, text, jsonb, uuid) from public;
grant execute on function apply_data_source_schema_inventory_atomic(uuid, uuid, uuid, jsonb, jsonb, text, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function confirm_data_source_schema_selection(uuid, uuid, uuid, text, jsonb, uuid) to authenticated, service_role;

comment on table data_source_relations is 'Raw current and historical relation inventory discovered from governed data sources.';
comment on table data_source_relation_selections is 'User-governed analytics scope kept separate from raw schema discovery.';
