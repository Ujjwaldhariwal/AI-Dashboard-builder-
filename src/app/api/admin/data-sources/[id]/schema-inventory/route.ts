import { NextResponse } from 'next/server'

import { isMissingSchemaInventory, loadDataSourceSchemaInventory } from '@/lib/data-sources/schema-inventory-store'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ inventory: null, error: 'Unauthorized' }, { status: 401 })

    const { data: source, error } = await auth.supabase
      .from('data_sources')
      .select('tenant_id, project_id')
      .eq('id', id)
      .single()
    if (error || !source) return NextResponse.json({ inventory: null, error: error?.message ?? 'Data source not found' }, { status: 404 })

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: String(source.tenant_id),
      projectId: String(source.project_id),
    })
    if (!access.ok) return NextResponse.json({ inventory: null, error: access.error }, { status: access.status })

    const inventory = await loadDataSourceSchemaInventory({ supabase: auth.supabase, dataSourceId: id })
    return NextResponse.json({ inventory })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({
      inventory: null,
      error: isMissingSchemaInventory(message)
        ? 'Apply the trustworthy schema inventory migration before reviewing table scope.'
        : message,
    }, { status: isMissingSchemaInventory(message) ? 503 : 500 })
  }
}
