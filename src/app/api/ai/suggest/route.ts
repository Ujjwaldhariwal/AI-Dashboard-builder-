import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'

import { requireAiProjectAccess } from '@/lib/security/ai-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { getAuthedSupabase } from '@/lib/supabase/server'

const SuggestBodySchema = z.object({
  tenantId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  dashboardId: z.string().uuid().optional(),
  fields: z.array(z.object({
    name: z.string().min(1).max(120),
    type: z.string().min(1).max(40),
  }).passthrough()).min(1).max(80),
  sampleData: z.array(z.unknown()).max(20).optional().default([]),
  endpointName: z.string().min(1).max(120).default('Endpoint'),
}).strict()

const SuggestionSchema = z.object({
  title: z.string().min(1).max(120),
  type: z.enum(['bar', 'line', 'area', 'pie', 'donut', 'horizontal-bar', 'horizontal-stacked-bar', 'grouped-bar', 'drilldown-bar', 'gauge', 'ring-gauge', 'status-card', 'table']),
  xAxis: z.string().min(1).max(120),
  yAxis: z.string().min(1).max(120),
  reason: z.string().max(300).default('AI chart suggestion'),
}).strict()

const SuggestResponseSchema = z.object({
  suggestions: z.array(SuggestionSchema).max(5),
}).passthrough()

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
      return NextResponse.json({ suggestions: [], error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const parsed = SuggestBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ suggestions: [], error: parsed.error.flatten() }, { status: 400 })
    }

    const access = await requireAiProjectAccess({ auth, scope: parsed.data })
    if (!access.ok) {
      return NextResponse.json({ suggestions: [], error: access.error }, { status: access.status })
    }

    const rateLimit = await checkRuntimeRateLimit({
      key: `ai-suggest:${access.tenantId}:${access.projectId}:${auth.userId}`,
      maxRequests: 30,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { suggestions: [], error: 'Too many AI suggestion requests. Please retry shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const prompt = `You are a data visualization expert. Given this API data schema, suggest the best charts.

Endpoint: ${parsed.data.endpointName}
Fields detected: ${JSON.stringify(parsed.data.fields.slice(0, 40), null, 2)}
Preview data: raw sample rows are not provided to AI. Use field names, data types, and visualization grammar only.

Respond with ONLY a valid JSON object in this exact shape, no prose:
{
  "suggestions": [
    {
      "title": "Human readable chart title",
      "type": "bar|line|area|pie|donut|horizontal-bar|horizontal-stacked-bar|grouped-bar|drilldown-bar|gauge|ring-gauge|status-card|table",
      "xAxis": "field_name",
      "yAxis": "field_name",
      "reason": "One sentence why this chart fits this data"
    }
  ]
}

Rules:
- Max 5 suggestions
- Use ACTUAL field names from the schema above
- Prefer bar for categories, line/area for time series, pie for distributions
- Always include a table as the last suggestion`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const response = SuggestResponseSchema.safeParse(JSON.parse(raw))
    if (!response.success) {
      return NextResponse.json({ suggestions: [], error: 'AI suggestion response failed validation' }, { status: 502 })
    }

    await auth.supabase.from('audit_logs').insert({
      tenant_id: access.tenantId,
      project_id: access.projectId,
      actor_user_id: auth.userId,
      action: 'ai.suggest.completed',
      target_type: 'project',
      target_id: access.projectId,
      metadata: {
        endpointName: parsed.data.endpointName,
        fieldCount: parsed.data.fields.length,
        sampleRowsIgnored: parsed.data.sampleData.length,
        suggestionCount: response.data.suggestions.length,
      },
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ suggestions: response.data.suggestions })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI suggestion failed'
    console.error('[AI Suggest]', message)
    return NextResponse.json({ suggestions: [], error: message }, { status: 500 })
  }
}
