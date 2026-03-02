// Module: AI Chat API — Gemini 1.5 Flash + style/create modes
// src/app/api/ai/chat/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(req: NextRequest) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const { messages, context } = await req.json()

    const isStyleMode = !!context?.styleOnlyMode && !!context?.selectedWidget
    const systemPrompt = isStyleMode
      ? buildStylePrompt(context)
      : buildCreatePrompt(context)

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemPrompt,
    })

    const history = messages.slice(0, -1).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const lastMessage = messages[messages.length - 1]

    const chat    = model.startChat({ history })
    const result  = await chat.sendMessage(lastMessage.content)
    const content = result.response.text()

    // Parse widget creation block
    let widgetAction = null
    const widgetMatch = content.match(/```widget\n([\s\S]*?)\n```/)
    if (widgetMatch) {
      try { widgetAction = JSON.parse(widgetMatch[1]) } catch {}
    }

    // Parse style update block
    let styleAction = null
    const styleMatch = content.match(/```style\n([\s\S]*?)\n```/)
    if (styleMatch) {
      try {
        const parsed = JSON.parse(styleMatch[1])
        styleAction = {
          ...parsed,
          action:   'update_style',
          widgetId: context.selectedWidget?.id,
        }
      } catch {}
    }

    return NextResponse.json({ message: content, widgetAction, styleAction })
  } catch (err: any) {
    console.error('[AI Chat]', err)
    return NextResponse.json(
      { error: err.message ?? 'AI request failed' },
      { status: 500 },
    )
  }
}

// ── Style-only prompt — Layer 3 strictly ─────────────────────
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
- colors: string[]        — array of hex colors for chart elements
- tooltipBg: string       — tooltip background hex color
- tooltipBorder: string   — tooltip border hex color
- barRadius: number       — bar corner radius in px (bar/horizontal-bar only)
- showLegend: boolean     — show or hide the legend
- showGrid: boolean       — show or hide the grid lines
- labelFormat: string     — label format hint (e.g. "currency", "percent")
- customCSS: string       — extra CSS string for advanced overrides

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

Only include fields that actually change. Keep explanation brief.
Always show hex codes in your message so user can preview colors.`
}

// ── Widget creation prompt ────────────────────────────────────
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
