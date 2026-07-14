export type BuilderFlowStage =
  | 'user'
  | 'tenant'
  | 'data_source'
  | 'semantic_model'
  | 'charts'
  | 'dashboard'
  | 'published'

export interface BuilderScope {
  tenantId: string
  projectId: string
}

export interface ScopedBuilderState {
  scope: BuilderScope | null
  stage: BuilderFlowStage
  dataSourceIds: string[]
  semanticModelId: string | null
  chartIds: string[]
  dashboardId: string | null
  publishedVersionId: string | null
  aiAllowed: boolean
}

export const EMPTY_SCOPED_BUILDER_STATE: ScopedBuilderState = {
  scope: null,
  stage: 'user',
  dataSourceIds: [],
  semanticModelId: null,
  chartIds: [],
  dashboardId: null,
  publishedVersionId: null,
  aiAllowed: false,
}

export function createScopedBuilderState(scope: BuilderScope): ScopedBuilderState {
  return {
    ...EMPTY_SCOPED_BUILDER_STATE,
    scope,
    stage: 'data_source',
  }
}

export function hasExplicitBuilderScope(state: ScopedBuilderState): state is ScopedBuilderState & { scope: BuilderScope } {
  return Boolean(state.scope?.tenantId && state.scope.projectId)
}

export function assertExplicitBuilderScope(state: ScopedBuilderState): BuilderScope {
  if (!hasExplicitBuilderScope(state)) {
    throw new Error('Builder scope requires explicit tenantId and projectId')
  }
  return state.scope
}

export function nextBuilderStage(state: ScopedBuilderState): BuilderFlowStage {
  if (!state.scope) return 'tenant'
  if (state.dataSourceIds.length === 0) return 'data_source'
  if (!state.semanticModelId) return 'semantic_model'
  if (state.chartIds.length === 0) return 'charts'
  if (!state.dashboardId) return 'dashboard'
  if (!state.publishedVersionId) return 'published'
  return 'published'
}
