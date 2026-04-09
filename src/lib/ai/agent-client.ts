import { toast } from 'sonner'
import { z } from 'zod'
import type { TransformOp, WidgetStyle } from '@/types/widget'
import type { ReportInsight } from '@/lib/ai/agent-schemas'
import {
  ReportInsightSchema,
  TransformOpSchema,
  WidgetStyleSchema,
} from '@/lib/ai/agent-schemas'

const TransformAgentResponseSchema = z.object({
  operations: z.array(TransformOpSchema),
}).strict()

const UiAgentResponseSchema = z.object({
  style: WidgetStyleSchema,
}).strict()

const ReportAgentResponseSchema = z.object({
  report: ReportInsightSchema,
}).strict()

interface AskDataTransformerOptions {
  dashboardId?: string
  endpointId?: string
  endpointName?: string
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const maybeError = (payload as { error?: unknown }).error
    if (typeof maybeError === 'string' && maybeError.trim().length > 0) {
      return maybeError
    }
  }
  return fallback
}

async function readJsonSafe(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function askDataTransformer(
  prompt: string,
  sampleData: unknown[],
  options: AskDataTransformerOptions = {},
): Promise<TransformOp[]> {
  const response = await fetch('/api/agents/transform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      sampleData,
      dashboardId: options.dashboardId,
      endpointId: options.endpointId,
      endpointName: options.endpointName,
    }),
  })

  const payload = await readJsonSafe(response)
  if (!response.ok) {
    const message = getErrorMessage(payload, 'AI transform request failed')
    toast.error(message)
    throw new Error(message)
  }

  const parsed = TransformAgentResponseSchema.safeParse(payload)
  if (!parsed.success) {
    const message = 'Invalid AI transform response'
    toast.error(message)
    throw new Error(message)
  }

  return parsed.data.operations as TransformOp[]
}

export async function askUiDesigner(
  prompt: string,
  currentStyle: any,
): Promise<WidgetStyle> {
  const response = await fetch('/api/agents/ui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, currentStyle }),
  })

  const payload = await readJsonSafe(response)
  if (!response.ok) {
    const message = getErrorMessage(payload, 'AI style request failed')
    toast.error(message)
    throw new Error(message)
  }

  const parsed = UiAgentResponseSchema.safeParse(payload)
  if (!parsed.success) {
    const message = 'Invalid AI style response'
    toast.error(message)
    throw new Error(message)
  }

  return parsed.data.style as WidgetStyle
}

export async function askReportGenerator(
  dashboardTitle: string,
  widgetsData: any[],
): Promise<ReportInsight> {
  const response = await fetch('/api/agents/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dashboardTitle, widgetsData }),
  })

  const payload = await readJsonSafe(response)
  if (!response.ok) {
    const message = getErrorMessage(payload, 'AI report request failed')
    toast.error(message)
    throw new Error(message)
  }

  const parsed = ReportAgentResponseSchema.safeParse(payload)
  if (!parsed.success) {
    const message = 'Invalid AI report response'
    toast.error(message)
    throw new Error(message)
  }

  return parsed.data.report as ReportInsight
}
