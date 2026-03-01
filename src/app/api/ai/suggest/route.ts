import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { fields, sampleData, endpointName } = await req.json()

    const prompt = `You are a data visualization expert. Given this API data schema, suggest the best charts.

Endpoint: ${endpointName}
Fields detected: ${JSON.stringify(fields, null, 2)}
Sample data (3 rows): ${JSON.stringify(sampleData?.slice(0, 3), null, 2)}

Respond with ONLY a valid JSON object in this exact shape, no prose:
{
  "suggestions": [
    {
      "title": "Human readable chart title",
      "type": "bar|line|area|pie|donut|horizontal-bar|gauge|status-card|table",
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

    const raw        = completion.choices[0]?.message?.content ?? '{}'
    const parsed     = JSON.parse(raw)
    const suggestions = Array.isArray(parsed)
      ? parsed
      : parsed.suggestions ?? parsed.charts ?? []

    return NextResponse.json({ suggestions })
  } catch (err: any) {
    console.error('[AI Suggest]', err)
    return NextResponse.json({ suggestions: [], error: err.message }, { status: 500 })
  }
}
