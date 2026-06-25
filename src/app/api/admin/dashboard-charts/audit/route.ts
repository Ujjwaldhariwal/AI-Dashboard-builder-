import { NextRequest, NextResponse } from 'next/server'

import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { auditDashboardCharts } from '@/lib/semantic/chart-health-auditor'
import { getAuthedSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ audit: null, error: 'Unauthorized' }, { status: 401 })

    const projectId = req.nextUrl.searchParams.get('projectId')
    const tenantId = req.nextUrl.searchParams.get('tenantId')
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

    const audit = await auditDashboardCharts({
      supabase: auth.supabase,
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
