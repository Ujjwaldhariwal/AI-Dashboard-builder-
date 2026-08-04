const RPC_NAME = 'finalize_chart_refinement_proposal'
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

async function probeChartRefinementRpc({ url, serviceKey, fetchImpl = fetch }) {
  if (!url || !serviceKey) throw new Error('Supabase URL and service-role key are required for the RPC deployment guard.')

  const response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/${RPC_NAME}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_tenant_id: ZERO_UUID,
      p_project_id: ZERO_UUID,
      p_chart_id: ZERO_UUID,
      p_proposal_id: ZERO_UUID,
      p_base_updated_at: null,
      p_action: 'apply',
      p_rejection_reason: null,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json().catch(() => ({}))
  if ([400, 401, 403].includes(response.status) && payload?.code === '42501') return true

  const detail = payload?.message || payload?.hint || `${response.status} ${response.statusText}`
  throw new Error(`Required RPC ${RPC_NAME} is unavailable or has the wrong contract: ${detail}`)
}

async function main() {
  await probeChartRefinementRpc({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  console.log(`Required RPC ${RPC_NAME} is installed and callable.`)
}

module.exports = { probeChartRefinementRpc }

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
