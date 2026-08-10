import { NextResponse } from 'next/server'
import { z } from 'zod'

import type { ChartAiPatch } from '@/lib/ai/chart-ai-contract'
import type { DashboardChartConfig, DashboardChartValidationResult } from '@/types/dashboard-chart'

export const ChartRefineBodySchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  chartId: z.string().uuid(),
  instruction: z.string().min(3).max(1_200),
  includePreview: z.boolean().default(false),
  apply: z.boolean().default(false),
  patch: z.unknown().optional(),
  proposalId: z.string().uuid().optional(),
  mode: z.enum(['general', 'presentation_only']).default('general'),
  baseUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
  if (value.apply && !value.proposalId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proposalId'],
      message: 'Applying a refinement requires its durable proposal.',
    })
  }
  if (value.apply && !value.baseUpdatedAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseUpdatedAt'],
      message: 'Applying a refinement requires its source chart revision.',
    })
  }
})

export function staleChartRevisionResponse({
  patch,
  chart,
  validation,
}: {
  patch: ChartAiPatch
  chart: DashboardChartConfig
  validation: DashboardChartValidationResult
}) {
  return NextResponse.json({
    patch,
    chart,
    validation,
    proposalStatus: 'rejected',
    errorCode: 'stale_chart_revision',
    error: 'This chart changed after the proposal was generated. Review the latest chart and generate a new proposal.',
  }, { status: 409 })
}
