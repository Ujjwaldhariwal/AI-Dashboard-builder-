import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// ✅ No top-level instantiation — won't crash at build time
export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const { messages, context } = await req.json()

    const systemPrompt = `You are an expert data visualization AI assistant for Analytics AI Dashboard Builder.

You help users:
1. Create chart widgets from their API data
2. Understand their data fields and suggest the best chart types
3. Answer questions about their data analytically
4. Recommend chart configurations

When a user asks to CREATE a chart/widget, respond with a JSON block like this:
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

Context about current dashboard data:
${context ? JSON.stringify(context, null, 2) : 'No data context provided yet.'}

Keep responses concise and actionable. When suggesting charts, always explain WHY.
If the user's data context is provided, reference actual field names from it.`

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

    const widgetMatch = content.match(/```widget\n([\s\S]*?)\n```/)
    let widgetAction = null
    if (widgetMatch) {
      try { widgetAction = JSON.parse(widgetMatch[1]) } catch {}
    }

    return NextResponse.json({
      message: content,
      widgetAction,
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
