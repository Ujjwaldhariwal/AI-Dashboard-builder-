import { NextResponse } from 'next/server'
import { z } from 'zod'

import { runPublishedChartRequest } from '@/lib/client/published-chart-run-server'

const RequestSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(120),
  chartId: z.string().trim().min(1).max(120),
}).strict()

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({
      result: null,
      error: 'A valid tenant slug and released chart ID are required.',
    }, { status: 400 })
  }

  return runPublishedChartRequest({
    tenantSlug: parsed.data.tenantSlug,
    id: parsed.data.chartId,
  })
}
