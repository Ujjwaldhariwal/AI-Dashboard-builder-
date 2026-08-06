import type { ChartTemplateId } from '@/types/chart-template'
import type { DashboardBrief } from '@/types/dashboard-brief'

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

export type ProjectAutopilotPublicationPolicy =
  | 'review_required'
  | 'auto_publish_when_healthy'

export interface ProjectAutopilotBrief {
  objective: string
  audience: string | null
  chartCount: number
  chartTypes: ChartTemplateId[]
  requirementSpec?: DashboardBrief | null
  autoApply: boolean
  publicationPolicy: ProjectAutopilotPublicationPolicy
}

export type ProjectAutopilotRequirementStatus = 'ready' | 'needs_review' | 'blocked'

export interface ProjectAutopilotRequirementCoverageItem {
  requirementId: string
  title: string
  required: boolean
  status: ProjectAutopilotRequirementStatus
  metricId: string | null
  fieldIds: string[]
  templateId: ChartTemplateId
  confidence: number
  reason: string
}

export interface ProjectAutopilotRequirementCoverage {
  specId: string
  specVersion: number
  specHash: string
  total: number
  ready: number
  needsReview: number
  blocked: number
  evaluatedAt: string
  items: ProjectAutopilotRequirementCoverageItem[]
}

export interface ProjectAutopilotArtifacts {
  semanticModelId?: string
  datasetId?: string
  chartIds?: string[]
  requirementCoverage?: ProjectAutopilotRequirementCoverage
  dashboardId?: string
  dashboardVersionId?: string
  dashboardPageId?: string
  releaseVerification?: {
    activePointerVerified: boolean
    immutableSnapshotVerified: boolean
    clientLoadable: boolean
    pageCount: number
    slotCount: number
    chartSnapshotCount: number
    datasetSnapshotCount: number
    healthState: 'healthy' | 'stale' | 'blocked'
    verifiedAt: string
  }
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
