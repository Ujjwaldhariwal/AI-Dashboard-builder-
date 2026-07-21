import { NextRequest, NextResponse } from 'next/server'

import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { DataSourceSchemaProfileSummary } from '@/types/data-source'

function missingProfileTable(message: string) {
  return /relation .*data_source_schema_profiles.* does not exist|could not find the table .*data_source_schema_profiles.*schema cache/i.test(message)
}

function mapSummary(row: Record<string, unknown>): DataSourceSchemaProfileSummary {
  const summary = row.summary && typeof row.summary === 'object' && !Array.isArray(row.summary)
    ? row.summary as Record<string, unknown>
    : {}
  return {
    dataSourceId: String(row.data_source_id),
    schemaHash: String(row.schema_hash),
    profileVersion: Number(row.profile_version ?? 1),
    selectedSchemas: Array.isArray(row.selected_schemas) ? row.selected_schemas.map(String) : ['public'],
    generatedAt: String(row.generated_at ?? row.updated_at ?? new Date().toISOString()),
    tableCount: Number(summary.tableCount ?? 0),
    columnCount: Number(summary.columnCount ?? 0),
    profiledColumnCount: Number(summary.profiledColumnCount ?? 0),
    sensitiveColumnCount: Number(summary.sensitiveColumnCount ?? 0),
    explicitJoinCount: Number(summary.explicitJoinCount ?? 0),
    inferredJoinCount: Number(summary.inferredJoinCount ?? 0),
    warningCount: Number(summary.warningCount ?? 0),
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ profiles: [], available: false, error: 'Unauthorized' }, { status: 401 })

    const projectId = request.nextUrl.searchParams.get('projectId')
    if (projectId) {
      const access = await requireProjectAccess({ ...accessContext(auth), projectId })
      if (!access.ok) return NextResponse.json({ profiles: [], available: false, error: access.error }, { status: access.status })
    }

    let query = auth.supabase
      .from('data_source_schema_profiles')
      .select('data_source_id, schema_hash, profile_version, selected_schemas, summary, generated_at, updated_at')
      .order('generated_at', { ascending: false })
      .limit(1000)
    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) {
      if (missingProfileTable(error.message)) return NextResponse.json({ profiles: [], available: false })
      return NextResponse.json({ profiles: [], available: false, error: error.message }, { status: 500 })
    }

    const latestBySource = new Map<string, DataSourceSchemaProfileSummary>()
    for (const row of data ?? []) {
      const mapped = mapSummary(row as Record<string, unknown>)
      if (!latestBySource.has(mapped.dataSourceId)) latestBySource.set(mapped.dataSourceId, mapped)
    }
    return NextResponse.json({ profiles: Array.from(latestBySource.values()), available: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ profiles: [], available: false, error: message }, { status: 500 })
  }
}
