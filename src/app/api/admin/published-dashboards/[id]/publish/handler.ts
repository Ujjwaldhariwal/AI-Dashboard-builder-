import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  GovernedDashboardPublishError,
  publishDashboardVersionGoverned,
} from '@/lib/publishing/publish-dashboard-version-server'
import { getAuthedSupabase, type AuthedSupabaseContext } from '@/lib/supabase/server'

const PublishSchema = z.object({
  versionId: z.string().uuid(),
  notes: z.string().max(1000).optional().or(z.literal('')),
}).strict()

type AuthProvider = () => Promise<AuthedSupabaseContext | null>

export function createPublishedDashboardPublishPostHandler(
  authProvider: AuthProvider = getAuthedSupabase,
) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const { id: dashboardId } = await context.params

    try {
      const auth = await authProvider()
      if (!auth) {
        return NextResponse.json(
          { dashboard: null, version: null, error: 'Unauthorized' },
          { status: 401 },
        )
      }

      const parsed = PublishSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) {
        return NextResponse.json(
          { dashboard: null, version: null, error: parsed.error.flatten() },
          { status: 400 },
        )
      }

      const result = await publishDashboardVersionGoverned({
        auth,
        dashboardId,
        versionId: parsed.data.versionId,
        notes: parsed.data.notes,
      })
      return NextResponse.json(result)
    } catch (error) {
      if (error instanceof GovernedDashboardPublishError) {
        return NextResponse.json({
          dashboard: null,
          version: error.details.version ?? null,
          code: error.code,
          error: error.message,
          ...error.details,
        }, { status: error.status })
      }

      return NextResponse.json({
        dashboard: null,
        version: null,
        error: error instanceof Error ? error.message : String(error),
      }, { status: 500 })
    }
  }
}

export const POST = createPublishedDashboardPublishPostHandler()
