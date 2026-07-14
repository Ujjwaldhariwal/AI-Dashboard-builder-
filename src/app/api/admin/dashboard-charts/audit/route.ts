import { NextRequest, NextResponse } from 'next/server'

import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { auditDashboardCharts } from '@/lib/semantic/chart-health-auditor'
import { recordChartHealthRun } from '@/lib/semantic/chart-health-run-recorder'
import { getAuthedSupabase } from '@/lib/supabase/server'

async function requireAuditAccess({
  auth,
  projectId,
  tenantId,
}: {
  auth: Awaited<ReturnType<typeof getAuthedSupabase>>
  projectId: string | null
  tenantId: string | null
}) {
  if (!auth) return NextResponse.json({ audit: null, error: 'Unauthorized' }, { status: 401 })

  const access = accessContext(auth)
  if (projectId) {
    const projectAccess = await requireProjectAccess({ ...access, projectId, tenantId: tenantId ?? undefined })
    if (!projectAccess.ok) {
      return NextResponse.json({ audit: null, error: projectAccess.error }, { status: projectAccess.status })
    }
  } else if (tenantId) {
    const tenantAccess = await requireTenantAccess({ ...access, tenantId })
    if (!tenantAccess.ok) {
      return NextResponse.json({ audit: null, error: tenantAccess.error }, { status: tenantAccess.status })
    }
  }

  return auth
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    const projectId = req.nextUrl.searchParams.get('projectId')
    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const access = await requireAuditAccess({ auth, projectId, tenantId })
    if (access instanceof Response) return access

    const audit = await auditDashboardCharts({
      supabase: access.supabase,
      projectId,
      tenantId,
      status: req.nextUrl.searchParams.get('status') ?? 'published',
    })

    return NextResponse.json({ audit })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ audit: null, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    const projectId = req.nextUrl.searchParams.get('projectId')
    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const status = req.nextUrl.searchParams.get('status') ?? 'published'
    const access = await requireAuditAccess({ auth, projectId, tenantId })
    if (access instanceof Response) return access

    const audit = await auditDashboardCharts({
      supabase: access.supabase,
      projectId,
      tenantId,
      status,
    })
    const run = await recordChartHealthRun({
      supabase: access.supabase,
      audit,
      checkedBy: access.userId,
      tenantId,
      projectId,
      statusFilter: status,
    })

    return NextResponse.json({ audit, run }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ audit: null, run: null, error: message }, { status: 500 })
  }
}
