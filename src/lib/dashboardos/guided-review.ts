import type { ChartCompatibilityResult, DatasetShape } from '@/types/chart-template'
import type { DataSourceColumnMetadata } from '@/types/data-source'
import type { BusinessMetric, BusinessRelationship } from '@/types/semantic-model'

export type GuidedInferenceKind =
  | 'fact_table'
  | 'dimension_table'
  | 'date_time_column'
  | 'id_candidate'
  | 'foreign_key_candidate'
  | 'category_field'
  | 'status_field'
  | 'name_field'
  | 'numeric_measure'
  | 'sensitive_field'
  | 'relationship_candidate'
  | 'business_area'

export interface GuidedInferenceItem {
  id: string
  kind: GuidedInferenceKind
  label: string
  confidence: number
  reason: string
  reviewRequired: boolean
}

export interface GuidedSchemaProfile {
  tableCount: number
  columnCount: number
  facts: GuidedInferenceItem[]
  dimensions: GuidedInferenceItem[]
  dates: GuidedInferenceItem[]
  identifiers: GuidedInferenceItem[]
  categories: GuidedInferenceItem[]
  measures: GuidedInferenceItem[]
  sensitive: GuidedInferenceItem[]
  relationships: GuidedInferenceItem[]
  businessAreas: GuidedInferenceItem[]
  reviewItems: GuidedInferenceItem[]
}

export interface GuidedSemanticDraft {
  approvedFields: GuidedInferenceItem[]
  suggestedMetrics: GuidedInferenceItem[]
  suggestedRelationships: GuidedInferenceItem[]
  hiddenSensitiveFields: GuidedInferenceItem[]
  needsReview: GuidedInferenceItem[]
}

export interface GuidedDatasetRecipe {
  id: string
  title: string
  description: string
  confidence: number
  suggestedFieldLabels: string[]
  suggestedMetricLabels: string[]
}

export interface GuidedChartRecommendation {
  id: string
  title: string
  chartType: string
  confidence: number
  reason: string
}

const MEASURE_RE = /(amount|revenue|sales|total|count|quantity|orders|customers|users|price|cost|profit|margin|duration|score|usage|units|kwh|consumed|outage|load|balance|rate)/i
const DATE_RE = /(date|time|month|year|quarter|created|updated|posted|paid|billed)/i
const CATEGORY_RE = /(type|status|segment|region|category|country|city|channel|provider|priority|plan|tier|connection|department|zone|state)/i
const NAME_RE = /(^name$|_name$|name_|title|label|description)/i
const SENSITIVE_RE = /(password|secret|token|hash|ssn|aadhaar|pan|email|phone|mobile|address|customer_name|full_name|first_name|last_name|dob|birth|ip_address)/i

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function titleize(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function isNumeric(dataType: string) {
  return /int|numeric|decimal|double|real|money|float|bigint|smallint/i.test(dataType)
}

function isDateLike(column: DataSourceColumnMetadata) {
  return /date|time/i.test(column.dataType) || DATE_RE.test(column.columnName)
}

function tableKey(column: DataSourceColumnMetadata) {
  return `${column.schemaName}.${column.tableName}`
}

function item(id: string, kind: GuidedInferenceKind, label: string, confidence: number, reason: string, reviewRequired = false): GuidedInferenceItem {
  return { id, kind, label, confidence, reason, reviewRequired }
}

export function buildGuidedSchemaProfile(columns: DataSourceColumnMetadata[]): GuidedSchemaProfile {
  const groups = new Map<string, DataSourceColumnMetadata[]>()
  for (const column of columns) groups.set(tableKey(column), [...(groups.get(tableKey(column)) ?? []), column])

  const facts: GuidedInferenceItem[] = []
  const dimensions: GuidedInferenceItem[] = []
  const dates: GuidedInferenceItem[] = []
  const identifiers: GuidedInferenceItem[] = []
  const categories: GuidedInferenceItem[] = []
  const measures: GuidedInferenceItem[] = []
  const sensitive: GuidedInferenceItem[] = []
  const relationships: GuidedInferenceItem[] = []
  const businessAreas: GuidedInferenceItem[] = []

  for (const [key, tableColumns] of groups) {
    const tableName = tableColumns[0]?.tableName ?? key
    const normalizedTable = normalize(tableName)
    const measureCount = tableColumns.filter(column => isNumeric(column.dataType) && MEASURE_RE.test(column.columnName)).length
    const dateCount = tableColumns.filter(isDateLike).length
    const idCount = tableColumns.filter(column => normalize(column.columnName).endsWith('_id') || normalize(column.columnName) === 'id').length
    const categoryCount = tableColumns.filter(column => CATEGORY_RE.test(column.columnName)).length
    const factSignal = measureCount >= 2 || dateCount >= 1 || /(fact|event|order|sale|payment|usage|reading|transaction|monthly|daily|summary)/i.test(normalizedTable)
    const dimensionSignal = !factSignal || /(customer|product|account|region|location|user|employee|vendor|supplier|dim)/i.test(normalizedTable)

    if (factSignal) facts.push(item(key, 'fact_table', titleize(tableName), Math.min(95, 58 + measureCount * 10 + dateCount * 8), 'Contains measurable values and time/event signals.'))
    if (dimensionSignal) dimensions.push(item(key, 'dimension_table', titleize(tableName), Math.min(92, 55 + categoryCount * 8 + idCount * 5), 'Looks useful for grouping, labels, or lookup context.'))

    businessAreas.push(item(`area:${key}`, 'business_area', titleize(tableName.replace(/^(fact_|dim_)/, '')), Math.min(90, 54 + measureCount * 8 + categoryCount * 5), 'Grouped from table naming and field roles.', measureCount === 0 && categoryCount === 0))
  }

  for (const column of columns) {
    const key = `${tableKey(column)}.${column.columnName}`
    const normalizedName = normalize(column.columnName)
    const label = titleize(column.columnName)

    if (isDateLike(column)) dates.push(item(key, 'date_time_column', label, /date|time/i.test(column.dataType) ? 92 : 76, 'Date-like name or database type.'))

    if (normalizedName === 'id') {
      identifiers.push(item(key, 'id_candidate', label, 86, 'Primary identifier naming pattern.', false))
    } else if (normalizedName.endsWith('_id')) {
      identifiers.push(item(key, 'foreign_key_candidate', label, 82, 'Foreign-key style naming pattern.', true))
      const target = normalizedName.replace(/_id$/, '')
      const targetTable = [...groups.keys()].find(groupKey => normalize(groupKey).includes(target))
      relationships.push(item(`rel:${key}`, 'relationship_candidate', `${titleize(column.tableName)} to ${targetTable ? titleize(targetTable.split('.').pop() ?? target) : titleize(target)}`, targetTable ? 78 : 58, targetTable ? 'Foreign-key style column matches another table name.' : 'Foreign-key style column needs reviewer confirmation.', !targetTable))
    }

    if (CATEGORY_RE.test(column.columnName)) {
      categories.push(item(key, CATEGORY_RE.test(normalizedName) && normalizedName.includes('status') ? 'status_field' : 'category_field', label, 82, 'Good candidate for grouping, filtering, or dashboard slices.'))
    }

    if (NAME_RE.test(column.columnName)) {
      categories.push(item(key, 'name_field', label, SENSITIVE_RE.test(column.columnName) ? 52 : 72, 'Name-like field; use as label only after privacy review.', SENSITIVE_RE.test(column.columnName)))
    }

    if (isNumeric(column.dataType) && MEASURE_RE.test(column.columnName)) {
      measures.push(item(key, 'numeric_measure', label, 88, 'Numeric business measure candidate.'))
    } else if (isNumeric(column.dataType) && !normalizedName.endsWith('_id')) {
      measures.push(item(key, 'numeric_measure', label, 62, 'Numeric column that may be a metric; reviewer should confirm.', true))
    }

    if (SENSITIVE_RE.test(column.columnName)) {
      sensitive.push(item(key, 'sensitive_field', label, 90, 'Hidden by default because the name matches sensitive-data patterns.', true))
    }
  }

  const reviewItems = [...identifiers, ...relationships, ...measures, ...categories, ...businessAreas, ...sensitive]
    .filter(entry => entry.reviewRequired || entry.confidence < 70)
    .slice(0, 8)

  return {
    tableCount: groups.size,
    columnCount: columns.length,
    facts,
    dimensions,
    dates,
    identifiers,
    categories,
    measures,
    sensitive,
    relationships,
    businessAreas,
    reviewItems,
  }
}

export function buildGuidedSemanticDraft(profile: GuidedSchemaProfile): GuidedSemanticDraft {
  return {
    approvedFields: [...profile.dates, ...profile.categories, ...profile.measures]
      .filter(entry => !entry.reviewRequired && entry.confidence >= 75)
      .slice(0, 10),
    suggestedMetrics: profile.measures.slice(0, 8),
    suggestedRelationships: profile.relationships.slice(0, 6),
    hiddenSensitiveFields: profile.sensitive,
    needsReview: profile.reviewItems,
  }
}

export function buildGuidedDatasetRecipes(input: {
  fields: Array<{ id: string; name: string; role?: string }>
  metrics: Array<Pick<BusinessMetric, 'id' | 'name' | 'aggregation'>>
  relationships?: BusinessRelationship[]
}): GuidedDatasetRecipe[] {
  const fields = input.fields
  const metrics = input.metrics
  const dateFields = fields.filter(field => field.role === 'date')
  const categories = fields.filter(field => field.role === 'dimension' || field.role === 'attribute')
  const metricNames = metrics.map(metric => metric.name)
  const fieldNames = fields.map(field => field.name)
  const recipes: GuidedDatasetRecipe[] = []

  if (metrics.length > 0) {
    recipes.push({
      id: 'executive-overview',
      title: 'Executive overview',
      description: 'A compact leadership dataset using the strongest metrics and date/category context.',
      confidence: dateFields.length ? 88 : 76,
      suggestedFieldLabels: [...dateFields, ...categories].slice(0, 3).map(field => field.name),
      suggestedMetricLabels: metricNames.slice(0, 4),
    })
  }

  if (categories.some(field => /region|city|country|state|zone/i.test(field.name))) {
    recipes.push({
      id: 'regional-performance',
      title: 'Regional performance',
      description: 'Compare governed measures across location or market dimensions.',
      confidence: 82,
      suggestedFieldLabels: fieldNames.filter(name => /region|city|country|state|zone/i.test(name)).slice(0, 3),
      suggestedMetricLabels: metricNames.slice(0, 3),
    })
  }

  if (categories.some(field => /status|priority|type|segment/i.test(field.name))) {
    recipes.push({
      id: 'operations-health',
      title: 'Operations health',
      description: 'Track activity by status, type, or segment with safe aggregate metrics.',
      confidence: 78,
      suggestedFieldLabels: fieldNames.filter(name => /status|priority|type|segment/i.test(name)).slice(0, 3),
      suggestedMetricLabels: metricNames.slice(0, 3),
    })
  }

  if (metricNames.some(name => /customer|user|account/i.test(name)) || fieldNames.some(name => /customer|user|account/i.test(name))) {
    recipes.push({
      id: 'customer-activity',
      title: 'Customer activity',
      description: 'Summarize customer-level activity without exposing customer-identifying fields.',
      confidence: 74,
      suggestedFieldLabels: categories.map(field => field.name).slice(0, 3),
      suggestedMetricLabels: metricNames.filter(name => /customer|user|account|order|usage/i.test(name)).slice(0, 3),
    })
  }

  if (metricNames.some(name => /revenue|amount|cost|profit|bill|margin|sales/i.test(name))) {
    recipes.push({
      id: 'finance-summary',
      title: 'Finance summary',
      description: 'Aggregate financial measures for reviewed dashboard reporting.',
      confidence: 84,
      suggestedFieldLabels: [...dateFields, ...categories].slice(0, 3).map(field => field.name),
      suggestedMetricLabels: metricNames.filter(name => /revenue|amount|cost|profit|bill|margin|sales/i.test(name)).slice(0, 4),
    })
  }

  return recipes.slice(0, 5)
}

export function buildGuidedChartRecommendations(input: {
  shape?: DatasetShape | null
  compatibility?: ChartCompatibilityResult[]
  fields?: Array<{ id: string; name: string; role?: string }>
  metrics?: Array<{ id: string; name: string }>
}): GuidedChartRecommendation[] {
  const shape = input.shape
  const recommended = input.compatibility?.find(option => option.status === 'recommended')
  const hasDate = Boolean(shape?.hasDateAxis || input.fields?.some(field => field.role === 'date'))
  const hasMetric = Boolean((shape?.metricCount ?? input.metrics?.length ?? 0) > 0)
  const hasCategory = Boolean((shape?.dimensionCount ?? input.fields?.length ?? 0) > 0)
  const recommendations: GuidedChartRecommendation[] = []

  if (recommended) {
    recommendations.push({
      id: `recommended:${recommended.template.id}`,
      title: recommended.template.name,
      chartType: recommended.template.id,
      confidence: Math.min(98, recommended.score),
      reason: 'Best current template match from the validated dataset shape.',
    })
  }

  if (hasDate && hasMetric) {
    recommendations.push({
      id: 'trend',
      title: 'Trend over time',
      chartType: 'line',
      confidence: 86,
      reason: 'Time field plus metric supports a trend chart.',
    })
  }

  if (hasCategory && hasMetric) {
    recommendations.push({
      id: 'category-bar',
      title: 'Category comparison',
      chartType: 'bar',
      confidence: 82,
      reason: 'Category field plus metric supports a ranked comparison.',
    })
  }

  if ((shape?.metricCount ?? input.metrics?.length ?? 0) >= 1) {
    recommendations.push({
      id: 'kpi-cards',
      title: 'KPI cards',
      chartType: 'stat',
      confidence: 74,
      reason: 'Metric set can produce executive summary cards.',
    })
  }

  const unique = new Map<string, GuidedChartRecommendation>()
  for (const recommendation of recommendations) {
    if (!unique.has(recommendation.id)) unique.set(recommendation.id, recommendation)
  }
  return [...unique.values()].slice(0, 4)
}
