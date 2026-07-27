import { runPublishedChartRequest } from '@/lib/client/published-chart-run-server'

export async function POST(
  _request: Request,
  context: { params: Promise<{ tenantSlug: string; id: string }> },
) {
  const { tenantSlug, id } = await context.params
  return runPublishedChartRequest({ tenantSlug, id })
}
