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

export const demoChart: DashboardChartConfig = {
  id: DEMO_CHART_ID,
  tenantId: DEMO_TENANT_ID,
  projectId: DEMO_PROJECT_ID,
  datasetId: DEMO_DATASET_ID,
  name: 'Revenue, Orders, and Customers',
  status: 'published',
  templateId: 'trend-composed',
  encoding: {
    xAxisFieldId: 'demo-field-month',
    yMetricIds: ['demo-metric-revenue', 'demo-metric-orders', 'demo-metric-customers'],
    tooltipFieldIds: ['demo-field-region', 'demo-metric-revenue', 'demo-metric-orders'],
    labelById: {
      'demo-field-month': 'Month',
      'demo-field-region': 'Region',
      'demo-field-segment': 'Segment',
      'demo-metric-revenue': 'Revenue',
      'demo-metric-orders': 'Orders',
      'demo-metric-customers': 'Customers',
    },
    colorById: {},
    sort: null,
    limit: 12,
  },
  presentation: { size: 'wide', showLegend: true, showLabels: false, valueFormat: 'currency' },
  interactions: { filterOnClick: true },
  layout: { order: 0, gridSpan: 3 },
  validationState: 'valid',
  createdAt: now,
  updatedAt: now,
  publishedAt: now,
}

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
  notes: 'Seeded demo-safe release.',
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

export const demoSlot: DashboardChartSlot = {
  id: DEMO_SLOT_ID,
  pageId: DEMO_PAGE_ID,
  versionId: DEMO_VERSION_ID,
  dashboardId: DEMO_DASHBOARD_ID,
  tenantId: DEMO_TENANT_ID,
  projectId: DEMO_PROJECT_ID,
  chartConfigId: DEMO_CHART_ID,
  title: demoChart.name,
  slotKey: 'revenue-trend',
  rowIndex: 0,
  columnIndex: 0,
  width: 8,
  height: 4,
  settings: {},
  createdAt: now,
}

export const demoChartAudit: DashboardChartAudit = {
  checkedAt: now,
  summary: { total: 1, healthy: 1, stale: 0, blocked: 0 },
  items: [{
    chart: {
      id: demoChart.id,
      name: demoChart.name,
      status: demoChart.status,
      templateId: demoChart.templateId,
      validationState: demoChart.validationState,
      updatedAt: demoChart.updatedAt,
      publishedAt: demoChart.publishedAt,
    },
    dataset: { id: demoDataset.id, status: demoDataset.status },
    healthState: 'healthy',
    validation: { state: 'valid', issues: [] },
  }],
}

export const demoDashboardHealthAudit: DashboardHealthAudit = {
  checkedAt: now,
  summary: { total: 1, healthy: 1, stale: 0, blocked: 0 },
  dashboards: [{
    dashboard: { id: demoDashboard.id, name: demoDashboard.name, slug: demoDashboard.slug, status: demoDashboard.status, publishedAt: demoDashboard.publishedAt },
    version: { id: demoVersion.id, versionNumber: demoVersion.versionNumber, title: demoVersion.title, status: demoVersion.status, publishedAt: demoVersion.publishedAt },
    summary: { totalSlots: 1, healthySlots: 1, staleSlots: 0, blockedSlots: 0, pageCount: 1 },
    healthState: 'healthy',
    items: [],
  }],
}

export const demoChartRows = [
  { Month: 'Jan', Revenue: 128400, Orders: 1260, Customers: 812 },
  { Month: 'Feb', Revenue: 137900, Orders: 1328, Customers: 846 },
  { Month: 'Mar', Revenue: 149200, Orders: 1414, Customers: 911 },
  { Month: 'Apr', Revenue: 158600, Orders: 1502, Customers: 944 },
  { Month: 'May', Revenue: 171300, Orders: 1608, Customers: 1008 },
  { Month: 'Jun', Revenue: 186750, Orders: 1740, Customers: 1089 },
]
