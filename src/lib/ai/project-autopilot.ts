import { z } from 'zod'

import { dashboardRequirementInstruction } from '@/lib/ai/dashboard-requirement-resolver'
import type { ChartTemplateId } from '@/types/chart-template'
import { DashboardBriefSchema } from '@/types/dashboard-brief'
import type {
  ProjectAutopilotBrief,
  ProjectAutopilotPlan,
  ProjectAutopilotRequirementCoverage,
  ProjectAutopilotStepKey,
  ProjectAutopilotStepPlan,
} from '@/types/project-autopilot'
import type { BusinessModelStatus } from '@/types/semantic-model'
import type { SemanticDatasetStatus } from '@/types/semantic-dataset'

export const PROJECT_AUTOPILOT_VERSION = 'dashboardos.project-autopilot.v1' as const

const ChartTypeSchema = z.enum([
  'bar', 'horizontal-bar', 'grouped-bar', 'horizontal-stacked-bar', 'line', 'trend-composed',
  'pie', 'gauge', 'ring-gauge', 'kpi-card', 'kpi-grid', 'drilldown-bar', 'table-grid',
])

export const ProjectAutopilotBriefSchema = z.object({
  objective: z.string().trim().min(10).max(4_000),
  audience: z.string().trim().min(2).max(200).nullable().default(null),
  chartCount: z.number().int().min(1).max(12).default(6),
  chartTypes: z.array(ChartTypeSchema).max(12).default([]),
  requirementSpec: DashboardBriefSchema.refine(spec => spec.requirements.length <= 12, {
    message: 'Project Autopilot supports at most 12 chart requirements.',
  }).nullable().default(null),
  autoApply: z.boolean().default(true),
  publicationPolicy: z.enum([
    'review_required',
    'auto_publish_when_healthy',
  ]).default('auto_publish_when_healthy'),
}).strict().superRefine((brief, context) => {
  if (brief.requirementSpec && brief.chartCount !== brief.requirementSpec.requirements.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chartCount'],
      message: 'chartCount must match the versioned requirement count.',
    })
  }
})

export interface ProjectAutopilotSnapshot {
  selectedRelationCount: number
  selectedColumnCount: number
  semanticModel: {
    id: string
    name?: string
    status: BusinessModelStatus
    fieldCount: number
    metricCount: number
  } | null
  dataset: {
    id: string
    status: SemanticDatasetStatus
  } | null
  chartCount: number
  requirementCoverage?: ProjectAutopilotRequirementCoverage | null
  dashboard?: {
    id: string
    versionId: string
    slotCount: number
    status: 'draft' | 'published'
  } | null
}

export interface ProjectAutopilotDashboardChart {
  id: string
  name: string
  templateId: ChartTemplateId
  presentation?: { size?: 'compact' | 'standard' | 'wide' | 'full' } | null
  layout?: { order?: number; gridSpan?: number; requirementId?: string } | null
}

export interface ProjectAutopilotDashboardSlot {
  chartConfigId: string
  title: string
  slotKey: string
  rowIndex: number
  columnIndex: number
  width: number
  height: number
  settings: Record<string, unknown>
}

const META: Record<ProjectAutopilotStepKey, Pick<ProjectAutopilotStepPlan, 'label' | 'href'>> = {
  schema_scope: { label: 'Schema scope', href: '/admin/data-sources' },
  semantic_model: { label: 'Semantic model', href: '/admin/semantic-model' },
  dataset: { label: 'Governed dataset', href: '/admin/datasets' },
  charts: { label: 'Chart configs', href: '/admin/charts' },
  dashboard: { label: 'Dashboard layout', href: '/admin/publishing' },
  publish_review: { label: 'Release finalization', href: '/admin/publishing' },
}

function slotKey(value: string, index: number) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return `${normalized || 'chart'}-${index + 1}`
}

function chartSlotSize(chart: ProjectAutopilotDashboardChart) {
  if (chart.presentation?.size === 'full' || chart.templateId === 'table-grid' || chart.templateId === 'kpi-grid') {
    return { width: 12, height: chart.templateId === 'table-grid' ? 6 : 4 }
  }
  if (chart.presentation?.size === 'wide' || chart.templateId === 'line' || chart.templateId === 'trend-composed') {
    return { width: 12, height: 5 }
  }
  if (chart.presentation?.size === 'compact' || ['kpi-card', 'gauge', 'ring-gauge'].includes(chart.templateId)) {
    return { width: 4, height: 3 }
  }
  return { width: 6, height: 4 }
}

export function buildProjectAutopilotDashboardSlots(inputCharts: ProjectAutopilotDashboardChart[]) {
  const charts = inputCharts
    .map((chart, index) => ({ chart, index }))
    .sort((left, right) => (left.chart.layout?.order ?? left.index) - (right.chart.layout?.order ?? right.index))
  let rowIndex = 0
  let columnIndex = 0
  return charts.map(({ chart }, index): ProjectAutopilotDashboardSlot => {
    const size = chartSlotSize(chart)
    if (columnIndex > 0 && columnIndex + size.width > 12) {
      rowIndex += 1
      columnIndex = 0
    }
    const slot = {
      chartConfigId: chart.id,
      title: chart.name,
      slotKey: slotKey(chart.name, index),
      rowIndex,
      columnIndex,
      width: size.width,
      height: size.height,
      settings: {
        generatedBy: PROJECT_AUTOPILOT_VERSION,
        editable: true,
        ...(chart.layout?.requirementId ? { requirementId: chart.layout.requirementId } : {}),
      },
    }
    columnIndex += size.width
    if (columnIndex >= 12) {
      rowIndex += 1
      columnIndex = 0
    }
    return slot
  })
}

export function projectAutopilotDashboardName(brief: ProjectAutopilotBrief) {
  const audience = brief.audience?.trim()
  return `${audience || 'Autopilot'} Dashboard`.slice(0, 120)
}

function step(
  key: ProjectAutopilotStepKey,
  status: ProjectAutopilotStepPlan['status'],
  detail: string,
  automatic: boolean,
): ProjectAutopilotStepPlan {
  return { key, ...META[key], status, detail, automatic }
}

export function buildProjectAutopilotPlan(
  snapshot: ProjectAutopilotSnapshot,
  inputBrief: ProjectAutopilotBrief,
): ProjectAutopilotPlan {
  const brief = ProjectAutopilotBriefSchema.parse(inputBrief)
  const steps: ProjectAutopilotStepPlan[] = []

  const schemaReady = snapshot.selectedRelationCount > 0 && snapshot.selectedColumnCount > 0
  steps.push(schemaReady
    ? step('schema_scope', 'succeeded', `${snapshot.selectedRelationCount} selected tables and ${snapshot.selectedColumnCount} columns are available.`, false)
    : step('schema_scope', 'blocked', 'Select at least one detected table before Autopilot can use database fields.', false))

  const model = snapshot.semanticModel
  if (!schemaReady) {
    steps.push(step('semantic_model', 'blocked', 'Waiting for a confirmed schema scope.', true))
  } else if (!model || model.fieldCount === 0 || model.metricCount === 0) {
    steps.push(step('semantic_model', 'ready', 'Autopilot can create and populate a draft semantic model.', true))
  } else if (model.status !== 'approved') {
    steps.push(step('semantic_model', 'ready', `Autopilot will validate ${model.fieldCount} fields and ${model.metricCount} metrics, then approve safe mappings automatically.`, true))
  } else {
    steps.push(step('semantic_model', 'succeeded', `${model.fieldCount} fields and ${model.metricCount} metrics are approved.`, false))
  }

  const semanticApproved = Boolean(model && model.status === 'approved' && model.fieldCount > 0 && model.metricCount > 0)
  const dataset = snapshot.dataset
  const coverage = snapshot.requirementCoverage
  const coverageMatches = Boolean(brief.requirementSpec && coverage?.specId === brief.requirementSpec.id)
  const requiredCoverageIssues = coverage?.items.filter(item => item.required && item.status !== 'ready') ?? []
  if (!semanticApproved) {
    steps.push(step('dataset', 'blocked', 'Waiting for semantic model approval.', true))
  } else if (brief.requirementSpec && !coverageMatches) {
    steps.push(step('dataset', 'ready', `Autopilot can resolve ${brief.requirementSpec.requirements.length} KPI requirements against approved semantic IDs.`, true))
  } else if (coverageMatches && coverage?.ready === 0) {
    steps.push(step('dataset', 'awaiting_review', 'No KPI requirement resolves safely enough to publish a dataset.', false))
  } else if (requiredCoverageIssues.length > 0) {
    const blocked = requiredCoverageIssues.filter(item => item.status === 'blocked').length
    const review = requiredCoverageIssues.length - blocked
    steps.push(step(
      'dataset',
      'awaiting_review',
      `${blocked} required KPI${blocked === 1 ? '' : 's'} blocked and ${review} need semantic review before dataset publication.`,
      false,
    ))
  } else if (!dataset || dataset.status !== 'published') {
    steps.push(step('dataset', 'ready', brief.requirementSpec
      ? 'All required KPIs resolve to governed semantic IDs; Autopilot can publish their dataset.'
      : 'Autopilot can select governed fields and metrics and publish the internal dataset.', true))
  } else {
    steps.push(step('dataset', 'succeeded', 'A published governed dataset is ready.', true))
  }

  const datasetReady = Boolean(dataset?.status === 'published')
  const targetChartCount = brief.requirementSpec && coverageMatches ? coverage?.ready ?? 0 : brief.chartCount
  if (!datasetReady) {
    steps.push(step('charts', 'blocked', 'Waiting for a published governed dataset.', true))
  } else if (snapshot.chartCount < targetChartCount) {
    steps.push(step('charts', 'ready', `Autopilot can create ${targetChartCount - snapshot.chartCount} more validated chart configs.`, true))
  } else {
    steps.push(step('charts', 'succeeded', `${snapshot.chartCount} validated chart configs are ready.`, true))
  }

  const chartsReady = targetChartCount > 0 && snapshot.chartCount >= targetChartCount
  const dashboard = snapshot.dashboard
  if (!chartsReady) {
    steps.push(step('dashboard', 'blocked', 'Waiting for the requested editable chart suite.', true))
  } else if (!dashboard || dashboard.slotCount < targetChartCount) {
    steps.push(step('dashboard', 'ready', 'Autopilot can arrange validated charts into a responsive dashboard draft.', true))
  } else {
    steps.push(step('dashboard', 'succeeded', `${dashboard.slotCount} charts are arranged in an editable dashboard draft.`, true))
  }

  const dashboardReady = Boolean(dashboard && dashboard.slotCount >= targetChartCount)
  const dashboardPublished = dashboardReady && dashboard?.status === 'published'
  const automaticPublication = brief.publicationPolicy === 'auto_publish_when_healthy'
  steps.push(dashboardPublished
    ? step(
      'publish_review',
      'succeeded',
      'The immutable dashboard release is published and ready for client verification.',
      automaticPublication,
    )
    : dashboardReady
      ? automaticPublication
        ? step(
          'publish_review',
          'ready',
          'Autopilot can run release readiness, publish the immutable version, and verify the client runtime.',
          true,
        )
        : step(
          'publish_review',
          'awaiting_review',
          'Review layout and readiness before explicitly publishing an immutable release.',
          false,
        )
      : step('publish_review', 'blocked', 'Waiting for the composed dashboard draft.', false))

  const firstIncomplete = steps.find(item => item.status !== 'succeeded') ?? steps[steps.length - 1]
  const completed = steps.filter(item => item.status === 'succeeded').length
  const status = completed === steps.length
    ? 'succeeded' as const
    : firstIncomplete.key === 'publish_review' && firstIncomplete.status === 'awaiting_review'
      ? 'awaiting_review' as const
      : firstIncomplete.status === 'awaiting_review' || firstIncomplete.status === 'blocked'
        ? 'awaiting_review' as const
        : 'queued' as const

  return {
    status,
    currentStep: firstIncomplete.key,
    progress: Math.round((completed / steps.length) * 100),
    steps,
  }
}

export function projectAutopilotInstruction(brief: ProjectAutopilotBrief) {
  if (brief.requirementSpec) return dashboardRequirementInstruction(brief.requirementSpec)
  const requestedTypes = brief.chartTypes.length > 0
    ? ` Preferred chart types: ${brief.chartTypes.join(', ')}.`
    : ''
  const audience = brief.audience ? ` Audience: ${brief.audience}.` : ''
  return `${brief.objective.trim()} Create ${brief.chartCount} charts.${requestedTypes}${audience}`
}
