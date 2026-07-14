import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase, type AuthedSupabaseContext } from '@/lib/supabase/server'

const DashboardDraftSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  datasetId: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
}).strict()

export const GUIDED_DASHBOARD_GENERATION_PAUSED_CODE = 'GUIDED_DASHBOARD_GENERATION_PAUSED'

type AuthProvider = () => Promise<AuthedSupabaseContext | null>

export function createGuidedDashboardDraftPostHandler(authProvider: AuthProvider = getAuthedSupabase) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await authProvider()
      if (!auth) {
        return NextResponse.json({ dashboard: null, version: null, charts: [], error: 'Unauthorized' }, { status: 401 })
      }

      const body = await req.json().catch(() => null)
      const parsed = DashboardDraftSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ dashboard: null, version: null, charts: [], error: parsed.error.flatten() }, { status: 400 })
      }

      const access = await requireProjectAccess({
        ...accessContext(auth),
        tenantId: parsed.data.tenantId,
        projectId: parsed.data.projectId,
        editor: true,
      })
      if (!access.ok) {
        return NextResponse.json({ dashboard: null, version: null, charts: [], error: access.error }, { status: access.status })
      }

      return NextResponse.json({
        dashboard: null,
        version: null,
        charts: [],
        code: GUIDED_DASHBOARD_GENERATION_PAUSED_CODE,
        error: 'Guided dashboard generation is temporarily paused while draft chart composition is made transaction-safe and compatible with publish RLS. No objects were created.',
      }, { status: 409 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ dashboard: null, version: null, charts: [], error: message }, { status: 500 })
    }
  }
}

export const POST = createGuidedDashboardDraftPostHandler()
