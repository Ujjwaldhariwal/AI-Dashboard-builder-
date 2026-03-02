// Module: AI Chat API — supports create_widget + update_style (Layer 3 only)
// src/app/api/ai/chat/route.ts

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { messages, context } = await req.json()

    const isStyleMode = !!context?.styleOnlyMode && !!context?.selectedWidget

    // ── System prompt switches based on mode ──────────────────────
    const systemPrompt = isStyleMode
      ? buildStylePrompt(context)
      : buildCreatePrompt(context)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 1024,
      temperature: 0.3,
    })

    const content = completion.choices[0]?.message?.content ?? ''

    // ── Parse widget creation block ────────────────────────────────
    let widgetAction = null
    const widgetMatch = content.match(/```widget\n([\s\S]*?)\n```/)
    if (widgetMatch) {
      try { widgetAction = JSON.parse(widgetMatch[1]) } catch {}
    }

    // ── Parse style update block ───────────────────────────────────
    let styleAction = null
    const styleMatch = content.match(/```style\n([\s\S]*?)\n```/)
    if (styleMatch) {
      try {
        const parsed = JSON.parse(styleMatch[1])
        // Enforce widgetId always comes from context, never from AI
        styleAction = {
          ...parsed,
          action:   'update_style',
          widgetId: context.selectedWidget.id, // locked — AI cannot override
        }
      } catch {}
    }

    return NextResponse.json({
      message: content,
      widgetAction,
      styleAction,
      usage: completion.usage,
    })
  } catch (err: any) {
    console.error('[AI Chat]', err)
    return NextResponse.json(
      { error: err.message ?? 'AI request failed' },
      { status: 500 },
    )
  }
}

// ── Style-only prompt — Layer 3 strictly ──────────────────────────
function buildStylePrompt(context: any): string {
  const w = context.selectedWidget
  return `You are a chart styling AI for Analytics AI Dashboard Builder.

STRICT RULES — you may ONLY modify visual style. Never change:
- The chart type
- The data source or endpoint
- The x/y axis field mappings
- Any data-fetching logic

You are styling this widget:
- Title: ${w.title}
- Type:  ${w.type}
- X axis: ${w.xAxis}
- Y axis: ${w.yAxis}
- Current style: ${JSON.stringify(w.currentStyle, null, 2)}

Editable style fields:
- colors: string[]          — array of hex colors for chart elements
- tooltipBg: string         — tooltip background hex color
- tooltipBorder: string     — tooltip border hex color
- barRadius: number         — bar corner radius in px (bar/horizontal-bar only)
- showLegend: boolean       — show or hide the legend
- showGrid: boolean         — show or hide the grid lines
- labelFormat: string       — label format hint (e.g. "currency", "percent")
- customCSS: string         — extra CSS string for advanced overrides

When the user asks to change a style property, respond with a \`\`\`style block:
\`\`\`style
{
  "action": "update_style",
  "style": {
    "colors": ["#6366f1", "#8b5cf6", "#06b6d4"]
  },
  "description": "Changed colors to indigo/purple/cyan palette"
}
\`\`\`

Only include fields that actually change. Keep your explanation brief.
Always show a color preview by listing hex codes in your message.`
}

// ── Widget creation prompt ─────────────────────────────────────────
function buildCreatePrompt(context: any): string {
  return `You are an expert data visualization AI assistant for Analytics AI Dashboard Builder.

You help users:
1. Create chart widgets from their API data
2. Understand their data fields and suggest the best chart types
3. Answer questions about their data analytically
4. Recommend chart configurations

When a user asks to CREATE a chart/widget, respond with a JSON block:
\`\`\`widget
{
  "action": "create_widget",
  "title": "Widget title",
  "type": "bar|line|area|pie|donut|horizontal-bar|gauge|status-card|table",
  "xAxis": "field_name",
  "yAxis": "field_name",
  "description": "Why this chart was chosen"
}
\`\`\`

Available chart types: bar, line, area, pie, donut, horizontal-bar, gauge, status-card, table

Dashboard context:
${context ? JSON.stringify(context, null, 2) : 'No data context provided yet.'}

Keep responses concise. When suggesting charts, always explain WHY.
Reference actual field names from the data context when available.`
}
