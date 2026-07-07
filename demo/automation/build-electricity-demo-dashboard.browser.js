/*
 * DashboardOS demo automation runner.
 *
 * How to use:
 * 1. Open your signed-in DashboardOS Chrome tab at http://localhost:3000/admin
 * 2. Open DevTools Console.
 * 3. Paste this whole file and press Enter.
 *
 * The runner uses the existing admin API routes with your current browser
 * session cookies. It does not need your password or Supabase tokens.
 */
(async () => {
  const now = new Date()
  const runSlug = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14).toLowerCase()
  const runLabel = runSlug
  const log = (...args) => console.log('[DashboardOS demo]', ...args)
  const demoName = name => `${name} ${runLabel}`

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const error = typeof payload?.error === 'string'
        ? payload.error
        : JSON.stringify(payload?.error ?? payload ?? response.statusText)
      throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${error}`)
    }
    return payload
  }

  function titleFromColumn(value) {
    return String(value)
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase())
      .replace(/\bKwh\b/g, 'kWh')
      .replace(/\bKw\b/g, 'kW')
      .replace(/\bId\b/g, 'ID')
  }

  function normalized(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_')
  }

  function roleForColumn(column) {
    const name = normalized(column.columnName)
    const type = String(column.dataType || '').toLowerCase()
    if (/date|time/.test(type) || name.includes('month') || name.endsWith('_at')) return 'date'
    if (name === 'id' || name.endsWith('_id')) return 'identifier'
    if (/numeric|decimal|double|real|int|float/.test(type) && /(amount|bill|unit|kwh|kw|load|outage|count|total|usage)/.test(name)) return 'metric_source'
    if (/(name|city|type|status|segment|region|category|connection)/.test(name)) return 'dimension'
    if (/(secret|password|token|hash|raw|payload)/.test(name)) return 'hidden'
    return /numeric|decimal|double|real|int|float/.test(type) ? 'metric_source' : 'attribute'
  }

  function entityForTable(tableName, columns) {
    const name = normalized(tableName)
    if (name.includes('customer')) return { name: 'Customer', type: 'dimension' }
    if (name.includes('reading')) return { name: 'Monthly Reading', type: 'fact' }
    if (name.includes('bill')) return { name: 'Billing Event', type: 'fact' }
    const metricCount = columns.filter(column => roleForColumn(column) === 'metric_source').length
    return { name: titleFromColumn(tableName), type: metricCount >= 2 ? 'fact' : 'dimension' }
  }

  function metricSpecForField(field) {
    const source = field.sourceColumn || {}
    const key = normalized(`${source.tableName || ''}_${source.columnName || field.name}`)
    const table = normalized(source.tableName || '')
    const column = normalized(source.columnName || field.name)
    if (key.includes('units_consumed') || key.includes('kwh')) {
      return { name: 'Total Units Consumed', aggregation: 'sum', unit: 'kWh', displayFormat: '#,##0' }
    }
    if (table.includes('electricity_readings') && column.includes('bill_amount')) {
      return { name: 'Total Electricity Bill Amount', aggregation: 'sum', unit: 'currency', displayFormat: '$#,##0' }
    }
    if (key.includes('amount')) {
      return { name: 'Total Amount', aggregation: 'sum', unit: 'currency', displayFormat: '$#,##0' }
    }
    if (key.includes('outage')) {
      return { name: 'Average Outage Hours', aggregation: 'avg', unit: 'hours', displayFormat: '#,##0.0' }
    }
    if (key.includes('sanctioned_load') || key.includes('load_kw')) {
      return { name: 'Average Sanctioned Load', aggregation: 'avg', unit: 'kW', displayFormat: '#,##0.0' }
    }
    if (key.includes('reading_id')) {
      return { name: 'Reading Count', aggregation: 'count', unit: 'readings', displayFormat: '#,##0' }
    }
    if (key.includes('customer_id')) {
      if (normalized(source.tableName).includes('reading')) {
        return { name: 'Billed Customer Count', aggregation: 'count_distinct', unit: 'customers', displayFormat: '#,##0' }
      }
      return { name: 'Electricity Customer Count', aggregation: 'count_distinct', unit: 'customers', displayFormat: '#,##0' }
    }
    return null
  }

  function pickBySource(fields, table, column) {
    return fields.find(field => {
      const source = field.sourceColumn || {}
      return normalized(source.tableName) === normalized(table) && normalized(source.columnName) === normalized(column)
    })
  }

  function pickMetric(metrics, name) {
    return metrics.find(metric => normalized(metric.name) === normalized(name))
  }

  function sourceForMetric(metric, allFields) {
    const fieldId = metric?.expression?.fieldId
    return allFields.find(field => field.id === fieldId)?.sourceColumn || {}
  }

  function pickMetricBySource(metrics, allFields, name, table, column) {
    const candidates = metrics.filter(metric => normalized(metric.name) === normalized(name))
    return candidates.find(metric => {
      const source = sourceForMetric(metric, allFields)
      return normalized(source.tableName) === normalized(table) && normalized(source.columnName) === normalized(column)
    }) || candidates[0]
  }

  function compactSelection(items) {
    return [...new Set(items.filter(Boolean).map(item => item.id || item))]
  }

  log('Discovering projects and attached data sources...')
  const { projects } = await api('/api/admin/projects')
  if (!projects?.length) throw new Error('No accessible projects found. Create/select a tenant project first.')

  const storedScope = (() => {
    try {
      const raw = localStorage.getItem('dashboardos-scoped-builder-state')
      return raw ? JSON.parse(raw)?.state?.scope : null
    } catch {
      return null
    }
  })()

  let selectedProject = projects.find(project => project.id === storedScope?.projectId) || projects[0]
  let { dataSources } = await api(`/api/admin/data-sources?projectId=${selectedProject.id}`)
  if (!dataSources?.length) {
    const withSources = []
    for (const project of projects) {
      const result = await api(`/api/admin/data-sources?projectId=${project.id}`)
      if (result.dataSources?.length) withSources.push({ project, dataSources: result.dataSources })
    }
    if (!withSources.length) throw new Error('No attached data source found in any accessible project.')
    selectedProject = withSources[0].project
    dataSources = withSources[0].dataSources
  }

  const dataSource = dataSources.find(source => source.status === 'active') || dataSources[0]
  log('Using project/data source:', selectedProject.name, '/', dataSource.name)

  let columnsPayload = await api(`/api/admin/schema-columns?projectId=${selectedProject.id}&dataSourceId=${dataSource.id}`)
  if (!columnsPayload.columns?.length || dataSource.schemaLastStatus !== 'success') {
    log('Schema metadata missing/stale; triggering introspection...')
    await api(`/api/admin/data-sources/${dataSource.id}/introspect`, { method: 'POST' })
    columnsPayload = await api(`/api/admin/schema-columns?projectId=${selectedProject.id}&dataSourceId=${dataSource.id}`)
  }

  const columns = (columnsPayload.columns || []).filter(column => column.schemaName !== 'auth' && column.schemaName !== 'storage')
  if (!columns.length) throw new Error('No schema columns available after introspection.')

  const electricityTables = new Set(['electricity_readings', 'electricity_customers'])
  const electricityColumns = columns.filter(column => electricityTables.has(normalized(column.tableName)))
  if (!electricityColumns.length) {
    throw new Error('The attached source has no electricity_readings or electricity_customers columns available for the demo.')
  }

  const tableGroups = new Map()
  for (const column of electricityColumns) {
    const key = `${column.schemaName}.${column.tableName}`
    tableGroups.set(key, [...(tableGroups.get(key) || []), column])
  }
  log('Using electricity-scoped tables:', [...tableGroups.keys()])

  const modelName = 'Electricity Operations Semantic Model'
  const { model } = await api('/api/admin/semantic-models', {
    method: 'POST',
    body: JSON.stringify({
      tenantId: selectedProject.tenantId,
      projectId: selectedProject.id,
      name: `${modelName} ${runSlug}`,
      description: 'Governed semantic layer for electricity customer, billing, consumption, and outage demo analytics.',
    }),
  })

  log('Created semantic model:', model.name)
  for (const [, tableColumns] of tableGroups) {
    const entity = entityForTable(tableColumns[0].tableName, tableColumns)
    for (const column of tableColumns) {
      const role = roleForColumn(column)
      if (role === 'hidden') continue
      await api(`/api/admin/semantic-models/${model.id}/field-mappings`, {
        method: 'POST',
        body: JSON.stringify({
          entityName: entity.name,
          entityType: entity.type,
          fieldName: titleFromColumn(column.columnName),
          role,
          dataSourceId: dataSource.id,
          schemaName: column.schemaName,
          tableName: column.tableName,
          columnName: column.columnName,
          dataType: column.dataType,
          isFilterable: ['dimension', 'date', 'identifier'].includes(role),
          isTooltipField: role !== 'hidden',
        }),
      })
    }
  }

  let entities = (await api(`/api/admin/semantic-models/${model.id}/field-mappings`)).entities || []
  let fields = entities.flatMap(entity => entity.fields.map(field => ({ ...field, entity })))
  const metricSourceFields = fields.filter(field => ['metric_source', 'identifier'].includes(field.role))
  for (const field of metricSourceFields) {
    const spec = metricSpecForField(field)
    if (!spec) continue
    await api(`/api/admin/semantic-models/${model.id}/metrics`, {
      method: 'POST',
      body: JSON.stringify({
        entityId: field.entity.id,
        fieldId: field.id,
        name: spec.name,
        aggregation: spec.aggregation,
        unit: spec.unit,
        displayFormat: spec.displayFormat,
      }),
    })
  }

  entities = (await api(`/api/admin/semantic-models/${model.id}/field-mappings`)).entities || []
  fields = entities.flatMap(entity => entity.fields.map(field => ({ ...field, entity })))
  let metrics = (await api(`/api/admin/semantic-models/${model.id}/metrics`)).metrics || []

  const readingCustomer = fields.find(field => (
    normalized(field.sourceColumn?.tableName).includes('reading') &&
    normalized(field.sourceColumn?.columnName) === 'customer_id'
  ))
  const customerId = fields.find(field => (
    normalized(field.sourceColumn?.tableName).includes('customer') &&
    normalized(field.sourceColumn?.columnName) === 'customer_id'
  ))
  let relationship = null
  if (readingCustomer && customerId && readingCustomer.entity.id !== customerId.entity.id) {
    relationship = (await api(`/api/admin/semantic-models/${model.id}/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        fromEntityId: readingCustomer.entity.id,
        toEntityId: customerId.entity.id,
        fromFieldId: readingCustomer.id,
        toFieldId: customerId.id,
        type: 'many_to_one',
        description: 'Each monthly reading belongs to one electricity customer.',
      }),
    })).relationship
  }
  const relationships = relationship ? [relationship] : []

  const approved = (await api(`/api/admin/semantic-models/${model.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved' }),
  })).model
  log('Approved semantic model:', approved.name)

  const field = {
    billMonth: fields.find(item => normalized(item.sourceColumn?.columnName).includes('bill_month')),
    city: fields.find(item => normalized(item.sourceColumn?.columnName) === 'city'),
    connectionType: fields.find(item => normalized(item.sourceColumn?.columnName).includes('connection_type')),
    paymentStatus: fields.find(item => normalized(item.sourceColumn?.columnName).includes('payment_status')),
  }
  const metric = {
    units: pickMetricBySource(metrics, fields, 'Total Units Consumed', 'electricity_readings', 'units_consumed_kwh'),
    amount: pickMetricBySource(metrics, fields, 'Total Electricity Bill Amount', 'electricity_readings', 'bill_amount'),
    outage: pickMetricBySource(metrics, fields, 'Average Outage Hours', 'electricity_readings', 'outage_hours'),
    customerCount: pickMetricBySource(metrics, fields, 'Electricity Customer Count', 'electricity_customers', 'customer_id'),
    billedCustomerCount: pickMetricBySource(metrics, fields, 'Billed Customer Count', 'electricity_readings', 'customer_id'),
    readingCount: pickMetricBySource(metrics, fields, 'Reading Count', 'electricity_readings', 'reading_id'),
    load: pickMetricBySource(metrics, fields, 'Average Sanctioned Load', 'electricity_customers', 'sanctioned_load_kw'),
  }

  const missing = []
  if (!field.billMonth) missing.push('public.electricity_readings.bill_month')
  if (!field.city) missing.push('public.electricity_customers.city')
  if (!field.connectionType) missing.push('public.electricity_customers.connection_type')
  if (!field.paymentStatus) missing.push('public.electricity_readings.payment_status')
  if (!metric.units) missing.push('metric: Total Units Consumed')
  if (!metric.amount) missing.push('metric: Total Electricity Bill Amount')
  if (!metric.outage) missing.push('metric: Average Outage Hours')
  if (!metric.readingCount && !metric.billedCustomerCount && !metric.customerCount) missing.push('metric: Reading Count, Billed Customer Count, or Customer Count')
  if (!metric.load && !metric.customerCount) missing.push('metric: Average Sanctioned Load or Customer Count')
  if (missing.length) {
    throw new Error(`Attached schema is missing required demo fields: ${missing.join(', ')}`)
  }

  async function createDataset({ name, description, fieldIds, metricIds, relationshipIds }) {
    const created = (await api('/api/admin/datasets', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: selectedProject.tenantId,
        projectId: selectedProject.id,
        modelId: model.id,
        name,
        description,
        fieldIds,
        metricIds,
        relationshipIds,
      }),
    })).dataset
    return (await api(`/api/admin/datasets/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'published' }),
    })).dataset
  }

  log('Creating chart-ready datasets...')
  const datasetTrend = await createDataset({
    name: demoName('Monthly Consumption and Billing Trend'),
    description: 'Monthly energy usage and billed amount trend for the electricity operations demo.',
    fieldIds: compactSelection([field.billMonth]),
    metricIds: compactSelection([metric.units, metric.amount]),
    relationshipIds: [],
  })
  const datasetCityCustomers = await createDataset({
    name: demoName('Customer Base by City'),
    description: 'Customer distribution by service city from the governed customer entity.',
    fieldIds: compactSelection([field.city]),
    metricIds: compactSelection([metric.customerCount]),
    relationshipIds: [],
  })
  const datasetPayment = await createDataset({
    name: demoName('Payment Status Mix'),
    description: 'Reading volume by current payment status.',
    fieldIds: compactSelection([field.paymentStatus]),
    metricIds: compactSelection([metric.readingCount || metric.billedCustomerCount || metric.customerCount]),
    relationshipIds: [],
  })
  const datasetOutage = await createDataset({
    name: demoName('Outage Exposure by Payment Status'),
    description: 'Average outage hours grouped by billing payment status.',
    fieldIds: compactSelection([field.paymentStatus]),
    metricIds: compactSelection([metric.outage]),
    relationshipIds: [],
  })
  const datasetLoad = await createDataset({
    name: demoName('Connection Load Profile'),
    description: 'Average sanctioned load by customer connection type.',
    fieldIds: compactSelection([field.connectionType]),
    metricIds: compactSelection([metric.load || metric.customerCount]),
    relationshipIds: [],
  })

  async function createChart({ dataset, name, description, templateId, x, y, size, order, width }) {
    const chartPayload = {
      tenantId: selectedProject.tenantId,
      projectId: selectedProject.id,
      datasetId: dataset.id,
      name,
      description,
      templateId,
      encoding: {
        xAxisFieldId: x?.id,
        yMetricIds: compactSelection(y),
        tooltipFieldIds: compactSelection([x, ...y]),
        labelById: {},
        colorById: {},
        sort: y?.[0]?.id ? { byId: y[0].id, direction: 'desc' } : null,
        limit: 12,
      },
      presentation: {
        size,
        showLegend: templateId === 'trend-composed' || templateId === 'pie',
        showLabels: templateId === 'pie',
        valueFormat: null,
      },
      interactions: { filterOnClick: true },
      layout: { order, gridSpan: width >= 8 ? 2 : 1 },
    }
    const created = (await api('/api/admin/dashboard-charts', {
      method: 'POST',
      body: JSON.stringify(chartPayload),
    })).chart
    return (await api(`/api/admin/dashboard-charts/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'published' }),
    })).chart
  }

  log('Creating and publishing charts...')
  const charts = []
  charts.push(await createChart({
    dataset: datasetTrend,
    name: demoName('Monthly Consumption and Billing Trend'),
    description: 'Trend view of kWh consumption and billed amount.',
    templateId: 'trend-composed',
    x: field.billMonth,
    y: [metric.units, metric.amount],
    size: 'wide',
    order: 0,
    width: 12,
  }))
  charts.push(await createChart({
    dataset: datasetCityCustomers,
    name: demoName('Customer Base by City'),
    description: 'City comparison ranked by customer count.',
    templateId: 'horizontal-bar',
    x: field.city,
    y: [metric.customerCount],
    size: 'standard',
    order: 1,
    width: 6,
  }))
  charts.push(await createChart({
    dataset: datasetPayment,
    name: demoName('Payment Status Mix'),
    description: 'Composition of readings by payment status.',
    templateId: 'pie',
    x: field.paymentStatus,
    y: [metric.readingCount || metric.billedCustomerCount || metric.customerCount],
    size: 'standard',
    order: 2,
    width: 6,
  }))
  charts.push(await createChart({
    dataset: datasetOutage,
    name: demoName('Average Outage Hours by Payment Status'),
    description: 'Operational reliability comparison by payment status cohort.',
    templateId: 'horizontal-bar',
    x: field.paymentStatus,
    y: [metric.outage],
    size: 'standard',
    order: 3,
    width: 6,
  }))
  charts.push(await createChart({
    dataset: datasetLoad,
    name: demoName('Connection Load Profile'),
    description: 'Average sanctioned load by connection type.',
    templateId: 'bar',
    x: field.connectionType,
    y: [metric.load || metric.customerCount],
    size: 'standard',
    order: 4,
    width: 6,
  }))

  log('Assembling and publishing dashboard...')
  const dashboard = (await api('/api/admin/published-dashboards', {
    method: 'POST',
    body: JSON.stringify({
      tenantId: selectedProject.tenantId,
      projectId: selectedProject.id,
      name: demoName('Electricity Operations Command Center'),
      slug: `electricity-ops-${runSlug}`,
      description: 'Published senior-demo dashboard built from the attached electricity database and governed semantic layer.',
    }),
  })).dashboard

  const versionPayload = {
    title: 'Executive Operations View',
    notes: 'Automated demo version from attached DB schema.',
    layout: { theme: 'dashboardos-dark', density: 'executive' },
    pages: [{
      title: 'Operations Overview',
      slug: 'operations-overview',
      sortOrder: 0,
      layout: { columns: 12 },
      slots: charts.map((chart, index) => ({
        chartConfigId: chart.id,
        title: chart.name,
        slotKey: `chart-${index + 1}`,
        rowIndex: index === 0 ? 0 : 1 + Math.floor((index - 1) / 2),
        columnIndex: index === 0 ? 0 : ((index - 1) % 2) * 6,
        width: index === 0 ? 12 : 6,
        height: index === 0 ? 5 : 4,
        settings: { section: index === 0 ? 'Executive trend' : 'Operational breakdown' },
      })),
    }],
  }
  const version = (await api(`/api/admin/published-dashboards/${dashboard.id}/versions`, {
    method: 'POST',
    body: JSON.stringify(versionPayload),
  })).version
  const published = await api(`/api/admin/published-dashboards/${dashboard.id}/publish`, {
    method: 'POST',
    body: JSON.stringify({ versionId: version.id, notes: 'Ready for senior demo review.' }),
  })

  const tenantSlug = selectedProject.tenantSlug || 'client'
  const summary = {
    tenant: selectedProject.tenantName || selectedProject.tenantId,
    tenantSlug,
    project: selectedProject.name,
    dataSource: dataSource.name,
    semanticModel: approved.name,
    datasets: [datasetTrend, datasetCityCustomers, datasetPayment, datasetOutage, datasetLoad].map(item => item.name),
    charts: charts.map(item => item.name),
    dashboard: published.dashboard.name,
    adminReviewUrl: `${location.origin}/admin/publishing`,
    runtimeReviewUrl: `${location.origin}/client/${tenantSlug}`,
  }
  console.table(summary)
  console.log('DashboardOS demo automation complete:', summary)
  return summary
})().catch(error => {
  console.error('[DashboardOS demo] Automation failed:', error)
})
