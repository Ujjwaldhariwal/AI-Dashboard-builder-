import { NextResponse } from 'next/server'
import { z } from 'zod'

import { loadDataSourceSchemaInventory } from '@/lib/data-sources/schema-inventory-store'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { invalidateSemanticDependentsForDataSource } from '@/lib/semantic/semantic-hardening'
import { getAuthedSupabase } from '@/lib/supabase/server'

const SelectionSchema = z.object({
  inventoryHash: z.string().min(1),
  decisions: z.array(z.object({
    relationId: z.string().uuid(),
    status: z.enum(['included', 'excluded']),
  }).strict()).min(1),
}).strict().superRefine((value, context) => {
  const relationIds = value.decisions.map(decision => decision.relationId)
  if (new Set(relationIds).size !== relationIds.length) {
    context.addIssue({ code: 'custom', path: ['decisions'], message: 'Each relation must have exactly one decision' })
  }
})

function isMissingSelectionRpc(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === 'PGRST202' || /confirm_data_source_schema_selection.*(function|schema cache)/i.test(error?.message ?? '')
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ inventory: null, error: 'Unauthorized' }, { status: 401 })

    const parsed = SelectionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ inventory: null, error: parsed.error.flatten() }, { status: 400 })

    const { data: source, error } = await auth.supabase
      .from('data_sources')
      .select('tenant_id, project_id')
      .eq('id', id)
      .single()
    if (error || !source) return NextResponse.json({ inventory: null, error: error?.message ?? 'Data source not found' }, { status: 404 })

    const tenantId = String(source.tenant_id)
    const projectId = String(source.project_id)
    const access = await requireProjectAccess({ ...accessContext(auth), tenantId, projectId, editor: true })
    if (!access.ok) return NextResponse.json({ inventory: null, error: access.error }, { status: access.status })

    const before = await loadDataSourceSchemaInventory({ supabase: auth.supabase, dataSourceId: id })
    const beforeIncluded = new Set(before.relations.filter(relation => relation.available && relation.selectionStatus === 'included').map(relation => relation.id))
    const nextIncluded = new Set(parsed.data.decisions.filter(decision => decision.status === 'included').map(decision => decision.relationId))
    const scopeChanged = beforeIncluded.size !== nextIncluded.size || [...beforeIncluded].some(relationId => !nextIncluded.has(relationId))

    const result = await auth.supabase.rpc('confirm_data_source_schema_selection', {
      p_data_source_id: id,
      p_tenant_id: tenantId,
      p_project_id: projectId,
      p_inventory_hash: parsed.data.inventoryHash,
      p_decisions: parsed.data.decisions.map(decision => ({ relation_id: decision.relationId, status: decision.status })),
      p_decided_by: auth.userId,
    })
    if (result.error) {
      if (isMissingSelectionRpc(result.error)) {
        return NextResponse.json({ inventory: null, error: 'Apply the trustworthy schema inventory migration before confirming table scope.' }, { status: 503 })
      }
      const status = result.error.code === '40001' ? 409 : 400
      return NextResponse.json({ inventory: null, error: result.error.message }, { status })
    }

    if (scopeChanged) {
      await invalidateSemanticDependentsForDataSource({
        supabase: auth.supabase,
        tenantId,
        projectId,
        dataSourceId: id,
        actorUserId: auth.userId,
      })
    }

    const inventory = await loadDataSourceSchemaInventory({ supabase: auth.supabase, dataSourceId: id })
    await auth.supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      project_id: projectId,
      actor_user_id: auth.userId,
      action: 'data_source.schema_scope_confirmed',
      target_type: 'data_source',
      target_id: id,
      metadata: {
        inventoryHash: parsed.data.inventoryHash,
        includedRelationIds: parsed.data.decisions.filter(decision => decision.status === 'included').map(decision => decision.relationId),
        excludedRelationIds: parsed.data.decisions.filter(decision => decision.status === 'excluded').map(decision => decision.relationId),
        semanticScopeInvalidated: scopeChanged,
      },
      created_at: new Date().toISOString(),
    })
    return NextResponse.json({ inventory })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ inventory: null, error: message }, { status: 500 })
  }
}
