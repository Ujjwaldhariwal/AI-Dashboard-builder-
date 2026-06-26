import { legacyRouteGone } from '@/lib/legacy/legacy-route-response'

export async function GET() {
  return legacyRouteGone({
    replacement: '/api/admin/dashboard-charts/audit',
    reason: 'Endpoint profiling depended on removed endpoint profile tables. Use chart validation and health audit flows instead.',
  })
}

export async function POST() {
  return legacyRouteGone({
    replacement: '/api/admin/dashboard-charts/audit',
    reason: 'Endpoint profiling depended on removed endpoint profile tables. Use chart validation and health audit flows instead.',
  })
}
