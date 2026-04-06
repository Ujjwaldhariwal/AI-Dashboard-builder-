import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { TransformOpSchema } from '@/lib/ai/agent-schemas'

const TransformAgentRequestSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  sampleData: z.array(z.unknown()),
}).strict()

const TransformAgentResponseSchema = z.object({
  operations: z.array(TransformOpSchema),
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
        { operations: [], error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await req.json().catch(() => null)
    if (body === null) {
      return NextResponse.json(
        { operations: [], error: 'Invalid JSON body' },
        { status: 400 },
      )
    }
    const parsed = TransformAgentRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { operations: [], error: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { prompt, sampleData } = parsed.data
    const samplePreview = JSON.stringify(sampleData.slice(0, 25), null, 2)

    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: TransformAgentResponseSchema,
      system: `You are a data transformation planner for dashboard charts.

Return only valid JSON matching the provided schema.

Rules:
- Output an ordered "operations" array of TransformOp objects.
- Use only these operation types:
  parse_number, concat, rename, math, percent_of_total, filter_rows, sort, limit.
- Use exact field names from sample data when possible.
- Keep operations minimal and deterministic.
- Never include extra keys outside the schema.
- Never return prose.`,
      prompt: `User goal:
${prompt}

Sample data rows:
${samplePreview}

Produce a TransformOp plan that transforms rows to satisfy the user goal.`,
    })

    return NextResponse.json({ operations: result.object.operations })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transform agent failed'
    console.error('[Agents Transform]', message)
    return NextResponse.json(
      { operations: [], error: message },
      { status: 500 },
    )
  }
}
