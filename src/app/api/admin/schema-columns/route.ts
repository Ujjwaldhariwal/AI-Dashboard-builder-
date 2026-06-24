import { NextRequest, NextResponse } from 'next/server'

import { getAuthedSupabase } from '@/lib/supabase/server'

function mapColumn(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    dataSourceId: String(row.data_source_id),
    schemaName: String(row.schema_name ?? ''),
    tableName: String(row.table_name ?? ''),
    columnName: String(row.column_name ?? ''),
    ordinalPosition: Number(row.ordinal_position ?? 0),
    dataType: String(row.data_type ?? ''),
    udtName: String(row.udt_name ?? ''),
    isNullable: Boolean(row.is_nullable),
    columnDefault: typeof row.column_default === 'string' ? row.column_default : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

function isMissingSchemaColumns(message: string) {
  return /relation .*data_source_columns.* does not exist|schema cache|could not find the table/i.test(message)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ columns: [], error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = req.nextUrl.searchParams.get('projectId')
    const dataSourceId = req.nextUrl.searchParams.get('dataSourceId')
    const search = req.nextUrl.searchParams.get('search')?.trim()

    let query = auth.supabase
      .from('data_source_columns')
      .select('id, tenant_id, project_id, data_source_id, schema_name, table_name, column_name, ordinal_position, data_type, udt_name, is_nullable, column_default, created_at')
      .order('schema_name', { ascending: true })
      .order('table_name', { ascending: true })
      .order('ordinal_position', { ascending: true })
      .limit(500)

    if (projectId) query = query.eq('project_id', projectId)
    if (dataSourceId) query = query.eq('data_source_id', dataSourceId)
    if (search) {
      query = query.or(`table_name.ilike.%${search}%,column_name.ilike.%${search}%,schema_name.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) {
      const status = isMissingSchemaColumns(error.message) ? 503 : 500
      return NextResponse.json({ columns: [], error: error.message }, { status })
    }

    return NextResponse.json({
      columns: (data ?? []).map(row => mapColumn(row as Record<string, unknown>)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ columns: [], error: message }, { status: 500 })
  }
}
