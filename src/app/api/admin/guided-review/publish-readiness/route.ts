import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { evaluateGuidedPublishReadinessForProject } from '@/lib/dashboardos/guided-publish-readiness-server'
import { accessContext, requireProjectAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const QuerySchema = z.object({
  projectId: z.string().uuid(),
  dashboardId: z.string().uuid().optional().nullable(),
  versionId: z.string().uuid().optional().nullable(),
}).strict()

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ readiness: null, metadata: null, error: 'Unauthorized' }, { status: 401 })

    const parsed = QuerySchema.safeParse({
      projectId: req.nextUrl.searchParams.get('projectId'),
      dashboardId: req.nextUrl.searchParams.get('dashboardId'),
      versionId: req.nextUrl.searchParams.get('versionId'),
    })
    if (!parsed.success) {
      return NextResponse.json({ readiness: null, metadata: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireProjectAccess({
      ...accessContext(auth),
      projectId: parsed.data.projectId,
    })
    if (!access.ok) {
      return NextResponse.json({ readiness: null, metadata: null, error: access.error }, { status: access.status })
    }

    const result = await evaluateGuidedPublishReadinessForProject({
      supabase: auth.supabase,
      projectId: parsed.data.projectId,
      selectedDashboardId: parsed.data.dashboardId ?? null,
      selectedVersionId: parsed.data.versionId ?? null,
    })

    return NextResponse.json({
      readiness: result.readiness,
      metadata: result.metadata,
      persistence: {
        strategy: 'recomputed',
        note: 'Preflight is read-only and recomputed on demand. Publish-time validation remains authoritative.',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ readiness: null, metadata: null, error: message }, { status: 500 })
  }
}
