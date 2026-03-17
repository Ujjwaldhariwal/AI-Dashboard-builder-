export interface UppclTaxonomySubgroup {
  id: string
  label: string
  order: number
}

export interface UppclTaxonomyCategory {
  id: string
  label: string
  order: number
  accent: string
  subgroups: UppclTaxonomySubgroup[]
}

export interface UppclTaxonomyMatch {
  categoryId: string
  categoryLabel: string
  categoryOrder: number
  categoryAccent: string
  subgroupId: string
  subgroupLabel: string
  subgroupOrder: number
}

const UPPCL_TAXONOMY: UppclTaxonomyCategory[] = [
  {
    id: 'communication',
    label: 'Communication',
    order: 0,
    accent: '#0ea5e9',
    subgroups: [
      { id: 'communication-status', label: 'Communication Status', order: 0 },
    ],
  },
  {
    id: 'disconnection',
    label: 'Disconnection',
    order: 1,
    accent: '#ef4444',
    subgroups: [
      { id: 'disconnection-status', label: 'Disconnection Status', order: 0 },
    ],
  },
  {
    id: 'prepaid-billing',
    label: 'Prepaid Billing',
    order: 2,
    accent: '#f59e0b',
    subgroups: [
      { id: 'prepaid-billing', label: 'Prepaid Billing', order: 0 },
    ],
  },
  {
    id: 'net-metering',
    label: 'Net Metering',
    order: 3,
    accent: '#22c55e',
    subgroups: [
      { id: 'net-metering-insights', label: 'Net Metering Insights', order: 0 },
    ],
  },
  {
    id: 'power-quality',
    label: 'Power Quality',
    order: 4,
    accent: '#8b5cf6',
    subgroups: [
      { id: 'power-quality-insights', label: 'Power Quality Insights', order: 0 },
    ],
  },
  {
    id: 'feeders',
    label: 'Feeders',
    order: 5,
    accent: '#06b6d4',
    subgroups: [
      { id: 'feeders-meters-count', label: 'Feeders Meters Count', order: 0 },
      { id: 'monthly-billing-reads', label: 'Monthly Billing Reads', order: 1 },
      { id: 'disconnected-meters', label: 'Disconnected Meters', order: 2 },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    order: 6,
    accent: '#ec4899',
    subgroups: [
      { id: 'feeder-analysis', label: 'Feeder Analysis', order: 0 },
    ],
  },
  {
    id: 'consumer-meter',
    label: 'Consumer Meter',
    order: 7,
    accent: '#64748b',
    subgroups: [
      { id: 'meter-overview-statistics', label: 'Meter Overview Statistics', order: 0 },
      { id: 'availability-status', label: 'Availability Status', order: 1 },
      { id: 'growth-trend', label: 'Growth & Trend', order: 2 },
      { id: 'block-load-availability', label: 'Block Load Availability', order: 3 },
    ],
  },
]

type EndpointTaxonomyLink = {
  endpoint: string
  categoryId: string
  subgroupId: string
}

const ENDPOINT_TAXONOMY_LINKS: EndpointTaxonomyLink[] = [
  { endpoint: 'GetMeterInstalled', categoryId: 'communication', subgroupId: 'communication-status' },
  { endpoint: 'GetCommunicationStatusMeter', categoryId: 'communication', subgroupId: 'communication-status' },
  { endpoint: 'GetConnectionStatus', categoryId: 'disconnection', subgroupId: 'disconnection-status' },
  { endpoint: 'GetDisconnectionAging', categoryId: 'disconnection', subgroupId: 'disconnection-status' },
  { endpoint: 'GetDisconnectionVsReconnection', categoryId: 'disconnection', subgroupId: 'disconnection-status' },
  { endpoint: 'getAgingWiseDisconnectedConsumer', categoryId: 'disconnection', subgroupId: 'disconnection-status' },
  { endpoint: 'getPrepaidVsPostpaidConsumer', categoryId: 'prepaid-billing', subgroupId: 'prepaid-billing' },
  { endpoint: 'getDateWiseRechargeCountAndValue', categoryId: 'prepaid-billing', subgroupId: 'prepaid-billing' },
  { endpoint: 'getMonthlyRechargeRecieved', categoryId: 'prepaid-billing', subgroupId: 'prepaid-billing' },
  { endpoint: 'getCircleWiseConsumerWithNegativeBalance', categoryId: 'prepaid-billing', subgroupId: 'prepaid-billing' },
  { endpoint: 'getNegativeBalanceWiseConsumerCount', categoryId: 'prepaid-billing', subgroupId: 'prepaid-billing' },
  { endpoint: 'getAgingWiseNegativeBalanceConsumerCount', categoryId: 'prepaid-billing', subgroupId: 'prepaid-billing' },
  { endpoint: 'netMeteringCon', categoryId: 'net-metering', subgroupId: 'net-metering-insights' },
  { endpoint: 'GetPF', categoryId: 'power-quality', subgroupId: 'power-quality-insights' },
  { endpoint: 'getFeederWiseConsumerCount', categoryId: 'feeders', subgroupId: 'feeders-meters-count' },
  { endpoint: 'getFeederWiseMonthlyBillingDataTop10', categoryId: 'feeders', subgroupId: 'monthly-billing-reads' },
  { endpoint: 'getFeederWiseMonthlyBillingDataBottom10', categoryId: 'feeders', subgroupId: 'monthly-billing-reads' },
  { endpoint: 'getFeederWiseMonthlyBillingData', categoryId: 'feeders', subgroupId: 'monthly-billing-reads' },
  { endpoint: 'getFeederWiseDisconnectedConsumerTop10', categoryId: 'feeders', subgroupId: 'disconnected-meters' },
  { endpoint: 'getFeederWiseDisconnectedConsumerBottom10', categoryId: 'feeders', subgroupId: 'disconnected-meters' },
  { endpoint: 'getFeederWiseDisconnectedConsumer', categoryId: 'feeders', subgroupId: 'disconnected-meters' },
  { endpoint: 'getDTRWiseConsumerCount', categoryId: 'analytics', subgroupId: 'feeder-analysis' },
  { endpoint: 'ConMeter_TotalCount', categoryId: 'consumer-meter', subgroupId: 'meter-overview-statistics' },
  { endpoint: 'ConMeter_HHUCount', categoryId: 'consumer-meter', subgroupId: 'meter-overview-statistics' },
  { endpoint: 'ConMeter_MonthCount', categoryId: 'consumer-meter', subgroupId: 'meter-overview-statistics' },
  { endpoint: 'ConMeter_CurrentMonthCount', categoryId: 'consumer-meter', subgroupId: 'availability-status' },
  { endpoint: 'ConMeter_DailyCount', categoryId: 'consumer-meter', subgroupId: 'availability-status' },
  { endpoint: 'ConMeter_BlockCount_Current', categoryId: 'consumer-meter', subgroupId: 'availability-status' },
  { endpoint: 'ConMeter_MeterCount', categoryId: 'consumer-meter', subgroupId: 'growth-trend' },
  { endpoint: 'ConMeter_PrevousDailyCount', categoryId: 'consumer-meter', subgroupId: 'growth-trend' },
  { endpoint: 'ConMeter_BlockLoad_Availity', categoryId: 'consumer-meter', subgroupId: 'block-load-availability' },
]

const CATEGORY_BY_ID = new Map(UPPCL_TAXONOMY.map(category => [category.id, category]))
const LINK_BY_ENDPOINT_KEY = new Map(
  ENDPOINT_TAXONOMY_LINKS.map(link => [normalizeEndpointKey(link.endpoint), link]),
)

function collectEndpointCandidates(value: string | undefined): string[] {
  if (!value) return []
  const trimmed = value.trim()
  if (!trimmed) return []

  const candidates = [trimmed]
  try {
    const parsed = new URL(trimmed, 'http://local')
    const path = parsed.pathname ?? ''
    const segments = path.split('/').filter(Boolean)
    if (segments.length > 0) {
      candidates.push(path)
      candidates.push(segments[segments.length - 1])
      if (segments.length > 1) {
        candidates.push(`${segments[segments.length - 2]}/${segments[segments.length - 1]}`)
      }
    }
  } catch {
    // ignore parse errors and continue with raw candidate
  }
  return candidates
}

function tokenizeCandidate(value: string): string[] {
  const parts = value
    .split(/[/?#&=]+/)
    .map(part => part.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : [value]
}

export function normalizeEndpointKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function getUppclCategoryAccent(label: string): string | null {
  const match = UPPCL_TAXONOMY.find(category => category.label.toLowerCase() === label.trim().toLowerCase())
  return match?.accent ?? null
}

export function resolveUppclTaxonomy(input: {
  endpointUrl?: string
  endpointName?: string
}): UppclTaxonomyMatch | null {
  const keyCandidates = new Set<string>()

  const rawCandidates = [
    ...collectEndpointCandidates(input.endpointUrl),
    ...collectEndpointCandidates(input.endpointName),
  ]

  rawCandidates.forEach(candidate => {
    tokenizeCandidate(candidate).forEach(token => {
      const normalized = normalizeEndpointKey(token)
      if (normalized) keyCandidates.add(normalized)
    })
    const normalizedWhole = normalizeEndpointKey(candidate)
    if (normalizedWhole) keyCandidates.add(normalizedWhole)
  })

  for (const key of keyCandidates) {
    const link = LINK_BY_ENDPOINT_KEY.get(key)
    if (!link) continue

    const category = CATEGORY_BY_ID.get(link.categoryId)
    const subgroup = category?.subgroups.find(item => item.id === link.subgroupId)
    if (!category || !subgroup) continue

    return {
      categoryId: category.id,
      categoryLabel: category.label,
      categoryOrder: category.order,
      categoryAccent: category.accent,
      subgroupId: subgroup.id,
      subgroupLabel: subgroup.label,
      subgroupOrder: subgroup.order,
    }
  }

  return null
}
