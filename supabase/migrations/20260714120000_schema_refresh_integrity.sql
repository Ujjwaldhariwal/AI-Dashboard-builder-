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

revoke all on function apply_data_source_schema_snapshot_atomic(uuid, uuid, uuid, jsonb, text, int, int, timestamptz, timestamptz) from public;
grant execute on function apply_data_source_schema_snapshot_atomic(uuid, uuid, uuid, jsonb, text, int, int, timestamptz, timestamptz) to authenticated, service_role;

comment on function apply_data_source_schema_snapshot_atomic(uuid, uuid, uuid, jsonb, text, int, int, timestamptz, timestamptz)
is 'Atomically replaces a complete data-source column snapshot and its source metadata. RLS remains in force because the function is security invoker.';
