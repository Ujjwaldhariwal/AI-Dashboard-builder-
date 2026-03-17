import type { DashboardEndpointProbeSummary } from '@/lib/api/endpoint-runtime-cache'

export const BUILDER_API_HEALTH_EVENT = 'builderApiHealthSummaryChanged'
export const BUILDER_API_HEALTH_RESCAN_EVENT = 'builderApiHealthRescanRequested'

export type BuilderApiHealthSummary = DashboardEndpointProbeSummary | null

export function dispatchBuilderApiHealthSummary(summary: BuilderApiHealthSummary) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<BuilderApiHealthSummary>(BUILDER_API_HEALTH_EVENT, {
      detail: summary,
    }),
  )
}

export function dispatchBuilderApiHealthRescan() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(BUILDER_API_HEALTH_RESCAN_EVENT))
}
