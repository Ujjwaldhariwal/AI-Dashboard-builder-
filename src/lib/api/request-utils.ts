import { getBuilderDemoAuthHeaders } from '@/lib/auth/demo-auth-session'

export interface EndpointRequestOptions {
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: unknown
  applyDemoAuth?: boolean
}

export function buildEndpointRequestInit({
  method,
  headers,
  body,
  applyDemoAuth = true,
}: EndpointRequestOptions): RequestInit {
  const normalizedMethod = method.toUpperCase() as 'GET' | 'POST'
  const demoAuthHeaders = applyDemoAuth ? getBuilderDemoAuthHeaders() : {}
  const init: RequestInit = {
    method: normalizedMethod,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
      ...demoAuthHeaders,
    },
  }

  if (normalizedMethod === 'POST') {
    if (body === undefined || body === null) {
      init.body = '{}'
    } else {
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
  }

  return init
}
