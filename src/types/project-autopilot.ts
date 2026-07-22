import type { ChartTemplateId } from '@/types/chart-template'

export type ProjectAutopilotRunStatus =
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type ProjectAutopilotStepKey =
  | 'schema_scope'
  | 'semantic_model'
  | 'dataset'
  | 'charts'
  | 'dashboard'
  | 'publish_review'

export type ProjectAutopilotStepStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'awaiting_review'
  | 'succeeded'
  | 'blocked'
  | 'failed'
  | 'skipped'

export interface ProjectAutopilotBrief {
  objective: string
  audience: string | null
  chartCount: number
  chartTypes: ChartTemplateId[]
  autoApply: boolean
}

export interface ProjectAutopilotArtifacts {
  semanticModelId?: string
  datasetId?: string
  chartIds?: string[]
  dashboardId?: string
  dashboardVersionId?: string
  dashboardPageId?: string
}

export interface ProjectAutopilotStepPlan {
  key: ProjectAutopilotStepKey
  label: string
  status: ProjectAutopilotStepStatus
  detail: string
  automatic: boolean
  href: string
}

export interface ProjectAutopilotPlan {
  status: ProjectAutopilotRunStatus
  currentStep: ProjectAutopilotStepKey
  progress: number
  steps: ProjectAutopilotStepPlan[]
}

export interface ProjectAutopilotRun {
  id: string
  tenantId: string
  projectId: string
  actorUserId: string | null
  status: ProjectAutopilotRunStatus
  currentStep: ProjectAutopilotStepKey
  brief: ProjectAutopilotBrief
  plan: ProjectAutopilotPlan
  artifacts: ProjectAutopilotArtifacts
  errorCode: string | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}
