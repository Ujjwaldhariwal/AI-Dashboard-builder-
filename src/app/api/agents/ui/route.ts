import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { ENTERPRISE_COLORS } from '@/lib/echarts/theme'
import { WidgetStyleSchema } from '@/lib/ai/agent-schemas'
import { getAiWorkflowModel } from '@/lib/ai/workflow-provider'
import { guardAiRoute } from '@/lib/security/ai-route-guard'

const UiAgentRequestSchema = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(2_000),
  currentStyle: z.unknown(),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const auth = await guardAiRoute(req, 'ui')
    if (auth instanceof Response) return auth

    const body = await req.json().catch(() => null)
    if (body === null) {
      return NextResponse.json(
        { style: null, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }
    const parsed = UiAgentRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { style: null, error: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { prompt, currentStyle } = parsed.data
    const currentStylePreview = JSON.stringify(currentStyle ?? {}, null, 2).slice(0, 12_000)

    const model = getAiWorkflowModel({ workflowType: 'chart_refinement' })
    const result = await generateObject({
      model: model.model,
      schema: WidgetStyleSchema,
      system: `You are an expert enterprise chart UI designer.

Return only valid JSON matching the WidgetStyle schema.

Rules:
- Only output these keys:
  colors, tooltipBg, tooltipBorder, labelFormat, barRadius, showLegend, showGrid.
- "labelFormat" can only be "currency" or "percent" when present.
- Never output "customCSS" or any unknown key.
- Prefer enterprise-quality palettes based on or harmonized with:
  ${ENTERPRISE_COLORS.join(', ')}
- colors must be an array of beautiful, readable hex color strings.
- Keep contrast and readability strong for dashboards.
- Never return prose.`,
      prompt: `User style request:
${prompt}

Current style:
${currentStylePreview}

Return the full updated WidgetStyle object.`,
    })

    return NextResponse.json({ style: result.object })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UI agent failed'
    console.error('[Agents UI]', message)
    return NextResponse.json(
      { style: null, error: message },
      { status: 500 },
    )
  }
}
