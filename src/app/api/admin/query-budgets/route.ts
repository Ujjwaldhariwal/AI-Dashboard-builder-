import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { listQueryBudgetPolicies, upsertQueryBudgetPolicy } from '@/lib/semantic/query-budget-policy'
import { getAuthedSupabase } from '@/lib/supabase/server'

const QueryBudgetSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  dataSourceId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(120),
  enabled: z.boolean().default(true),
  period: z.enum(['daily', 'monthly']),
  maxQueries: z.coerce.number().int().min(1).max(1_000_000),
  maxRows: z.coerce.number().int().min(1).max(1_000_000_000).nullable().optional(),
  maxElapsedMs: z.coerce.number().int().min(1).max(86_400_000).nullable().optional(),
}).strict()

function clampLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(200, Math.max(1, Math.trunc(parsed)))
}

async function requireBudgetAccess({
  auth,
  tenantId,
  projectId,
  editor = false,
}: {
  auth: Awaited<ReturnType<typeof getAuthedSupabase>>
  tenantId: string | null
  projectId: string | null
  editor?: boolean
}) {
  if (!auth) return NextResponse.json({ policies: [], error: 'Unauthorized' }, { status: 401 })

  const access = accessContext(auth)
  if (projectId) {
    const projectAccess = await requireProjectAccess({
      ...access,
      tenantId: tenantId ?? undefined,
      projectId,
      editor,
    })
    if (!projectAccess.ok) {
      return NextResponse.json({ policies: [], error: projectAccess.error }, { status: projectAccess.status })
    }
  } else if (tenantId) {
    const tenantAccess = await requireTenantAccess({ ...access, tenantId, editor })
    if (!tenantAccess.ok) {
      return NextResponse.json({ policies: [], error: tenantAccess.error }, { status: tenantAccess.status })
    }
  } else if (auth.role !== 'admin') {
    return NextResponse.json({ policies: [], error: 'tenantId or projectId is required' }, { status: 400 })
  }

  return auth
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const dataSourceId = req.nextUrl.searchParams.get('dataSourceId')
    const enabledParam = req.nextUrl.searchParams.get('enabled')
    const enabled = enabledParam === 'true' ? true : enabledParam === 'false' ? false : null
    const access = await requireBudgetAccess({ auth, tenantId, projectId })
    if (access instanceof Response) return access

    const policies = await listQueryBudgetPolicies({
      supabase: access.supabase,
      tenantId,
      projectId,
      dataSourceId,
      enabled,
      limit: clampLimit(req.nextUrl.searchParams.get('limit')),
    })

    return NextResponse.json({ policies })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ policies: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ policy: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = QueryBudgetSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ policy: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const projectId = parsed.data.projectId ?? null
    const access = await requireBudgetAccess({
      auth,
      tenantId: parsed.data.tenantId,
      projectId,
      editor: true,
    })
    if (access instanceof Response) {
      const body = await access.json().catch(() => ({ error: 'Forbidden' }))
      return NextResponse.json({ policy: null, error: body.error ?? 'Forbidden' }, { status: access.status })
    }

    const policy = await upsertQueryBudgetPolicy({
      supabase: access.supabase,
      tenantId: parsed.data.tenantId,
      projectId,
      dataSourceId: parsed.data.dataSourceId ?? null,
      name: parsed.data.name.trim(),
      enabled: parsed.data.enabled,
      period: parsed.data.period,
      maxQueries: parsed.data.maxQueries,
      maxRows: parsed.data.maxRows ?? null,
      maxElapsedMs: parsed.data.maxElapsedMs ?? null,
      createdBy: access.userId,
    })

    return NextResponse.json({ policy }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ policy: null, error: message }, { status: 500 })
  }
}
