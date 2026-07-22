import type { ChartCompatibilityResult, DatasetShape } from '@/types/chart-template'
import type { DataSourceColumnMetadata } from '@/types/data-source'
import type { DashboardChartConfig } from '@/types/dashboard-chart'
import type { DashboardChartSlot, DashboardPage, DashboardVersion, PublishedDashboard } from '@/types/dashboard-publishing'
import type { BusinessMetric, BusinessRelationship } from '@/types/semantic-model'
import type { SemanticDataset } from '@/types/semantic-dataset'

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

export interface GuidedSemanticAssetLink {
  modelId: string
  modelName: string
  modelVersion: number
  materializedAt: string
  fieldCount: number
  metricCount: number
  relationshipCount: number
}

export interface GuidedWorkflowLineage {
  schemaProfile: {
    profileId?: string | null
    dataSourceId?: string | null
    schemaHash?: string | null
    generatedAt: string
  }
  review: {
    decisionCount: number
    openItemCount: number
    updatedAt: string
  }
  semanticDraft: {
    version: number
    status: GuidedReviewState['semanticDraftStatus']
    approvedAt?: string | null
    approvedBy?: string | null
  }
  semanticAsset?: GuidedSemanticAssetLink | null
}

export interface GuidedDraftLineage {
  generatedAt: string
  generatedFrom: string
  schemaProfileId?: string | null
  schemaHash?: string | null
  semanticDraftVersion: number
  semanticModelId?: string | null
  semanticModelVersion?: number | null
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

export type GuidedReviewDecisionAction =
  | 'approve'
  | 'reject'
  | 'edit_classification'
  | 'confirm_relationship'
  | 'reject_relationship'
  | 'keep_hidden'
  | 'unhide'

export interface GuidedReviewDecision {
  itemId: string
  action: GuidedReviewDecisionAction
  overrideKind?: GuidedInferenceKind
  note?: string | null
  decidedBy?: string | null
  decidedAt: string
}

export class GuidedReviewStateConflictError extends Error {
  readonly code = 'GUIDED_REVIEW_STATE_CONFLICT'

  constructor(message = 'Approved guided review state is immutable. Create a new schema/review revision before changing decisions.') {
    super(message)
    this.name = 'GuidedReviewStateConflictError'
  }
}

export interface GuidedReviewState {
  profile: GuidedSchemaProfile
  semanticDraft: GuidedSemanticDraft
  decisions: GuidedReviewDecision[]
  semanticDraftStatus: 'not_started' | 'reviewing' | 'approved'
  semanticDraftVersion: number
  semanticAsset?: GuidedSemanticAssetLink | null
  lineage?: GuidedWorkflowLineage
  approvedAt?: string | null
  approvedBy?: string | null
}

export type GuidedProgressStepId =
  | 'connect_db'
  | 'review_findings'
  | 'approve_model'
  | 'generate_draft_dashboard'
  | 'preview'
  | 'publish'
  | 'view_client_dashboard'

export const GUIDED_DASHBOARD_GENERATION_AVAILABLE = false

export interface GuidedProgressStep {
  id: GuidedProgressStepId
  label: string
  status: 'done' | 'ready' | 'blocked'
  detail: string
}

export interface GuidedContinueAction {
  stepId: GuidedProgressStepId
  label: string
  href: string
  detail: string
}

export interface GuidedContinueState {
  currentStep: GuidedProgressStep
  completedSteps: GuidedProgressStep[]
  blockerSteps: GuidedProgressStep[]
  nextAction: GuidedContinueAction
  isComplete: boolean
}

export type GuidedPublishReadinessStatus =
  | 'ready_to_publish'
  | 'previewable_not_publishable'
  | 'draft_incomplete'
  | 'blocked_by_validation'

export type GuidedPublishReadinessSeverity = 'ready' | 'warning' | 'blocker'

export interface GuidedPublishReadinessCheck {
  id:
    | 'schema_introspection'
    | 'semantic_asset'
    | 'review_exceptions'
    | 'dataset_draft'
    | 'dashboard_draft'
    | 'release_storage'
    | 'publish_target'
    | 'runtime_validation'
  label: string
  severity: GuidedPublishReadinessSeverity
  message: string
  action?: GuidedContinueAction
}

export interface GuidedPublishReadinessResult {
  status: GuidedPublishReadinessStatus
  publishEligible: boolean
  evaluatedAt: string
  checks: GuidedPublishReadinessCheck[]
  readyItems: GuidedPublishReadinessCheck[]
  blockers: GuidedPublishReadinessCheck[]
  warnings: GuidedPublishReadinessCheck[]
  nextFixAction?: GuidedContinueAction
  summary: string
}

export interface GuidedDatasetDraftPlan {
  recipe: GuidedDatasetRecipe
  name: string
  fieldIds: string[]
  metricIds: string[]
  relationshipIds: string[]
  reviewNotes: string[]
  lineage?: GuidedDraftLineage
}

export interface GuidedDashboardDraftPlan {
  title: string
  charts: Array<{
    title: string
    templateId: string
    fieldIds: string[]
    metricIds: string[]
    gridSpan: number
    reviewNote?: string
  }>
  layout: {
    mode: 'responsive-grid'
    slotCount: number
  }
  reviewNotes: string[]
  lineage?: GuidedDraftLineage
}

export interface GuidedPublishReadinessInput {
  evaluatedAt?: string
  profileState?: GuidedReviewState | null
  schemaIntrospection?: {
    dataSourceId?: string | null
    status?: string | null
    error?: string | null
    schemaHash?: string | null
    scopeStatus?: string | null
  } | null
  models?: Array<{ id: string; status?: string | null; version?: number | null }> | null
  activeSemanticModelId?: string | null
  datasets?: Array<Pick<SemanticDataset, 'id' | 'modelId' | 'status' | 'selection'> & { description?: string | null }> | null
  charts?: Array<Pick<DashboardChartConfig, 'id' | 'datasetId' | 'status' | 'validationState' | 'encoding' | 'templateId'>> | null
  dashboards?: Array<Pick<PublishedDashboard, 'id' | 'slug' | 'status' | 'currentVersionId' | 'publishedAt'>> | null
  versions?: Array<Pick<DashboardVersion, 'id' | 'dashboardId' | 'status' | 'versionNumber' | 'notes'>> | null
  pages?: Array<Pick<DashboardPage, 'id' | 'versionId' | 'slug'>> | null
  slots?: Array<Pick<DashboardChartSlot, 'id' | 'versionId' | 'chartConfigId'>> | null
  releaseStorage?: {
    ready: boolean
    error?: string | null
  } | null
  selectedDashboardId?: string | null
  selectedVersionId?: string | null
  clientUrl?: string | null
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

function buildLineage(input: {
  state: Pick<GuidedReviewState, 'decisions' | 'semanticDraft' | 'semanticDraftStatus' | 'semanticDraftVersion' | 'approvedAt' | 'approvedBy'>
  profileId?: string | null
  dataSourceId?: string | null
  schemaHash?: string | null
  generatedAt: string
  semanticAsset?: GuidedSemanticAssetLink | null
}): GuidedWorkflowLineage {
  return {
    schemaProfile: {
      profileId: input.profileId ?? null,
      dataSourceId: input.dataSourceId ?? null,
      schemaHash: input.schemaHash ?? null,
      generatedAt: input.generatedAt,
    },
    review: {
      decisionCount: input.state.decisions.length,
      openItemCount: input.state.semanticDraft.needsReview.length,
      updatedAt: input.generatedAt,
    },
    semanticDraft: {
      version: input.state.semanticDraftVersion,
      status: input.state.semanticDraftStatus,
      approvedAt: input.state.approvedAt ?? null,
      approvedBy: input.state.approvedBy ?? null,
    },
    semanticAsset: input.semanticAsset ?? null,
  }
}

export function buildGuidedDraftLineage(input: {
  generatedAt: string
  profileId?: string | null
  schemaHash?: string | null
  semanticDraftVersion?: number | null
  semanticAsset?: GuidedSemanticAssetLink | null
}): GuidedDraftLineage {
  return {
    generatedAt: input.generatedAt,
    generatedFrom: input.semanticAsset
      ? `approved semantic draft v${input.semanticDraftVersion ?? 1} / semantic model v${input.semanticAsset.modelVersion}`
      : `approved semantic draft v${input.semanticDraftVersion ?? 1}`,
    schemaProfileId: input.profileId ?? null,
    schemaHash: input.schemaHash ?? null,
    semanticDraftVersion: input.semanticDraftVersion ?? 1,
    semanticModelId: input.semanticAsset?.modelId ?? null,
    semanticModelVersion: input.semanticAsset?.modelVersion ?? null,
  }
}

export function guidedLineageLabel(lineage?: GuidedDraftLineage | null) {
  if (!lineage) return 'Generated from guided review'
  return `Generated from ${lineage.generatedFrom}`
}

function readinessCheck(
  id: GuidedPublishReadinessCheck['id'],
  label: string,
  severity: GuidedPublishReadinessSeverity,
  message: string,
  action?: GuidedContinueAction,
): GuidedPublishReadinessCheck {
  return { id, label, severity, message, action }
}

function firstById<T extends { id: string }>(items: T[] | null | undefined, id: string | null | undefined) {
  if (!id) return null
  return items?.find(item => item.id === id) ?? null
}

function hasSupportedChartRuntime(chart: Pick<DashboardChartConfig, 'encoding' | 'validationState'>) {
  if (chart.validationState === 'invalid' || chart.validationState === 'unknown') return false
  if ((chart.encoding.filters?.length ?? 0) > 4) return false
  if (chart.encoding.limit !== null && chart.encoding.limit !== undefined && (chart.encoding.limit < 1 || chart.encoding.limit > 500)) return false
  return chart.encoding.yMetricIds.length > 0
}

export function buildGuidedPublishReadiness(input: GuidedPublishReadinessInput): GuidedPublishReadinessResult {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString()
  const semanticAsset = input.profileState?.semanticAsset ?? null
  const activeModel = semanticAsset ? firstById(input.models ?? [], semanticAsset.modelId) : null
  const hasActiveSemanticAsset = Boolean(
    semanticAsset
    && activeModel?.status === 'approved'
    && input.activeSemanticModelId === semanticAsset.modelId,
  )
  const datasets = input.datasets ?? []
  const linkedDatasets = semanticAsset
    ? datasets.filter(dataset => dataset.modelId === semanticAsset.modelId)
    : []
  const dataset = linkedDatasets.find(item => item.status === 'published')
    ?? linkedDatasets.find(item => item.status === 'draft')
    ?? linkedDatasets[0]
    ?? null
  const charts = input.charts ?? []
  const dashboard = input.selectedDashboardId
    ? firstById(input.dashboards ?? [], input.selectedDashboardId)
    : (input.dashboards ?? []).find(item => item.status === 'published' || item.currentVersionId)
      ?? (input.dashboards ?? [])[0]
      ?? null
  const explicitlySelectedVersion = firstById(input.versions ?? [], input.selectedVersionId)
  const version = input.selectedVersionId
    ? explicitlySelectedVersion?.dashboardId === dashboard?.id ? explicitlySelectedVersion : null
    : (dashboard?.currentVersionId ? firstById(input.versions ?? [], dashboard.currentVersionId) : null)
      ?? (input.versions ?? []).find(item => item.dashboardId === dashboard?.id)
      ?? null
  const pages = version ? (input.pages ?? []).filter(page => page.versionId === version.id) : []
  const slots = version ? (input.slots ?? []).filter(slot => slot.versionId === version.id) : []
  const slotChartIds = new Set(slots.map(slot => slot.chartConfigId))
  const candidateCharts = charts.filter(chart => slotChartIds.has(chart.id))
  const mismatchedDatasetCharts = dataset
    ? candidateCharts.filter(chart => chart.datasetId !== dataset.id)
    : candidateCharts
  const linkedCharts = dataset ? candidateCharts.filter(chart => chart.datasetId === dataset.id) : []
  const validCharts = linkedCharts.filter(chart => (
    chart.status === 'published'
    && chart.validationState === 'valid'
    && hasSupportedChartRuntime(chart)
  ))
  const warningCharts = linkedCharts.filter(chart => chart.status === 'published' && chart.validationState === 'warning')
  const invalidCharts = linkedCharts.filter(chart => (
    !hasSupportedChartRuntime(chart)
    || chart.status !== 'published'
    || chart.validationState !== 'valid'
  ))
  const reviewOpenCount = input.profileState?.semanticDraft.needsReview.length ?? 0
  const checks: GuidedPublishReadinessCheck[] = []

  const expectedSchemaHash = input.profileState?.lineage?.schemaProfile.schemaHash ?? null
  const schemaIntrospectionReady = Boolean(
    input.schemaIntrospection?.status === 'ok'
    && (!expectedSchemaHash || input.schemaIntrospection.schemaHash === expectedSchemaHash)
    && (!input.schemaIntrospection.scopeStatus || input.schemaIntrospection.scopeStatus === 'confirmed'),
  )
  checks.push(schemaIntrospectionReady
    ? readinessCheck('schema_introspection', 'Schema completeness', 'ready', 'The active guided profile is backed by a complete schema scan.')
    : readinessCheck(
      'schema_introspection',
      'Schema completeness',
      'blocker',
      input.schemaIntrospection?.scopeStatus && input.schemaIntrospection.scopeStatus !== 'confirmed'
        ? 'Publish requires the discovered table scope to be reviewed and confirmed.'
        : input.schemaIntrospection?.error
        ? `Schema scan is not publish-safe: ${input.schemaIntrospection.error}`
        : 'Publish requires a complete schema scan that matches the guided profile.',
      DEFAULT_GUIDED_ACTIONS.connect_db,
    ))

  checks.push(hasActiveSemanticAsset
    ? readinessCheck('semantic_asset', 'Semantic asset', 'ready', `${semanticAsset?.modelName ?? 'Semantic model'} is approved and active.`)
    : readinessCheck('semantic_asset', 'Semantic asset', 'blocker', 'Approve and activate the guided semantic model before publishing.', DEFAULT_GUIDED_ACTIONS.approve_model))

  checks.push(reviewOpenCount === 0
    ? readinessCheck('review_exceptions', 'Review exceptions', 'ready', 'Required review exceptions are resolved or accepted.')
    : readinessCheck('review_exceptions', 'Review exceptions', 'blocker', `${reviewOpenCount} guided review item${reviewOpenCount === 1 ? '' : 's'} still need a decision.`, DEFAULT_GUIDED_ACTIONS.review_findings))

  const datasetHasContent = Boolean(dataset && ((dataset.selection.fieldIds.length + dataset.selection.metricIds.length) > 0))
  const datasetPublishable = Boolean(datasetHasContent && dataset?.status === 'published')
  checks.push(datasetPublishable
    ? readinessCheck('dataset_draft', 'Dataset release', 'ready', 'A published dataset is linked to the active semantic model.')
    : readinessCheck(
      'dataset_draft',
      'Dataset release',
      hasActiveSemanticAsset ? 'blocker' : 'warning',
      datasetHasContent ? 'The linked dataset is previewable but must be published before dashboard release.' : 'Create and publish a dataset from the active semantic model.',
      DEFAULT_GUIDED_ACTIONS.generate_draft_dashboard,
    ))

  const hasDashboardStructure = Boolean(version && pages.length > 0 && slots.length > 0)
  checks.push(hasDashboardStructure
    ? readinessCheck('dashboard_draft', 'Dashboard structure', 'ready', `${slots.length} persisted chart slot${slots.length === 1 ? '' : 's'} belong to the selected dashboard version.`)
    : readinessCheck('dashboard_draft', 'Dashboard structure', datasetHasContent ? 'blocker' : 'warning', 'Publish requires a selected dashboard version with at least one persisted page and chart slot.', DEFAULT_GUIDED_ACTIONS.preview))

  if (input.releaseStorage) {
    checks.push(input.releaseStorage.ready
      ? readinessCheck('release_storage', 'Immutable release storage', 'ready', 'Immutable dashboard release storage is available.')
      : readinessCheck(
        'release_storage',
        'Immutable release storage',
        'blocker',
        input.releaseStorage.error ?? 'Immutable dashboard release storage must be configured before publishing.',
      ))
  }

  const targetIdentified = Boolean(input.clientUrl && dashboard?.slug && version && version.dashboardId === dashboard.id)
  checks.push(targetIdentified
    ? readinessCheck('publish_target', 'Publish target', 'ready', `The selected dashboard version has a client path at ${input.clientUrl}; runtime execution is validated separately.`)
    : readinessCheck('publish_target', 'Publish target', dashboard ? 'blocker' : 'warning', 'Select a version that belongs to the target dashboard and has a tenant client path.', DEFAULT_GUIDED_ACTIONS.publish))

  if (
    hasDashboardStructure
    && slots.every(slot => validCharts.some(chart => chart.id === slot.chartConfigId))
    && invalidCharts.length === 0
    && warningCharts.length === 0
    && mismatchedDatasetCharts.length === 0
  ) {
    checks.push(readinessCheck('runtime_validation', 'Configuration validation', 'ready', 'Every persisted slot references a published, client-compatible chart configuration. Live query execution is not asserted by this check.'))
  } else {
    const warningDetail = warningCharts.length > 0
      ? ` ${warningCharts.length} warning chart${warningCharts.length === 1 ? '' : 's'} remain preview-only because the client runtime serves valid charts only.`
      : ''
    checks.push(readinessCheck('runtime_validation', 'Configuration validation', 'blocker', `Publish requires every persisted slot to reference a published, valid, dataset-consistent chart.${warningDetail}`, DEFAULT_GUIDED_ACTIONS.preview))
  }

  const readyItems = checks.filter(check => check.severity === 'ready')
  const blockers = checks.filter(check => check.severity === 'blocker')
  const warnings = checks.filter(check => check.severity === 'warning')
  const hasPreview = datasetHasContent && (linkedCharts.length > 0 || hasDashboardStructure)
  const status: GuidedPublishReadinessStatus = blockers.length === 0
    ? 'ready_to_publish'
    : checks.some(check => check.id === 'runtime_validation' && check.severity === 'blocker')
      ? 'blocked_by_validation'
      : hasPreview
        ? 'previewable_not_publishable'
        : 'draft_incomplete'

  return {
    status,
    publishEligible: blockers.length === 0,
    evaluatedAt,
    checks,
    readyItems,
    blockers,
    warnings,
    nextFixAction: blockers.find(check => check.action)?.action ?? warnings.find(check => check.action)?.action,
    summary: blockers.length === 0
      ? warnings.length > 0
        ? 'Ready to publish with warnings.'
        : 'Ready to publish.'
      : status === 'blocked_by_validation'
        ? 'Blocked by configuration validation.'
        : status === 'previewable_not_publishable'
          ? 'Previewable, but not publishable yet.'
          : 'Draft incomplete.',
  }
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

export function buildGuidedReviewState(columns: DataSourceColumnMetadata[], context: {
  profileId?: string | null
  dataSourceId?: string | null
  schemaHash?: string | null
  generatedAt?: string
} = {}): GuidedReviewState {
  const profile = buildGuidedSchemaProfile(columns)
  const semanticDraft = buildGuidedSemanticDraft(profile)
  const generatedAt = context.generatedAt ?? new Date().toISOString()
  const state: GuidedReviewState = {
    profile,
    semanticDraft,
    decisions: [],
    semanticDraftStatus: profile.reviewItems.length > 0 ? 'reviewing' : 'not_started',
    semanticDraftVersion: 1,
    semanticAsset: null,
    approvedAt: null,
    approvedBy: null,
  }
  return {
    ...state,
    lineage: buildLineage({
      state,
      profileId: context.profileId ?? null,
      dataSourceId: context.dataSourceId ?? columns[0]?.dataSourceId ?? null,
      schemaHash: context.schemaHash ?? null,
      generatedAt,
      semanticAsset: null,
    }),
  }
}

export function applyGuidedReviewDecision(state: GuidedReviewState, decision: GuidedReviewDecision): GuidedReviewState {
  if (state.semanticDraftStatus === 'approved') {
    throw new GuidedReviewStateConflictError()
  }

  const nextDecisions = [
    ...state.decisions.filter(item => item.itemId !== decision.itemId),
    decision,
  ]
  const approvedOrRejected = new Set(nextDecisions
    .filter(item => ['approve', 'reject', 'confirm_relationship', 'reject_relationship', 'keep_hidden', 'unhide'].includes(item.action))
    .map(item => item.itemId))
  const remainingReviewItems = state.semanticDraft.needsReview.filter(item => !approvedOrRejected.has(item.id))

  const nextState: GuidedReviewState = {
    ...state,
    decisions: nextDecisions,
    semanticDraft: {
      ...state.semanticDraft,
      needsReview: remainingReviewItems,
    },
    semanticDraftStatus: remainingReviewItems.length === 0 ? 'reviewing' : state.semanticDraftStatus,
    semanticDraftVersion: (state.semanticDraftVersion ?? 1) + 1,
    semanticAsset: null,
    approvedAt: null,
    approvedBy: null,
  }
  return {
    ...nextState,
    lineage: buildLineage({
      state: nextState,
      profileId: state.lineage?.schemaProfile.profileId ?? null,
      dataSourceId: state.lineage?.schemaProfile.dataSourceId ?? null,
      schemaHash: state.lineage?.schemaProfile.schemaHash ?? null,
      generatedAt: decision.decidedAt,
      semanticAsset: nextState.semanticAsset ?? null,
    }),
  }
}

export function approveGuidedSemanticDraft(
  state: GuidedReviewState,
  actorUserId: string | null,
  decidedAt: string,
  semanticAsset: GuidedSemanticAssetLink | null = null,
): GuidedReviewState {
  const autoApprovals = state.semanticDraft.approvedFields.map(field => ({
    itemId: field.id,
    action: 'approve' as const,
    note: 'Accepted as high-confidence guided recommendation.',
    decidedBy: actorUserId,
    decidedAt,
  }))
  const decisionByItemId = new Map(state.decisions.map(decision => [decision.itemId, decision]))
  for (const decision of autoApprovals) {
    if (!decisionByItemId.has(decision.itemId)) decisionByItemId.set(decision.itemId, decision)
  }

  const nextState: GuidedReviewState = {
    ...state,
    decisions: [...decisionByItemId.values()],
    semanticDraft: {
      ...state.semanticDraft,
      needsReview: [],
    },
    semanticDraftStatus: 'approved',
    semanticDraftVersion: state.semanticDraftVersion ?? 1,
    semanticAsset,
    approvedAt: decidedAt,
    approvedBy: actorUserId,
  }
  return {
    ...nextState,
    lineage: buildLineage({
      state: nextState,
      profileId: state.lineage?.schemaProfile.profileId ?? null,
      dataSourceId: state.lineage?.schemaProfile.dataSourceId ?? null,
      schemaHash: state.lineage?.schemaProfile.schemaHash ?? null,
      generatedAt: decidedAt,
      semanticAsset,
    }),
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

export function buildGuidedDatasetDraftFromRecipe(input: {
  recipe: GuidedDatasetRecipe
  fields: Array<{ id: string; name: string; role?: string }>
  metrics: Array<Pick<BusinessMetric, 'id' | 'name' | 'aggregation'>>
  relationships?: BusinessRelationship[]
  lineage?: GuidedDraftLineage
}): GuidedDatasetDraftPlan {
  const fieldIds = input.fields
    .filter(field => input.recipe.suggestedFieldLabels.includes(field.name))
    .map(field => field.id)
  const metricIds = input.metrics
    .filter(metric => input.recipe.suggestedMetricLabels.includes(metric.name))
    .map(metric => metric.id)
  const relationshipIds = (input.relationships ?? []).slice(0, 2).map(relationship => relationship.id)
  const reviewNotes: string[] = []

  if (fieldIds.length !== input.recipe.suggestedFieldLabels.length) {
    reviewNotes.push('Some suggested fields were not available in the approved semantic model.')
  }
  if (metricIds.length !== input.recipe.suggestedMetricLabels.length) {
    reviewNotes.push('Some suggested metrics were not available in the approved semantic model.')
  }
  if (metricIds.length === 0) {
    reviewNotes.push('At least one approved metric is required before this recipe can become a dashboard dataset.')
  }

  return {
    recipe: input.recipe,
    name: input.recipe.title,
    fieldIds,
    metricIds,
    relationshipIds,
    reviewNotes,
    lineage: input.lineage,
  }
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
      chartType: 'kpi-card',
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

export function buildGuidedDashboardDraftPlan(input: {
  datasetName: string
  fields: Array<{ id: string; name: string; role?: string }>
  metrics: Array<{ id: string; name: string }>
  recommendations: GuidedChartRecommendation[]
  lineage?: GuidedDraftLineage
}): GuidedDashboardDraftPlan {
  const dateField = input.fields.find(field => field.role === 'date')
  const categoryField = input.fields.find(field => field.role === 'dimension' || field.role === 'attribute')
  const primaryMetric = input.metrics[0]
  const secondaryMetrics = input.metrics.slice(0, 4)
  const reviewNotes: string[] = []
  const charts: GuidedDashboardDraftPlan['charts'] = []

  if (dateField && primaryMetric) {
    charts.push({
      title: `${primaryMetric.name} trend`,
      templateId: secondaryMetrics.length > 1 ? 'trend-composed' : 'line',
      fieldIds: [dateField.id],
      metricIds: secondaryMetrics.length > 1 ? secondaryMetrics.map(metric => metric.id) : [primaryMetric.id],
      gridSpan: 3,
    })
  }

  if (categoryField && primaryMetric) {
    charts.push({
      title: `${primaryMetric.name} by ${categoryField.name}`,
      templateId: 'bar',
      fieldIds: [categoryField.id],
      metricIds: [primaryMetric.id],
      gridSpan: 2,
    })
  }

  for (const metric of input.metrics.slice(0, 3)) {
    charts.push({
      title: metric.name,
      templateId: 'kpi-card',
      fieldIds: [],
      metricIds: [metric.id],
      gridSpan: 1,
      reviewNote: 'KPI cards are draft recommendations and should be previewed before publishing.',
    })
  }

  if (charts.length === 0) {
    reviewNotes.push('No safe chart draft could be generated from the selected dataset shape.')
  }
  if (input.recommendations.length === 0) {
    reviewNotes.push('No recommendation metadata was available; fallback chart rules were used.')
  }

  return {
    title: `${input.datasetName} dashboard draft`,
    charts: charts.slice(0, 5),
    layout: {
      mode: 'responsive-grid',
      slotCount: Math.min(charts.length, 5),
    },
    reviewNotes,
    lineage: input.lineage,
  }
}

export function buildGuidedProgress(input: {
  hasDataSource: boolean
  hasProfile: boolean
  openReviewCount: number
  semanticDraftApproved: boolean
  hasDatasetDraft: boolean
  hasDashboardDraft: boolean
  hasPreview: boolean
  hasPublishedDashboard: boolean
  clientUrl?: string | null
  publishReadiness?: Pick<GuidedPublishReadinessResult, 'publishEligible' | 'status' | 'summary'> | null
}): GuidedProgressStep[] {
  const connectDone = input.hasDataSource
  const reviewDone = input.hasProfile && input.openReviewCount === 0
  const modelDone = input.semanticDraftApproved
  const dashboardDone = input.hasDashboardDraft
  const previewDone = input.hasPreview
  const publishDone = input.hasPublishedDashboard
  const publishEligible = input.publishReadiness ? input.publishReadiness.publishEligible : previewDone

  return [
    {
      id: 'connect_db',
      label: 'Connect DB',
      status: connectDone ? 'done' : 'ready',
      detail: connectDone ? 'Source connected and ready for profiling.' : 'Add a read-only source to start.',
    },
    {
      id: 'review_findings',
      label: 'Review findings',
      status: reviewDone ? 'done' : connectDone ? 'ready' : 'blocked',
      detail: reviewDone ? 'Exceptions reviewed.' : input.hasProfile ? `${input.openReviewCount} items need review.` : 'Run schema introspection first.',
    },
    {
      id: 'approve_model',
      label: 'Approve model',
      status: modelDone ? 'done' : reviewDone ? 'ready' : 'blocked',
      detail: modelDone ? 'Semantic draft approved.' : 'Review exceptions before approval.',
    },
    {
      id: 'generate_draft_dashboard',
      label: 'Compose dashboard release',
      status: dashboardDone
        ? 'done'
        : GUIDED_DASHBOARD_GENERATION_AVAILABLE && modelDone && input.hasDatasetDraft
          ? 'ready'
          : 'blocked',
      detail: dashboardDone
        ? 'A persisted dashboard draft exists.'
        : input.hasDatasetDraft
          ? 'Automatic dashboard composition is paused until draft staging is transaction-safe.'
          : 'Generate and publish a governed dataset before dashboard composition.',
    },
    {
      id: 'preview',
      label: 'Preview',
      status: previewDone ? 'done' : dashboardDone ? 'ready' : 'blocked',
      detail: previewDone ? 'Preview available.' : 'Generate a draft dashboard first.',
    },
    {
      id: 'publish',
      label: 'Publish',
      status: publishDone ? 'done' : previewDone && publishEligible ? 'ready' : 'blocked',
      detail: publishDone ? 'Published dashboard is live.' : previewDone && input.publishReadiness ? input.publishReadiness.summary : 'Preview before publishing.',
    },
    {
      id: 'view_client_dashboard',
      label: 'View client dashboard',
      status: input.clientUrl && publishDone ? 'ready' : 'blocked',
      detail: input.clientUrl && publishDone ? 'Open the client-facing dashboard.' : 'Publish a dashboard to unlock client view.',
    },
  ]
}

const DEFAULT_GUIDED_ACTIONS: Record<GuidedProgressStepId, GuidedContinueAction> = {
  connect_db: {
    stepId: 'connect_db',
    label: 'Connect database',
    href: '/admin/data-sources',
    detail: 'Add or scan a read-only Postgres source.',
  },
  review_findings: {
    stepId: 'review_findings',
    label: 'Review findings',
    href: '/admin/semantic-model',
    detail: 'Resolve schema findings and sensitive-field decisions.',
  },
  approve_model: {
    stepId: 'approve_model',
    label: 'Approve semantic model',
    href: '/admin/semantic-model',
    detail: 'Materialize the reviewed draft as an approved semantic model.',
  },
  generate_draft_dashboard: {
    stepId: 'generate_draft_dashboard',
    label: 'Review dataset release',
    href: '/admin/datasets',
    detail: 'Create and publish a governed dataset before dashboard composition.',
  },
  preview: {
    stepId: 'preview',
    label: 'Preview draft',
    href: '/admin/charts',
    detail: 'Inspect generated chart drafts before publishing.',
  },
  publish: {
    stepId: 'publish',
    label: 'Publish dashboard',
    href: '/admin/publishing',
    detail: 'Create and publish a versioned client dashboard.',
  },
  view_client_dashboard: {
    stepId: 'view_client_dashboard',
    label: 'View client dashboard',
    href: '/admin/publishing',
    detail: 'Open the client-facing dashboard runtime.',
  },
}

export function buildGuidedContinueState(
  steps: GuidedProgressStep[],
  actionOverrides: Partial<Record<GuidedProgressStepId, GuidedContinueAction>> = {},
): GuidedContinueState {
  const actionForStep = (step: GuidedProgressStep) => actionOverrides[step.id] ?? DEFAULT_GUIDED_ACTIONS[step.id]
  const readyStep = steps.find(step => step.status === 'ready')
  const firstBlockedStep = steps.find(step => step.status === 'blocked')
  const lastStep = steps[steps.length - 1]
  const currentStep = readyStep ?? firstBlockedStep ?? lastStep
  if (!currentStep) throw new Error('Guided progress requires at least one step')
  const completedSteps = steps.filter(step => step.status === 'done')
  const blockerSteps = steps.filter(step => step.status === 'blocked')
  const isComplete = steps.length > 0 && steps.every(step => step.status === 'done' || step.id === 'view_client_dashboard' && step.status === 'ready')

  return {
    currentStep,
    completedSteps,
    blockerSteps,
    nextAction: actionForStep(currentStep),
    isComplete,
  }
}
