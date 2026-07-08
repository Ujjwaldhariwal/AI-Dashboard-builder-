import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import https from 'https'
import { z } from 'zod'

import { requireAiProjectAccess } from '@/lib/security/ai-access'
import { checkRuntimeRateLimit } from '@/lib/security/runtime-rate-limit'
import { getAuthedSupabase } from '@/lib/supabase/server'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4_000),
}).strict()

const ChatContextSchema = z.object({
  tenantId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  dashboardId: z.string().optional().nullable(),
  styleOnlyMode: z.boolean().optional(),
  fields: z.array(z.unknown()).max(50).optional(),
  sampleRows: z.array(z.unknown()).max(3).optional(),
  selectedWidget: z.record(z.string(), z.unknown()).optional().nullable(),
  existingWidgetCount: z.number().int().min(0).max(500).optional(),
  activeEndpointName: z.string().max(120).optional(),
  totalRows: z.number().int().min(0).max(1_000_000).optional(),
}).passthrough()

const ChatBodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
  context: ChatContextSchema,
}).strict()

const WidgetActionSchema = z.object({
  action: z.literal('create_widget'),
  title: z.string().min(1).max(120),
  type: z.enum([
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
  ]),
  xAxis: z.string().min(1).max(120),
  yAxis: z.string().min(1).max(120),
  description: z.string().max(300).optional().default(''),
}).strict()

const StyleActionSchema = z.object({
  action: z.literal('update_style').optional(),
  style: z.object({
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(12).optional(),
    tooltipBg: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    tooltipBorder: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    barRadius: z.number().int().min(0).max(48).optional(),
    showLegend: z.boolean().optional(),
    showGrid: z.boolean().optional(),
    labelFormat: z.enum(['currency', 'percent', 'number']).optional(),
  }).strict(),
  description: z.string().max(300).optional().default(''),
}).strict()

type ChatContext = z.infer<typeof ChatContextSchema>
type ChatMessage = z.infer<typeof MessageSchema>

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = ChatBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { messages, context } = parsed.data
    const access = await requireAiProjectAccess({ auth, scope: context })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const rateLimit = await checkRuntimeRateLimit({
      key: `ai-chat:${access.tenantId}:${access.projectId}:${auth.userId}`,
      maxRequests: 20,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: 'Too many AI chat requests. Please retry shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    const isStyleMode = Boolean(context.styleOnlyMode && context.selectedWidget)
    const systemPrompt = isStyleMode ? buildStylePrompt(context) : buildCreatePrompt(context)
    const history = buildGeminiHistory(messages)
    const lastMessage = messages[messages.length - 1]
    history.push({ role: 'user', parts: [{ text: lastMessage.content }] })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 503 })

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    const httpsAgent = new https.Agent({
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    })

    const response = await axios.post(
      url,
      {
        system_instruction: { parts: { text: systemPrompt } },
        contents: history,
        generationConfig: { temperature: 0.3 },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
        httpsAgent,
      },
    )

    const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    let widgetAction: z.infer<typeof WidgetActionSchema> | null = null
    const widgetMatch = content.match(/```widget\n([\s\S]*?)\n```/)
    if (widgetMatch) {
      try {
        const action = WidgetActionSchema.safeParse(JSON.parse(widgetMatch[1]))
        if (action.success) widgetAction = action.data
      } catch {}
    }

    let styleAction: (z.infer<typeof StyleActionSchema> & { action: 'update_style'; widgetId: string }) | null = null
    const styleMatch = content.match(/```style\n([\s\S]*?)\n```/)
    if (styleMatch) {
      try {
        const action = StyleActionSchema.safeParse(JSON.parse(styleMatch[1]))
        const widgetId = typeof context.selectedWidget?.id === 'string' ? context.selectedWidget.id : null
        if (action.success && widgetId) {
          styleAction = { ...action.data, action: 'update_style', widgetId }
        }
      } catch {}
    }

    await auth.supabase.from('audit_logs').insert({
      tenant_id: access.tenantId,
      project_id: access.projectId,
      actor_user_id: auth.userId,
      action: 'ai.chat.completed',
      target_type: 'project',
      target_id: access.projectId,
      metadata: {
        styleOnlyMode: isStyleMode,
        messageCount: messages.length,
        widgetAction: Boolean(widgetAction),
        styleAction: Boolean(styleAction),
      },
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ message: content, widgetAction, styleAction })
  } catch (err: unknown) {
    const errorMsg = axios.isAxiosError(err)
      ? err.response?.data?.error?.message ?? err.message
      : err instanceof Error ? err.message : 'AI request failed'
    console.error('[AI Chat Error]', errorMsg)
    return NextResponse.json(
      { error: errorMsg },
      { status: axios.isAxiosError(err) ? err.response?.status ?? 500 : 500 },
    )
  }
}

function buildGeminiHistory(messages: ChatMessage[]) {
  const converted = messages.slice(0, -1).map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }))

  const merged = converted.reduce<typeof converted>((acc, message) => {
    const last = acc[acc.length - 1]
    if (last && last.role === message.role) {
      last.parts[0].text += `\n${message.parts[0].text}`
    } else {
      acc.push({ role: message.role, parts: [{ text: message.parts[0].text }] })
    }
    return acc
  }, [])

  while (merged.length > 0 && merged[0].role !== 'user') merged.shift()
  return merged
}

function buildStylePrompt(context: ChatContext): string {
  const widget = context.selectedWidget ?? {}
  return `You are a chart styling AI for Analytics AI Dashboard Builder.

Rules:
- Only modify visual style.
- Never change chart type, data source, field mappings, filters, or data-fetching logic.
- Do not output custom CSS.

Widget:
- Title: ${String(widget.title ?? '')}
- Type: ${String(widget.type ?? '')}
- X axis: ${String(widget.xAxis ?? '')}
- Y axis: ${String(widget.yAxis ?? '')}
- Current style: ${JSON.stringify(widget.currentStyle ?? {}, null, 2)}

Editable style fields:
- colors: hex color array
- tooltipBg: hex color
- tooltipBorder: hex color
- barRadius: integer from 0 to 48
- showLegend: boolean
- showGrid: boolean
- labelFormat: currency, percent, or number

When changing style, respond with one JSON block:
\`\`\`style
{
  "action": "update_style",
  "style": {
    "colors": ["#6366f1", "#8b5cf6", "#06b6d4"]
  },
  "description": "Changed colors to indigo, purple, and cyan."
}
\`\`\`

Only include fields that actually change.`
}

function buildCreatePrompt(context: ChatContext): string {
  const safeContext = {
    tenantId: context.tenantId ?? null,
    projectId: context.projectId ?? null,
    dashboardId: context.dashboardId ?? null,
    fields: Array.isArray(context.fields) ? context.fields.slice(0, 20) : [],
    existingWidgetCount: context.existingWidgetCount ?? 0,
    activeEndpointName: context.activeEndpointName ?? null,
    totalRows: context.totalRows ?? null,
  }

  return `You are an expert data visualization AI assistant for Analytics AI Dashboard Builder.

You may recommend chart widgets, but the app will validate your output before use.

When asked to create a chart/widget, respond with one JSON block:
\`\`\`widget
{
  "action": "create_widget",
  "title": "Widget title",
  "type": "bar|line|area|pie|donut|horizontal-bar|horizontal-stacked-bar|grouped-bar|drilldown-bar|gauge|ring-gauge|status-card|table",
  "xAxis": "field_name",
  "yAxis": "field_name",
  "description": "Why this chart was chosen"
}
\`\`\`

Dashboard context:
${JSON.stringify(safeContext, null, 2)}

Keep responses concise and reference actual field names when available.`
}
