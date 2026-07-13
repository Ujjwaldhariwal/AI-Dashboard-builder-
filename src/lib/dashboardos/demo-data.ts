import { CHART_TEMPLATE_REGISTRY } from '@/lib/semantic/chart-template-registry'
import type { DashboardChartAudit } from '@/lib/semantic/chart-health-auditor'
import type { ChartCompatibilityResult, DatasetShape } from '@/types/chart-template'
import type { DataSource, DataSourceColumnMetadata } from '@/types/data-source'
import type { DashboardChartConfig } from '@/types/dashboard-chart'
import type { DashboardChartSlot, DashboardHealthAudit, DashboardPage, DashboardVersion, PublishedDashboard } from '@/types/dashboard-publishing'
import type { BusinessMetric, BusinessModel, BusinessRelationship } from '@/types/semantic-model'
import type { SemanticDataset } from '@/types/semantic-dataset'
import type { Tenant } from '@/types/tenancy'

export const DEMO_TENANT_ID = 'demo-tenant-northstar-retail'
export const DEMO_PROJECT_ID = 'demo-project-executive-analytics'
export const DEMO_DATA_SOURCE_ID = 'demo-source-warehouse'
export const DEMO_MODEL_ID = 'demo-model-retail-revenue'
export const DEMO_DATASET_ID = 'demo-dataset-executive-revenue'
export const DEMO_CHART_ID = 'demo-chart-revenue-trend'
export const DEMO_CHART_IDS = {
  revenueTrend: DEMO_CHART_ID,
  channelMix: 'demo-chart-channel-mix',
  regionalVelocity: 'demo-chart-regional-velocity',
  segmentMargin: 'demo-chart-segment-margin',
  executiveKpis: 'demo-chart-executive-kpis',
  riskTable: 'demo-chart-risk-table',
} as const
export const DEMO_DASHBOARD_ID = 'demo-dashboard-executive'
export const DEMO_VERSION_ID = 'demo-version-executive-v1'
export const DEMO_PAGE_ID = 'demo-page-overview'
export const DEMO_SLOT_ID = 'demo-slot-revenue-trend'

const now = '2026-07-03T09:00:00.000Z'

export const demoProjects = [{
  id: DEMO_PROJECT_ID,
  tenantId: DEMO_TENANT_ID,
  name: 'Executive Analytics',
  tenantName: 'Northstar Retail',
  tenantSlug: 'northstar-retail',
}]

export const demoTenants: Tenant[] = [{
  id: DEMO_TENANT_ID,
  name: 'Northstar Retail',
  slug: 'northstar-retail',
  status: 'active',
  primaryDomain: 'northstar.dashboardos.local',
  branding: null,
  createdAt: now,
  updatedAt: now,
}]

export const demoDataSource: DataSource = {
  id: DEMO_DATA_SOURCE_ID,
  tenantId: DEMO_TENANT_ID,
  projectId: DEMO_PROJECT_ID,
  name: 'Demo warehouse replica',
  type: 'postgres',
  status: 'active',
  connectionConfig: {
    host: 'demo.analytics.local',
    port: 5432,
    database: 'dashboardos_demo',
    username: 'readonly_demo',
    sslMode: 'require',
  },
  credentialKeyId: 'demo-vault-key',
  lastTestedAt: now,
  lastTestStatus: 'ok',
  schemaLastIntrospectedAt: now,
  schemaLastStatus: 'ok',
  schemaHash: 'demo-schema-2026-07-03',
  schemaTableCount: 3,
  schemaColumnCount: 14,
  schemaRefreshAfter: '2026-07-04T09:00:00.000Z',
  createdAt: now,
  updatedAt: now,
}

export const demoColumns: DataSourceColumnMetadata[] = [
  ['month', 1, 'date'], ['region', 2, 'text'], ['segment', 3, 'text'], ['revenue', 4, 'numeric'], ['order_count', 5, 'integer'], ['customer_count', 6, 'integer'],
].map(([columnName, ordinalPosition, dataType]) => ({
  id: `demo-col-${columnName}`,
  dataSourceId: DEMO_DATA_SOURCE_ID,
  schemaName: 'sales',
  tableName: 'v_monthly_revenue',
  columnName: String(columnName),
  ordinalPosition: Number(ordinalPosition),
  dataType: String(dataType),
  udtName: String(dataType),
  isNullable: false,
  columnDefault: null,
  createdAt: now,
}))

export const demoModel: BusinessModel = {
  id: DEMO_MODEL_ID,
  tenantId: DEMO_TENANT_ID,
  projectId: DEMO_PROJECT_ID,
  name: 'Retail Revenue Business Model',
  description: 'Approved semantic layer for the executive dashboard demo.',
  status: 'approved',
  version: 1,
  createdAt: now,
  updatedAt: now,
  approvedAt: now,
}

export const demoEntities = [{
  id: 'demo-entity-revenue',
  name: 'Monthly Revenue',
  semanticKey: 'monthly_revenue',
  type: 'fact',
  fields: demoColumns.map(column => ({
    id: `demo-field-${column.columnName}`,
    name: column.columnName === 'month' ? 'Month' : column.columnName.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
    role: column.columnName === 'month' ? 'date' as const : ['revenue', 'order_count', 'customer_count'].includes(column.columnName) ? 'metric_source' as const : 'dimension' as const,
    sourceColumn: {
      dataSourceId: DEMO_DATA_SOURCE_ID,
      schemaName: column.schemaName,
      tableName: column.tableName,
      columnName: column.columnName,
      dataType: column.dataType,
    },
  })),
}]

export const demoMetrics: BusinessMetric[] = [
  { id: 'demo-metric-revenue', name: 'Revenue', semanticKey: 'revenue', aggregation: 'sum', expression: { fieldId: 'demo-field-revenue' }, unit: 'USD', displayFormat: 'currency', modelId: DEMO_MODEL_ID, entityId: 'demo-entity-revenue', createdAt: now, updatedAt: now },
  { id: 'demo-metric-orders', name: 'Orders', semanticKey: 'orders', aggregation: 'sum', expression: { fieldId: 'demo-field-order_count' }, modelId: DEMO_MODEL_ID, entityId: 'demo-entity-revenue', createdAt: now, updatedAt: now },
  { id: 'demo-metric-customers', name: 'Customers', semanticKey: 'customers', aggregation: 'sum', expression: { fieldId: 'demo-field-customer_count' }, modelId: DEMO_MODEL_ID, entityId: 'demo-entity-revenue', createdAt: now, updatedAt: now },
]

export const demoRelationships: BusinessRelationship[] = []

export const demoDataset: SemanticDataset = {
  id: DEMO_DATASET_ID,
  tenantId: DEMO_TENANT_ID,
  projectId: DEMO_PROJECT_ID,
  modelId: DEMO_MODEL_ID,
  name: 'Executive Revenue Dataset',
  description: 'Published dataset for the senior demo runtime.',
  status: 'published',
  selection: {
    fieldIds: ['demo-field-month', 'demo-field-region', 'demo-field-segment'],
    metricIds: ['demo-metric-revenue', 'demo-metric-orders', 'demo-metric-customers'],
    relationshipIds: [],
  },
  cachePolicy: { ttlSeconds: 300 },
  createdAt: now,
  updatedAt: now,
}

const demoShape: DatasetShape = {
  kind: 'time_series_many_metrics',
  fields: [
    { id: 'demo-field-month', label: 'Month', role: 'date', valueKind: 'date', semanticKey: 'month' },
    { id: 'demo-field-region', label: 'Region', role: 'dimension', valueKind: 'string', semanticKey: 'region' },
  ],
  metrics: [
    { id: 'demo-metric-revenue', label: 'Revenue', aggregation: 'sum', semanticKey: 'revenue', displayFormat: 'currency', unit: 'USD' },
    { id: 'demo-metric-orders', label: 'Orders', aggregation: 'sum', semanticKey: 'orders' },
    { id: 'demo-metric-customers', label: 'Customers', aggregation: 'sum', semanticKey: 'customers' },
  ],
  dimensions: [{ id: 'demo-field-region', label: 'Region', role: 'dimension', valueKind: 'string', semanticKey: 'region' }],
  dateFields: [{ id: 'demo-field-month', label: 'Month', role: 'date', valueKind: 'date', semanticKey: 'month' }],
  tooltipFields: [],
  metricCount: 3,
  dimensionCount: 2,
  hasDateAxis: true,
  hasMultipleMetrics: true,
  warnings: [],
}

const compatibility: ChartCompatibilityResult[] = CHART_TEMPLATE_REGISTRY.map(template => ({
  template,
  status: template.id === 'trend-composed' ? 'recommended' : ['line', 'grouped-bar', 'table-grid'].includes(template.id) ? 'allowed' : 'blocked',
  score: template.id === 'trend-composed' ? 98 : ['line', 'grouped-bar'].includes(template.id) ? 86 : template.id === 'table-grid' ? 60 : 10,
  reasons: template.id === 'trend-composed' ? ['Time-series dataset with multiple governed metrics.'] : [],
}))

export const demoDatasetPlan = {
  dataset: { id: DEMO_DATASET_ID, name: demoDataset.name, status: demoDataset.status },
  fields: [
    { id: 'demo-field-month', name: 'Month', role: 'date' },
    { id: 'demo-field-region', name: 'Region', role: 'dimension' },
    { id: 'demo-field-segment', name: 'Segment', role: 'dimension' },
  ],
  metrics: [
    { id: 'demo-metric-revenue', name: 'Revenue', aggregation: 'sum' },
    { id: 'demo-metric-orders', name: 'Orders', aggregation: 'sum' },
    { id: 'demo-metric-customers', name: 'Customers', aggregation: 'sum' },
  ],
  relationships: [],
  limits: { rowLimit: 500, timeoutMs: 3000 },
  dataSourceId: DEMO_DATA_SOURCE_ID,
  queryPlan: {
    dialect: 'postgres',
    select: [
      { id: 'demo-field-month', label: 'Month', role: 'field' },
      { id: 'demo-metric-revenue', label: 'Revenue', role: 'metric' },
      { id: 'demo-metric-orders', label: 'Orders', role: 'metric' },
    ],
    joins: [],
    executableSql: 'select month, sum(revenue) as revenue, sum(order_count) as orders from sales.v_monthly_revenue group by month order by month limit 500',
  },
  warnings: [],
  chartOptions: { shape: demoShape, compatibility },
}

const demoLabelById = {
  'demo-field-month': 'Month',
  'demo-field-region': 'Region',
  'demo-field-segment': 'Segment',
  'demo-metric-revenue': 'Revenue',
  'demo-metric-orders': 'Orders',
  'demo-metric-customers': 'Customers',
}

function demoChartConfig({
  id,
  name,
  templateId,
  xAxisFieldId,
  yMetricIds,
  tooltipFieldIds = ['demo-metric-revenue', 'demo-metric-orders', 'demo-metric-customers'],
  presentationSize,
  valueFormat,
  order,
  gridSpan,
  limit = 12,
}: {
  id: string
  name: string
  templateId: DashboardChartConfig['templateId']
  xAxisFieldId?: string
  yMetricIds: string[]
  tooltipFieldIds?: string[]
  presentationSize: DashboardChartConfig['presentation']['size']
  valueFormat?: string | null
  order: number
  gridSpan: number
  limit?: number
}): DashboardChartConfig {
  return {
    id,
    tenantId: DEMO_TENANT_ID,
    projectId: DEMO_PROJECT_ID,
    datasetId: DEMO_DATASET_ID,
    name,
    status: 'published',
    templateId,
    encoding: {
      xAxisFieldId,
      yMetricIds,
      tooltipFieldIds,
      labelById: demoLabelById,
      colorById: {},
      sort: null,
      limit,
    },
    presentation: { size: presentationSize, showLegend: true, showLabels: false, valueFormat: valueFormat ?? null },
    interactions: { filterOnClick: true },
    layout: { order, gridSpan },
    validationState: 'valid',
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  }
}

export const demoCharts: DashboardChartConfig[] = [
  demoChartConfig({
    id: DEMO_CHART_IDS.revenueTrend,
    name: 'Revenue, Orders, and Customers',
    templateId: 'trend-composed',
    xAxisFieldId: 'demo-field-month',
    yMetricIds: ['demo-metric-revenue', 'demo-metric-orders', 'demo-metric-customers'],
    presentationSize: 'wide',
    valueFormat: 'currency',
    order: 0,
    gridSpan: 3,
  }),
  demoChartConfig({
    id: DEMO_CHART_IDS.executiveKpis,
    name: 'Executive KPI Pulse',
    templateId: 'kpi-grid',
    yMetricIds: ['demo-metric-revenue', 'demo-metric-orders', 'demo-metric-customers'],
    presentationSize: 'standard',
    valueFormat: 'currency',
    order: 1,
    gridSpan: 1,
    limit: 1,
  }),
  demoChartConfig({
    id: DEMO_CHART_IDS.regionalVelocity,
    name: 'Regional Revenue Velocity',
    templateId: 'horizontal-bar',
    xAxisFieldId: 'demo-field-region',
    yMetricIds: ['demo-metric-revenue'],
    presentationSize: 'standard',
    valueFormat: 'currency',
    order: 2,
    gridSpan: 2,
    limit: 8,
  }),
  demoChartConfig({
    id: DEMO_CHART_IDS.channelMix,
    name: 'Segment Mix',
    templateId: 'pie',
    xAxisFieldId: 'demo-field-segment',
    yMetricIds: ['demo-metric-orders'],
    presentationSize: 'standard',
    order: 3,
    gridSpan: 2,
    limit: 8,
  }),
  demoChartConfig({
    id: DEMO_CHART_IDS.segmentMargin,
    name: 'Segment Revenue, Orders, Customers',
    templateId: 'grouped-bar',
    xAxisFieldId: 'demo-field-segment',
    yMetricIds: ['demo-metric-revenue', 'demo-metric-orders', 'demo-metric-customers'],
    presentationSize: 'wide',
    valueFormat: 'currency',
    order: 4,
    gridSpan: 3,
    limit: 8,
  }),
  demoChartConfig({
    id: DEMO_CHART_IDS.riskTable,
    name: 'Retail Command Table',
    templateId: 'table-grid',
    xAxisFieldId: 'demo-field-region',
    yMetricIds: ['demo-metric-revenue', 'demo-metric-orders', 'demo-metric-customers'],
    presentationSize: 'standard',
    valueFormat: 'currency',
    order: 5,
    gridSpan: 1,
    limit: 8,
  }),
]

export const demoChart = demoCharts[0]

export const demoDashboard: PublishedDashboard = {
  id: DEMO_DASHBOARD_ID,
  tenantId: DEMO_TENANT_ID,
  projectId: DEMO_PROJECT_ID,
  name: 'Executive Revenue',
  slug: 'executive-revenue',
  description: 'Published runtime dashboard for the demo workspace.',
  status: 'published',
  currentVersionId: DEMO_VERSION_ID,
  publishedAt: now,
  createdAt: now,
  updatedAt: now,
}

export const demoVersion: DashboardVersion = {
  id: DEMO_VERSION_ID,
  dashboardId: DEMO_DASHBOARD_ID,
  tenantId: DEMO_TENANT_ID,
  projectId: DEMO_PROJECT_ID,
  versionNumber: 1,
  status: 'published',
  title: 'Executive demo release',
  notes: 'Seeded demo-safe multi-chart executive release.',
  layout: { mode: 'responsive-grid' },
  publishedAt: now,
  createdAt: now,
}

export const demoPage: DashboardPage = {
  id: DEMO_PAGE_ID,
  versionId: DEMO_VERSION_ID,
  dashboardId: DEMO_DASHBOARD_ID,
  tenantId: DEMO_TENANT_ID,
  projectId: DEMO_PROJECT_ID,
  title: 'Overview',
  slug: 'overview',
  sortOrder: 0,
  layout: { columns: 12 },
  createdAt: now,
}

export const demoSlots: DashboardChartSlot[] = demoCharts.map((chart, index) => ({
  id: index === 0 ? DEMO_SLOT_ID : `demo-slot-${chart.id.replace(/^demo-chart-/, '')}`,
  pageId: DEMO_PAGE_ID,
  versionId: DEMO_VERSION_ID,
  dashboardId: DEMO_DASHBOARD_ID,
  tenantId: DEMO_TENANT_ID,
  projectId: DEMO_PROJECT_ID,
  chartConfigId: chart.id,
  title: chart.name,
  slotKey: chart.id.replace(/^demo-chart-/, ''),
  rowIndex: index < 2 ? 0 : index < 4 ? 1 : 2,
  columnIndex: index === 0 ? 0 : index === 1 ? 9 : index % 2 === 0 ? 0 : 6,
  width: chart.layout.gridSpan >= 3 ? 8 : chart.layout.gridSpan === 2 ? 6 : 4,
  height: chart.presentation.size === 'wide' ? 5 : 4,
  settings: {},
  createdAt: now,
}))

export const demoSlot = demoSlots[0]

export const demoChartAudit: DashboardChartAudit = {
  checkedAt: now,
  summary: { total: demoCharts.length, healthy: demoCharts.length, stale: 0, blocked: 0 },
  items: demoCharts.map(chart => ({
    chart: {
      id: chart.id,
      name: chart.name,
      status: chart.status,
      templateId: chart.templateId,
      validationState: chart.validationState,
      updatedAt: chart.updatedAt,
      publishedAt: chart.publishedAt,
    },
    dataset: { id: demoDataset.id, status: demoDataset.status },
    healthState: 'healthy',
    validation: { state: 'valid', issues: [] },
  })),
}

export const demoDashboardHealthAudit: DashboardHealthAudit = {
  checkedAt: now,
  summary: { total: 1, healthy: 1, stale: 0, blocked: 0 },
  dashboards: [{
    dashboard: { id: demoDashboard.id, name: demoDashboard.name, slug: demoDashboard.slug, status: demoDashboard.status, publishedAt: demoDashboard.publishedAt },
    version: { id: demoVersion.id, versionNumber: demoVersion.versionNumber, title: demoVersion.title, status: demoVersion.status, publishedAt: demoVersion.publishedAt },
    summary: { totalSlots: demoSlots.length, healthySlots: demoSlots.length, staleSlots: 0, blockedSlots: 0, pageCount: 1 },
    healthState: 'healthy',
    items: demoSlots.map(slot => {
      const chart = demoCharts.find(item => item.id === slot.chartConfigId) ?? demoChart
      return {
        slot: {
          id: slot.id,
          pageId: slot.pageId,
          chartConfigId: slot.chartConfigId,
          slotKey: slot.slotKey,
          title: slot.title,
        },
        chart: {
          id: chart.id,
          name: chart.name,
          status: chart.status,
          templateId: chart.templateId,
          validationState: chart.validationState,
        },
        healthState: 'healthy' as const,
        issues: [],
      }
    }),
  }],
}

export const demoChartRows = [
  { Month: 'Jan', Region: 'Northeast', Segment: 'Loyalists', Revenue: 128400, Orders: 1260, Customers: 812 },
  { Month: 'Feb', Region: 'West', Segment: 'Premium', Revenue: 137900, Orders: 1328, Customers: 846 },
  { Month: 'Mar', Region: 'South', Segment: 'New Buyers', Revenue: 149200, Orders: 1414, Customers: 911 },
  { Month: 'Apr', Region: 'Midwest', Segment: 'Marketplace', Revenue: 158600, Orders: 1502, Customers: 944 },
  { Month: 'May', Region: 'Northeast', Segment: 'Premium', Revenue: 171300, Orders: 1608, Customers: 1008 },
  { Month: 'Jun', Region: 'West', Segment: 'Loyalists', Revenue: 186750, Orders: 1740, Customers: 1089 },
  { Month: 'Jul', Region: 'South', Segment: 'Marketplace', Revenue: 202100, Orders: 1886, Customers: 1164 },
  { Month: 'Aug', Region: 'Midwest', Segment: 'New Buyers', Revenue: 218450, Orders: 2028, Customers: 1242 },
]

export const demoKpiRows = [{
  Revenue: 1352650,
  Orders: 12766,
  Customers: 8016,
}]

export const demoRegionRows = [
  { Region: 'West', Revenue: 324650, Orders: 3068, Customers: 1935 },
  { Region: 'Northeast', Revenue: 299700, Orders: 2868, Customers: 1820 },
  { Region: 'South', Revenue: 351300, Orders: 3300, Customers: 2075 },
  { Region: 'Midwest', Revenue: 377000, Orders: 3530, Customers: 2186 },
]

export const demoSegmentRows = [
  { Segment: 'Premium', Revenue: 309200, Orders: 2936, Customers: 1854 },
  { Segment: 'Loyalists', Revenue: 315150, Orders: 3000, Customers: 1901 },
  { Segment: 'New Buyers', Revenue: 367650, Orders: 3442, Customers: 2153 },
  { Segment: 'Marketplace', Revenue: 360650, Orders: 3388, Customers: 2108 },
]

export const demoRiskRows = [
  { Region: 'Midwest', Segment: 'New Buyers', Revenue: 218450, Orders: 2028, Customers: 1242 },
  { Region: 'South', Segment: 'Marketplace', Revenue: 202100, Orders: 1886, Customers: 1164 },
  { Region: 'West', Segment: 'Loyalists', Revenue: 186750, Orders: 1740, Customers: 1089 },
  { Region: 'Northeast', Segment: 'Premium', Revenue: 171300, Orders: 1608, Customers: 1008 },
]

export const demoChartRowsById: Record<string, Record<string, unknown>[]> = {
  [DEMO_CHART_IDS.revenueTrend]: demoChartRows,
  [DEMO_CHART_IDS.executiveKpis]: demoKpiRows,
  [DEMO_CHART_IDS.regionalVelocity]: demoRegionRows,
  [DEMO_CHART_IDS.channelMix]: demoSegmentRows,
  [DEMO_CHART_IDS.segmentMargin]: demoSegmentRows,
  [DEMO_CHART_IDS.riskTable]: demoRiskRows,
}

export function getDemoChartRows(chartId: string) {
  return demoChartRowsById[chartId] ?? demoChartRows
}

export function getDemoChartFields(chartId: string) {
  const rows = getDemoChartRows(chartId)
  return Object.keys(rows[0] ?? {})
}

export function getDemoChartElapsedMs(chartId: string) {
  if (chartId === DEMO_CHART_IDS.executiveKpis) return 14
  if (chartId === DEMO_CHART_IDS.riskTable) return 31
  return 24 + Math.max(0, getDemoChartRows(chartId).length - 4) * 3
}
