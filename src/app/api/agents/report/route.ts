import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { ReportInsightSchema } from '@/lib/ai/agent-schemas'

const ReportAgentRequestSchema = z.object({
  dashboardTitle: z.string().min(1, 'dashboardTitle is required'),
  widgetsData: z.array(z.unknown()),
}).strict()

async function hasValidSession() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
        { report: null, error: 'Unauthorized' },
        { status: 401 },
      )
    }

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
    const widgetsPreview = JSON.stringify(widgetsData.slice(0, 40), null, 2)

    const result = await generateObject({
      model: google('gemini-2.5-flash'),
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

