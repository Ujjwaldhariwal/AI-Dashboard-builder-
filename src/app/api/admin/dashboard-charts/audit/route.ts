import { NextRequest, NextResponse } from 'next/server'

import { auditDashboardCharts } from '@/lib/semantic/chart-health-auditor'
import { getAuthedSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ audit: null, error: 'Unauthorized' }, { status: 401 })

    const audit = await auditDashboardCharts({
      supabase: auth.supabase,
      projectId: req.nextUrl.searchParams.get('projectId'),
      tenantId: req.nextUrl.searchParams.get('tenantId'),
      status: req.nextUrl.searchParams.get('status') ?? 'published',
    })

    return NextResponse.json({ audit })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ audit: null, error: message }, { status: 500 })
  }
}
