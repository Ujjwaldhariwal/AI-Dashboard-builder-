import { z } from 'zod'

import type { ChartType, Widget, WidgetStyle } from '@/types/widget'

const CHART_TYPES = [
  'bar',
  'line',
  'area',
  'pie',
  'donut',
  'horizontal-bar',
  'horizontal-stacked-bar',
  'grouped-bar',
  'drilldown-bar',
  'gauge',
  'ring-gauge',
  'status-card',
  'table',
] as const satisfies readonly ChartType[]

export const BuilderWidgetPatchSchema = z.object({
  action: z.literal('update_widget'),
  changes: z.object({
    title: z.string().trim().min(1).max(120).optional(),
    type: z.enum(CHART_TYPES).optional(),
    xAxis: z.string().trim().min(1).max(120).optional(),
    yAxis: z.string().trim().min(1).max(120).nullable().optional(),
    style: z.object({
      colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(12).optional(),
      tooltipBg: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      tooltipBorder: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      barRadius: z.number().int().min(0).max(48).optional(),
      showLegend: z.boolean().optional(),
      showGrid: z.boolean().optional(),
      labelFormat: z.enum(['currency', 'percent']).nullable().optional(),
    }).strict().optional(),
  }).strict().refine(changes => Object.keys(changes).length > 0, 'At least one widget change is required'),
  description: z.string().trim().min(1).max(300),
}).strict()

export type BuilderWidgetPatch = z.infer<typeof BuilderWidgetPatchSchema>

export interface BuilderWidgetPatchResult {
  ok: boolean
  issues: string[]
  updates: Partial<Widget> | null
}

export function validateBuilderWidgetPatch(input: {
  widget: Widget
  patch: BuilderWidgetPatch
  allowedFields: string[]
}): BuilderWidgetPatchResult {
  const parsed = BuilderWidgetPatchSchema.safeParse(input.patch)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map(issue => issue.message), updates: null }
  }

  const allowed = new Set(input.allowedFields)
  const changes = parsed.data.changes
  const nextType = changes.type ?? input.widget.type
  const nextXAxis = changes.xAxis ?? input.widget.dataMapping.xAxis
  const nextYAxis = changes.yAxis === undefined ? input.widget.dataMapping.yAxis : changes.yAxis ?? undefined
  const issues: string[] = []
  const needsXAxis = !['gauge', 'ring-gauge', 'status-card'].includes(nextType)

  if (changes.xAxis && !allowed.has(changes.xAxis)) issues.push(`Field "${changes.xAxis}" is not available on this chart's endpoint.`)
  if (changes.yAxis && !allowed.has(changes.yAxis)) issues.push(`Field "${changes.yAxis}" is not available on this chart's endpoint.`)
  if (needsXAxis && !nextXAxis) issues.push(`${nextType} requires an x-axis field.`)
  if (nextType !== 'table' && !nextYAxis) issues.push(`${nextType} requires a value field.`)
  if (issues.length > 0) return { ok: false, issues, updates: null }

  const { labelFormat, ...styleChanges } = changes.style ?? {}
  const nextStyle: WidgetStyle = {
    ...input.widget.style,
    ...styleChanges,
    ...(labelFormat === null
      ? { labelFormat: undefined }
      : labelFormat
        ? { labelFormat }
        : {}),
  }

  return {
    ok: true,
    issues: [],
    updates: {
      ...(changes.title ? { title: changes.title } : {}),
      ...(changes.type ? { type: changes.type } : {}),
      dataMapping: {
        ...input.widget.dataMapping,
        xAxis: nextXAxis,
        yAxis: nextYAxis,
      },
      ...(changes.style ? { style: nextStyle } : {}),
    },
  }
}

export function describeBuilderWidgetPatch(widget: Widget, patch: BuilderWidgetPatch) {
  const changes: string[] = []
  if (patch.changes.title && patch.changes.title !== widget.title) changes.push(`Title: ${widget.title} → ${patch.changes.title}`)
  if (patch.changes.type && patch.changes.type !== widget.type) changes.push(`Chart: ${widget.type} → ${patch.changes.type}`)
  if (patch.changes.xAxis && patch.changes.xAxis !== widget.dataMapping.xAxis) changes.push(`X-axis: ${widget.dataMapping.xAxis || 'none'} → ${patch.changes.xAxis}`)
  if (patch.changes.yAxis !== undefined && patch.changes.yAxis !== widget.dataMapping.yAxis) changes.push(`Value: ${widget.dataMapping.yAxis || 'none'} → ${patch.changes.yAxis || 'none'}`)
  if (patch.changes.style) changes.push('Visual style updated')
  return changes
}
