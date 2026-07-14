import { legacyRouteGone } from '@/lib/legacy/legacy-route-response'

export async function POST() {
  return legacyRouteGone({
    replacement: '/api/admin/datasets',
    reason: 'Endpoint transform blueprints belonged to the retired API endpoint widget builder. Use semantic datasets and governed chart configs instead.',
  })
}
