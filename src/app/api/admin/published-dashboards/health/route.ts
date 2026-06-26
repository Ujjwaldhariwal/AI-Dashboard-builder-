import { NextRequest, NextResponse } from 'next/server'

import { auditPublishedDashboards, recordDashboardHealthRuns } from '@/lib/publishing/dashboard-health-auditor'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

async function requireHealthAccess({
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
    const dashboardId = req.nextUrl.searchParams.get('dashboardId')
    const access = await requireHealthAccess({ auth, projectId, tenantId })
    if (access instanceof Response) return access

    const audit = await auditPublishedDashboards({
      supabase: access.supabase,
      projectId,
      tenantId,
      dashboardId,
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
    const dashboardId = req.nextUrl.searchParams.get('dashboardId')
    const access = await requireHealthAccess({ auth, projectId, tenantId })
    if (access instanceof Response) return access

    const audit = await auditPublishedDashboards({
      supabase: access.supabase,
      projectId,
      tenantId,
      dashboardId,
    })
    const runs = await recordDashboardHealthRuns({
      supabase: access.supabase,
      audit,
      checkedBy: access.userId,
    })

    return NextResponse.json({ audit, runs }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ audit: null, runs: [], error: message }, { status: 500 })
  }
}
