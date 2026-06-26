import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { listPlatformAlerts } from '@/lib/alerts/platform-alerts'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const AlertStateSchema = z.enum(['open', 'acknowledged', 'resolved'])

function clampLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(200, Math.max(1, Math.trunc(parsed)))
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ alerts: [], error: 'Unauthorized' }, { status: 401 })

    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const stateParam = req.nextUrl.searchParams.get('state')
    const state = stateParam && AlertStateSchema.safeParse(stateParam).success ? AlertStateSchema.parse(stateParam) : null
    const access = accessContext(auth)

    if (projectId) {
      const projectAccess = await requireProjectAccess({ ...access, projectId, tenantId: tenantId ?? undefined })
      if (!projectAccess.ok) {
        return NextResponse.json({ alerts: [], error: projectAccess.error }, { status: projectAccess.status })
      }
    } else if (tenantId) {
      const tenantAccess = await requireTenantAccess({ ...access, tenantId })
      if (!tenantAccess.ok) {
        return NextResponse.json({ alerts: [], error: tenantAccess.error }, { status: tenantAccess.status })
      }
    } else if (auth.role !== 'admin') {
      return NextResponse.json({ alerts: [], error: 'tenantId or projectId is required' }, { status: 400 })
    }

    const alerts = await listPlatformAlerts({
      supabase: auth.supabase,
      tenantId,
      projectId,
      state,
      limit: clampLimit(req.nextUrl.searchParams.get('limit')),
    })

    return NextResponse.json({ alerts })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ alerts: [], error: message }, { status: 500 })
  }
}
