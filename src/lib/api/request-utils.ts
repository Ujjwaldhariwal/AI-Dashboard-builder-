export interface EndpointRequestOptions {
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: unknown
}

export function buildEndpointRequestInit({
  method,
  headers,
  body,
}: EndpointRequestOptions): RequestInit {
  const normalizedMethod = method.toUpperCase() as 'GET' | 'POST'
  const init: RequestInit = {
    method: normalizedMethod,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
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

