// Module: AI Chat API — Axios REST bypass + SSL corporate proxy fix
// src/app/api/ai/chat/route.ts

import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import https from 'https'

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json()

    const isStyleMode  = !!context?.styleOnlyMode && !!context?.selectedWidget
    const systemPrompt = isStyleMode
      ? buildStylePrompt(context)
      : buildCreatePrompt(context)

    const history     = buildGeminiHistory(messages)
    const lastMessage = messages[messages.length - 1]
    history.push({ role: 'user', parts: [{ text: lastMessage.content }] })

    const apiKey = process.env.GEMINI_API_KEY!
    const url    = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

    // ✅ FIX: Only bypass SSL on local dev (corporate proxy at Infinite Computer Solutions).
    // In production (Vercel/cloud), NODE_ENV === 'production' so rejectUnauthorized = true (secure).
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

    const data    = response.data
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // ✅ FIX: Correct regex literals — \n and [\s\S] inside /regex/ are NOT escaped
    let widgetAction = null
    const widgetMatch = content.match(/```widget\n([\s\S]*?)\n```/)
    if (widgetMatch) {
      try { widgetAction = JSON.parse(widgetMatch[1]) } catch {}
    }

    let styleAction = null
    const styleMatch = content.match(/```style\n([\s\S]*?)\n```/)
    if (styleMatch) {
      try {
        const parsed = JSON.parse(styleMatch[1])
        // Security: widgetId always injected server-side — AI cannot override
        styleAction = {
          ...parsed,
          action:   'update_style',
          widgetId: context.selectedWidget?.id,
        }
      } catch {}
    }

    return NextResponse.json({ message: content, widgetAction, styleAction })

  } catch (err: any) {
    const errorMsg =
      err.response?.data?.error?.message ?? err.message ?? 'AI request failed'
    console.error('[AI Chat Error]', errorMsg)
    return NextResponse.json(
      { error: errorMsg },
      { status: err.response?.status ?? 500 },
    )
  }
}

// ── Bulletproof Gemini history builder ───────────────────────
function buildGeminiHistory(messages: any[]) {
  const raw = messages.slice(0, -1)

  const converted = raw.map((m: any) => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content ?? '') }],
  }))

  // Merge consecutive same-role messages (Gemini API requirement)
  const merged = converted.reduce((acc: any[], m: any) => {
    const last = acc[acc.length - 1]
    if (last && last.role === m.role) {
      last.parts[0].text += '\n' + m.parts[0].text
    } else {
      acc.push({ role: m.role, parts: [{ text: m.parts[0].text }] })
    }
    return acc
  }, [])

  // Strip leading model messages (Gemini requires history starts with user)
  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift()
  }

  // Final alternating pass (safety net for edge cases)
  const alternating: any[] = []
  for (const m of merged) {
    const last = alternating[alternating.length - 1]
    if (last && last.role === m.role) {
      last.parts[0].text += '\n' + m.parts[0].text
    } else {
      alternating.push(m)
    }
  }

  if (alternating.length === 1 && alternating[0].role === 'model') return []
  return alternating
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
- colors: string[]       — array of hex colors for chart elements
- tooltipBg: string      — tooltip background hex color
- tooltipBorder: string  — tooltip border hex color
- barRadius: number      — bar corner radius in px (bar/horizontal-bar only)
- showLegend: boolean    — show or hide the legend
- showGrid: boolean      — show or hide the grid lines
- labelFormat: string    — label format hint ("currency", "percent", "number")
- customCSS: string      — extra CSS string for advanced overrides

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
Always show hex codes in your message so the user can preview the colors.`
}

// ── Widget creation prompt ────────────────────────────────────
function buildCreatePrompt(context: any): string {
  // Guard: cap fields to top 20 to prevent token bloat on wide API schemas
  const safeContext = context
    ? {
        ...context,
        fields: Array.isArray(context.fields)
          ? context.fields.slice(0, 20)
          : context.fields,
      }
    : null

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
${safeContext ? JSON.stringify(safeContext, null, 2) : 'No data context provided yet.'}

Keep responses concise. When suggesting charts, always explain WHY.
Reference actual field names from the data context when available.`
}
