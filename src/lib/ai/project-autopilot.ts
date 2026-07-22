import { z } from 'zod'

import type {
  ProjectAutopilotBrief,
  ProjectAutopilotPlan,
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
  autoApply: z.boolean().default(true),
}).strict()

export interface ProjectAutopilotSnapshot {
  selectedRelationCount: number
  selectedColumnCount: number
  semanticModel: {
    id: string
    status: BusinessModelStatus
    fieldCount: number
    metricCount: number
  } | null
  dataset: {
    id: string
    status: SemanticDatasetStatus
  } | null
  chartCount: number
}

const META: Record<ProjectAutopilotStepKey, Pick<ProjectAutopilotStepPlan, 'label' | 'href'>> = {
  schema_scope: { label: 'Schema scope', href: '/admin/data-sources' },
  semantic_model: { label: 'Semantic model', href: '/admin/semantic-model' },
  dataset: { label: 'Governed dataset', href: '/admin/datasets' },
  charts: { label: 'Editable charts', href: '/admin/charts' },
  publish_review: { label: 'Publish review', href: '/admin/publishing' },
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
    steps.push(step('semantic_model', 'awaiting_review', `Review ${model.fieldCount} fields and ${model.metricCount} metrics, then approve the model.`, false))
  } else {
    steps.push(step('semantic_model', 'succeeded', `${model.fieldCount} fields and ${model.metricCount} metrics are approved.`, false))
  }

  const semanticApproved = Boolean(model && model.status === 'approved' && model.fieldCount > 0 && model.metricCount > 0)
  const dataset = snapshot.dataset
  if (!semanticApproved) {
    steps.push(step('dataset', 'blocked', 'Waiting for semantic model approval.', true))
  } else if (!dataset || dataset.status !== 'published') {
    steps.push(step('dataset', 'ready', 'Autopilot can select governed fields and metrics and publish the internal dataset.', true))
  } else {
    steps.push(step('dataset', 'succeeded', 'A published governed dataset is ready.', true))
  }

  const datasetReady = Boolean(dataset?.status === 'published')
  if (!datasetReady) {
    steps.push(step('charts', 'blocked', 'Waiting for a published governed dataset.', true))
  } else if (snapshot.chartCount < brief.chartCount) {
    steps.push(step('charts', 'ready', `Autopilot can create ${brief.chartCount - snapshot.chartCount} more editable chart drafts.`, true))
  } else {
    steps.push(step('charts', 'succeeded', `${snapshot.chartCount} editable chart drafts are ready.`, true))
  }

  const chartsReady = snapshot.chartCount >= brief.chartCount
  steps.push(chartsReady
    ? step('publish_review', 'awaiting_review', 'Review layout and readiness before explicitly publishing an immutable release.', false)
    : step('publish_review', 'blocked', 'Waiting for the requested chart suite.', false))

  const firstIncomplete = steps.find(item => item.status !== 'succeeded') ?? steps[steps.length - 1]
  const completed = steps.filter(item => item.status === 'succeeded').length
  const status = firstIncomplete.key === 'publish_review' && firstIncomplete.status === 'awaiting_review'
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
  const requestedTypes = brief.chartTypes.length > 0
    ? ` Preferred chart types: ${brief.chartTypes.join(', ')}.`
    : ''
  const audience = brief.audience ? ` Audience: ${brief.audience}.` : ''
  return `${brief.objective.trim()} Create ${brief.chartCount} charts.${requestedTypes}${audience}`
}
