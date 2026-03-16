'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { clearEndpointResponseCache } from '@/lib/api/endpoint-response-cache'
import {
  clearEndpointFailureCache,
  clearEndpointProbeCache,
  getEndpointSessionScope,
  prefetchDashboardEndpoints,
  probeDashboardEndpoints,
  type EndpointRuntimeTarget,
} from '@/lib/api/endpoint-runtime-cache'

export function useDashboardEndpointPrefetch(endpoints: EndpointRuntimeTarget[]) {
  const [sessionScope, setSessionScope] = useState(() => getEndpointSessionScope())
  const previousSessionRef = useRef(sessionScope)

  useEffect(() => {
    const listener = () => setSessionScope(getEndpointSessionScope())
    window.addEventListener('builderDemoAuthSessionChanged', listener)
    return () => window.removeEventListener('builderDemoAuthSessionChanged', listener)
  }, [])

  useEffect(() => {
    if (previousSessionRef.current === sessionScope) return
    previousSessionRef.current = sessionScope
    clearEndpointResponseCache()
    clearEndpointFailureCache()
    clearEndpointProbeCache()
  }, [sessionScope])

  const activeEndpoints = useMemo(
    () =>
      endpoints.filter(endpoint => (
        endpoint.status !== 'inactive' &&
        typeof endpoint.url === 'string' &&
        endpoint.url.trim().length > 0
      )),
    [endpoints],
  )

  useEffect(() => {
    if (activeEndpoints.length === 0) return
    void (async () => {
      await prefetchDashboardEndpoints(activeEndpoints, { sessionScope })
      await probeDashboardEndpoints(activeEndpoints, { sessionScope })
    })()
  }, [activeEndpoints, sessionScope])
}
