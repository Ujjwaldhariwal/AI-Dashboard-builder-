// src/lib/share-utils.ts

export interface SharePayload {
  dashboardId: string
  dashboardName: string
  widgets: {
    id: string
    title: string
    type: string
    endpointUrl: string
    method: string
    xAxis: string
    yAxis: string
  }[]
  exportedAt: string
}

// Encode dashboard state into a base64 URL token
export function encodeShareToken(payload: SharePayload): string {
  const json    = JSON.stringify(payload)
  const encoded = btoa(encodeURIComponent(json))
  // Make URL-safe
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Decode token back to payload — returns null if invalid
export function decodeShareToken(token: string): SharePayload | null {
  try {
    const base64  = token.replace(/-/g, '+').replace(/_/g, '/')
    const padded  = base64 + '='.repeat((4 - base64.length % 4) % 4)
    const json    = decodeURIComponent(atob(padded))
    return JSON.parse(json) as SharePayload
  } catch {
    return null
  }
}

export function buildShareUrl(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/view/${token}`
}
