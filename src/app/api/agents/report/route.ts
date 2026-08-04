import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { ReportInsightSchema } from '@/lib/ai/agent-schemas'
import { getAiWorkflowModel } from '@/lib/ai/workflow-provider'
import { guardAiRoute } from '@/lib/security/ai-route-guard'

const ReportAgentRequestSchema = z.object({
  dashboardTitle: z.string().trim().min(1, 'dashboardTitle is required').max(160),
  widgetsData: z.array(z.unknown()).max(40),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const auth = await guardAiRoute(req, 'report')
    if (auth instanceof Response) return auth

    const body = await req.json().catch(() => null)
    if (body === null) {
      return NextResponse.json(
        { report: null, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parsed = ReportAgentRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { report: null, error: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { dashboardTitle, widgetsData } = parsed.data
    const widgetsPreview = JSON.stringify(widgetsData, null, 2).slice(0, 32_000)

    const model = getAiWorkflowModel({ workflowType: 'report_generation' })
    const result = await generateObject({
      model: model.model,
      schema: ReportInsightSchema,
      system: `You are a Senior Data Analyst preparing a professional dashboard report.

Return only valid JSON matching the schema exactly.

Guidelines:
- executiveSummary: concise and executive-friendly (3-5 sentences).
- anomalies: actionable bullets about spikes, drops, outliers, volatility, or concerning shifts.
- widgetInsights: include a specific insight for each widget id present in the input data.
- Be factual from provided data and avoid unsupported claims.
- Keep tone professional and concise.
- Never output markdown or prose outside JSON.`,
      prompt: `Dashboard title:
${dashboardTitle}

Widgets data summary:
${widgetsPreview}

Analyze this dashboard and produce executive summary, anomalies, and per-widget insights.`,
    })

    return NextResponse.json({ report: result.object })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report agent failed'
    console.error('[Agents Report]', message)
    return NextResponse.json(
      { report: null, error: message },
      { status: 500 },
    )
  }
}
