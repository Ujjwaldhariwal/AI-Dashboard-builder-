import { legacyRouteGone } from '@/lib/legacy/legacy-route-response'

export async function POST() {
  return legacyRouteGone({
    replacement: '/api/admin/semantic-models',
    reason: 'Endpoint mapping feedback depended on removed training tables. Capture governed business fields and metrics in semantic models instead.',
  })
}
