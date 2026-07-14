import { legacyRouteGone } from '@/lib/legacy/legacy-route-response'

export async function POST() {
  return legacyRouteGone({
    replacement: '/api/admin/published-dashboards',
    reason: 'Widget persistence depended on the removed legacy widgets table. Publish governed chart configs through DashboardOS instead.',
  })
}
