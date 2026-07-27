export interface PublishedChartRunPayload {
  result?: {
    rows?: Record<string, unknown>[]
    fields?: Array<string | { name?: string }>
    rowCount?: number
    elapsedMs?: number
    warnings?: string[]
    chart?: {
      resolved?: {
        xField?: string
        yFields?: string[]
        tooltipFields?: string[]
        sortField?: string
      }
    }
  } | null
  error?: string
}

function isJsonContentType(value: string | null) {
  return value?.toLowerCase().includes('application/json') ?? false
}

export async function parsePublishedChartRunResponse(response: Response): Promise<PublishedChartRunPayload> {
  if (!isJsonContentType(response.headers.get('content-type'))) {
    throw new Error(
      response.status === 404
        ? 'The published chart runtime endpoint is unavailable. Restart the local app and retry.'
        : 'The published chart runtime returned an invalid response. Please retry.',
    )
  }

  const payload = await response.json().catch(() => null)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The published chart runtime returned invalid JSON. Please retry.')
  }

  return payload as PublishedChartRunPayload
}
