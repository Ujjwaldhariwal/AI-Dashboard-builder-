import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'
import type { BusinessModel, BusinessModelStatus } from '@/types/semantic-model'

const BusinessModelCreateSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(2, 'Model name is required').max(120),
  description: z.string().max(500).optional().or(z.literal('')),
}).strict()

function mapBusinessModel(row: Record<string, unknown>): BusinessModel {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    status: String(row.status ?? 'draft') as BusinessModelStatus,
    version: typeof row.version === 'number' ? row.version : Number(row.version ?? 1),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    approvedAt: typeof row.approved_at === 'string' ? row.approved_at : null,
  }
}

function isMissingSemanticSchema(message: string) {
  return /relation .*business_models.* does not exist|schema cache|could not find the table/i.test(message)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ models: [], error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const access = accessContext(auth)

    if (projectId) {
      const projectAccess = await requireProjectAccess({ ...access, projectId, tenantId: tenantId ?? undefined })
      if (!projectAccess.ok) {
        return NextResponse.json({ models: [], error: projectAccess.error }, { status: projectAccess.status })
      }
    } else if (tenantId) {
      const tenantAccess = await requireTenantAccess({ ...access, tenantId })
      if (!tenantAccess.ok) {
        return NextResponse.json({ models: [], error: tenantAccess.error }, { status: tenantAccess.status })
      }
    }

    let query = auth.supabase
      .from('business_models')
      .select('*')
      .order('updated_at', { ascending: false })

    if (tenantId) query = query.eq('tenant_id', tenantId)
    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) {
      const status = isMissingSemanticSchema(error.message) ? 503 : 500
      return NextResponse.json({ models: [], error: error.message }, { status })
    }

    return NextResponse.json({
      models: (data ?? []).map(row => mapBusinessModel(row as Record<string, unknown>)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ models: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ model: null, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const parsed = BusinessModelCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ model: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      tenantId: parsed.data.tenantId,
      projectId: parsed.data.projectId,
      editor: true,
    })
    if (!access.ok) {
      return NextResponse.json({ model: null, error: access.error }, { status: access.status })
    }

    const nowIso = new Date().toISOString()
    const { data, error } = await auth.supabase
      .from('business_models')
      .insert({
        tenant_id: parsed.data.tenantId,
        project_id: parsed.data.projectId,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        status: 'draft',
        version: 1,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single()

    if (error) {
      const status = isMissingSemanticSchema(error.message) ? 503 : 400
      return NextResponse.json({ model: null, error: error.message }, { status })
    }

    const model = mapBusinessModel(data as Record<string, unknown>)

    await auth.supabase
      .from('audit_logs')
      .insert({
        tenant_id: model.tenantId,
        project_id: model.projectId,
        actor_user_id: auth.userId,
        action: 'business_model.created',
        target_type: 'business_model',
        target_id: model.id,
        metadata: { name: model.name, version: model.version },
        created_at: nowIso,
      })

    return NextResponse.json({ model }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ model: null, error: message }, { status: 500 })
  }
}
