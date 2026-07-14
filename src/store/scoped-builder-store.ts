import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  createScopedBuilderState,
  EMPTY_SCOPED_BUILDER_STATE,
  nextBuilderStage,
  type BuilderFlowStage,
  type BuilderScope,
  type ScopedBuilderState,
} from '@/lib/dashboardos/scoped-builder-state'

interface ScopedBuilderStore extends ScopedBuilderState {
  setScope: (scope: BuilderScope, stage?: BuilderFlowStage) => void
  setStage: (stage: BuilderFlowStage) => void
  addDataSourceId: (dataSourceId: string) => void
  removeDataSourceId: (dataSourceId: string) => void
  setSemanticModelId: (semanticModelId: string | null) => void
  addChartId: (chartId: string) => void
  setDashboardId: (dashboardId: string | null) => void
  setPublishedVersionId: (publishedVersionId: string | null) => void
  resetScope: () => void
}

function sameScope(left: BuilderScope | null, right: BuilderScope) {
  return left?.tenantId === right.tenantId && left.projectId === right.projectId
}

export const useScopedBuilderStore = create<ScopedBuilderStore>()(
  persist(
    (set) => ({
      ...EMPTY_SCOPED_BUILDER_STATE,

      setScope: (scope, stage) => set((state) => {
        if (sameScope(state.scope, scope)) {
          return { scope, stage: stage ?? state.stage }
        }
        return {
          ...createScopedBuilderState(scope),
          stage: stage ?? 'data_source',
        }
      }),

      setStage: (stage) => set({ stage }),

      addDataSourceId: (dataSourceId) => set((state) => ({
        dataSourceIds: state.dataSourceIds.includes(dataSourceId)
          ? state.dataSourceIds
          : [dataSourceId, ...state.dataSourceIds],
        stage: nextBuilderStage({
          ...state,
          dataSourceIds: state.dataSourceIds.includes(dataSourceId)
            ? state.dataSourceIds
            : [dataSourceId, ...state.dataSourceIds],
        }),
      })),

      removeDataSourceId: (dataSourceId) => set((state) => {
        const dataSourceIds = state.dataSourceIds.filter(id => id !== dataSourceId)
        return {
          dataSourceIds,
          stage: nextBuilderStage({ ...state, dataSourceIds }),
        }
      }),

      setSemanticModelId: (semanticModelId) => set((state) => ({
        semanticModelId,
        stage: nextBuilderStage({ ...state, semanticModelId }),
      })),

      addChartId: (chartId) => set((state) => {
        const chartIds = state.chartIds.includes(chartId) ? state.chartIds : [chartId, ...state.chartIds]
        return {
          chartIds,
          stage: nextBuilderStage({ ...state, chartIds }),
        }
      }),

      setDashboardId: (dashboardId) => set((state) => ({
        dashboardId,
        stage: nextBuilderStage({ ...state, dashboardId }),
      })),

      setPublishedVersionId: (publishedVersionId) => set((state) => ({
        publishedVersionId,
        stage: nextBuilderStage({ ...state, publishedVersionId }),
      })),

      resetScope: () => set(EMPTY_SCOPED_BUILDER_STATE),
    }),
    {
      name: 'dashboardos-scoped-builder-state',
      version: 1,
      partialize: (state) => ({
        scope: state.scope,
        stage: state.stage,
        dataSourceIds: state.dataSourceIds,
        semanticModelId: state.semanticModelId,
        chartIds: state.chartIds,
        dashboardId: state.dashboardId,
        publishedVersionId: state.publishedVersionId,
        aiAllowed: state.aiAllowed,
      }),
    },
  ),
)
