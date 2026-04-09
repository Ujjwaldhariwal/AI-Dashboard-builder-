import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { ENTERPRISE_COLORS } from '@/lib/echarts/theme'
import { WidgetStyleSchema } from '@/lib/ai/agent-schemas'
import { getSupabaseAnonKey, SUPABASE_URL } from '@/lib/supabase/config'

const UiAgentRequestSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  currentStyle: z.unknown(),
}).strict()

async function hasValidSession() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    SUPABASE_URL,
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }))
        },
        setAll() {
          // Read-only auth check in route handler; no cookie writes needed.
        },
      },
    },
  )

  const { data: { session } } = await supabase.auth.getSession()
  return Boolean(session)
}

export async function POST(req: NextRequest) {
  try {
    const authenticated = await hasValidSession()
    if (!authenticated) {
      return NextResponse.json(
        { style: null, error: 'Unauthorized' },
        { status: 401 },
      )
    }

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
    const currentStylePreview = JSON.stringify(currentStyle ?? {}, null, 2)

    const result = await generateObject({
      model: google('gemini-2.5-flash'),
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
