import { NextResponse } from 'next/server'
import { z } from 'zod'

import { runDraftChartRequest } from '@/lib/client/draft-chart-run-server'

const RequestSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(120),
  releaseChartId: z.string().trim().min(1).max(120),
  sourceChartId: z.string().trim().min(1).max(120),
}).strict()

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({
      result: null,
      error: 'A valid tenant slug, released chart ID, and source chart ID are required.',
    }, { status: 400 })
  }

  return runDraftChartRequest(parsed.data)
}
