import { NextRequest, NextResponse } from 'next/server'

import { listPlatformAlertDeliveryAttempts } from '@/lib/alerts/alert-delivery'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

function clampLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(200, Math.max(1, Math.trunc(parsed)))
}

async function requireDeliveryAccess({
  auth,
  tenantId,
  projectId,
}: {
  auth: Awaited<ReturnType<typeof getAuthedSupabase>>
  tenantId: string | null
  projectId: string | null
}) {
  if (!auth) return NextResponse.json({ deliveries: [], error: 'Unauthorized' }, { status: 401 })

  const access = accessContext(auth)
  if (projectId) {
    const projectAccess = await requireProjectAccess({
      ...access,
      tenantId: tenantId ?? undefined,
      projectId,
    })
    if (!projectAccess.ok) {
      return NextResponse.json({ deliveries: [], error: projectAccess.error }, { status: projectAccess.status })
    }
  } else if (tenantId) {
    const tenantAccess = await requireTenantAccess({ ...access, tenantId })
    if (!tenantAccess.ok) {
      return NextResponse.json({ deliveries: [], error: tenantAccess.error }, { status: tenantAccess.status })
    }
  } else if (auth.role !== 'admin') {
    return NextResponse.json({ deliveries: [], error: 'tenantId or projectId is required' }, { status: 400 })
  }

  return auth
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const alertId = req.nextUrl.searchParams.get('alertId')
    const access = await requireDeliveryAccess({ auth, tenantId, projectId })
    if (access instanceof Response) return access

    const deliveries = await listPlatformAlertDeliveryAttempts({
      supabase: access.supabase,
      tenantId,
      projectId,
      alertId,
      limit: clampLimit(req.nextUrl.searchParams.get('limit')),
    })

    return NextResponse.json({ deliveries })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ deliveries: [], error: message }, { status: 500 })
  }
}
