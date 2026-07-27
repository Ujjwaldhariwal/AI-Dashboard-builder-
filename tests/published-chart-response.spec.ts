import { expect, test } from '@playwright/test'

import { parsePublishedChartRunResponse } from '../src/lib/client/published-chart-response'

test.describe('published chart runtime responses', () => {
  test('parses a valid JSON chart response', async () => {
    const payload = await parsePublishedChartRunResponse(new Response(JSON.stringify({
      result: {
        rows: [{ Month: 'Jan', Revenue: 120000 }],
        fields: ['Month', 'Revenue'],
        rowCount: 1,
        elapsedMs: 12,
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }))

    expect(payload.result?.rowCount).toBe(1)
    expect(payload.result?.rows).toEqual([{ Month: 'Jan', Revenue: 120000 }])
  })

  test('turns an HTML 404 into a stable runtime error without exposing markup', async () => {
    const response = new Response('<!DOCTYPE html><html><body>Not found</body></html>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })

    await expect(parsePublishedChartRunResponse(response)).rejects.toThrow(
      'The published chart runtime endpoint is unavailable. Restart the local app and retry.',
    )
    await expect(parsePublishedChartRunResponse(new Response('<!DOCTYPE html>', {
      status: 500,
      headers: { 'content-type': 'text/html' },
    }))).rejects.not.toThrow('<!DOCTYPE')
  })

  test('rejects malformed JSON payloads with a user-safe error', async () => {
    const response = new Response('not-json', {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })

    await expect(parsePublishedChartRunResponse(response)).rejects.toThrow(
      'The published chart runtime returned invalid JSON. Please retry.',
    )
  })
})
