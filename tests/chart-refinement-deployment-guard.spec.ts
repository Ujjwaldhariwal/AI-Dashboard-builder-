import { expect, test } from '@playwright/test'

// This deployment script stays CommonJS so it can run before the application build.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { probeChartRefinementRpc } = require('../scripts/check-chart-refinement-rpc.cjs') as {
  probeChartRefinementRpc: (input: {
    url: string
    serviceKey: string
    fetchImpl: typeof fetch
  }) => Promise<boolean>
}

function response(status: number, payload: unknown): Response {
  return {
    status,
    statusText: 'mock response',
    json: async () => payload,
  } as Response
}

test.describe('chart refinement RPC deployment guard', () => {
  for (const status of [400, 401, 403]) {
    test(`accepts the RPC-owned authorization response (${status})`, async () => {
      const calls: unknown[][] = []
      const fetchImpl = async (...args: unknown[]) => {
        calls.push(args)
        return response(status, { code: '42501', message: 'Authentication required' })
      }

      await expect(probeChartRefinementRpc({
        url: 'https://example.supabase.co/',
        serviceKey: 'service-key',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })).resolves.toBe(true)

      expect(calls).toHaveLength(1)
      expect(calls[0]?.[0]).toBe('https://example.supabase.co/rest/v1/rpc/finalize_chart_refinement_proposal')
      expect(calls[0]?.[1]).toMatchObject({ method: 'POST' })
    })
  }

  test('blocks deployment when PostgREST cannot resolve the RPC', async () => {
    const fetchImpl = async () => response(404, {
      code: 'PGRST202',
      message: 'Could not find the function in the schema cache',
    })

    await expect(probeChartRefinementRpc({
      url: 'https://example.supabase.co',
      serviceKey: 'service-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('finalize_chart_refinement_proposal is unavailable or has the wrong contract')
  })

  test('does not mistake an infrastructure failure for an installed RPC', async () => {
    const fetchImpl = async () => response(502, { message: 'Bad gateway' })

    await expect(probeChartRefinementRpc({
      url: 'https://example.supabase.co',
      serviceKey: 'service-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('Bad gateway')
  })
})
