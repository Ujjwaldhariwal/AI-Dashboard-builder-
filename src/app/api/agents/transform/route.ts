import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateObject } from 'ai'
import { z } from 'zod'
import { TransformOpSchema } from '@/lib/ai/agent-schemas'
import { getGoogleModel } from '@/lib/ai/google-model'
import { getSupabaseAnonKey, SUPABASE_URL } from '@/lib/supabase/config'

const MAX_BLUEPRINT_FETCH_ROWS = 12
const MAX_BLUEPRINT_CONTEXT_CHARS = 9_000
const MAX_SAMPLE_ROWS_FOR_PROMPT = 20
const MAX_SAMPLE_PREVIEW_CHARS = 12_000
const MAX_BLUEPRINT_TRANSFORMS_PER_ITEM = 24

const TransformAgentRequestSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  sampleData: z.array(z.unknown()),
  dashboardId: z.string().optional(),
  endpointId: z.string().optional(),
  endpointName: z.string().optional(),
}).strict()

const TransformAgentResponseSchema = z.object({
  operations: z.array(TransformOpSchema),
}).strict()

interface StoredTransformBlueprint {
  endpointId?: string
  endpointName: string
  dashboardId?: string
  prompt?: string
  transforms: z.infer<typeof TransformOpSchema>[]
  createdAt?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n...`
}

function parseStoredBlueprint(row: unknown): StoredTransformBlueprint | null {
  const record = asRecord(row)
  if (!record) return null

  const transformsValue = record.transforms ?? record.operations
  const parsedTransforms = z.array(TransformOpSchema).safeParse(transformsValue)
  if (!parsedTransforms.success || parsedTransforms.data.length === 0) {
    return null
  }

  return {
    endpointId: asTrimmedString(record.endpoint_id) ?? asTrimmedString(record.endpointId),
    endpointName:
      asTrimmedString(record.endpoint_name)
      ?? asTrimmedString(record.endpointName)
      ?? 'Saved Blueprint',
    dashboardId: asTrimmedString(record.dashboard_id) ?? asTrimmedString(record.dashboardId),
    prompt: asTrimmedString(record.prompt),
    transforms: parsedTransforms.data,
    createdAt: asTrimmedString(record.created_at) ?? asTrimmedString(record.createdAt),
  }
}

async function getAuthedSupabase(): Promise<{
  supabase: SupabaseClient
  userId: string
} | null> {
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
  const userId = session?.user?.id
  if (!userId) return null

  return { supabase, userId }
}

async function fetchBlueprintMemoryContext(
  supabase: SupabaseClient,
  userId: string,
  input: {
    dashboardId?: string
    endpointId?: string
    endpointName?: string
  },
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('transform_blueprints')
      .select('endpoint_id, endpoint_name, dashboard_id, prompt, transforms, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_BLUEPRINT_FETCH_ROWS)

    if (error) {
      console.warn('[Agents Transform] blueprint lookup skipped:', error.message)
      return ''
    }

    const targetDashboardId = input.dashboardId?.trim()
    const targetEndpointId = input.endpointId?.trim()
    const targetEndpointName = input.endpointName?.trim().toLowerCase()

    const blueprints = (data ?? [])
      .map(parseStoredBlueprint)
      .filter((value): value is StoredTransformBlueprint => Boolean(value))
      .filter(blueprint => {
        if (!targetDashboardId) return true
        if (!blueprint.dashboardId) return true
        return blueprint.dashboardId === targetDashboardId
      })
      .map(blueprint => {
        let score = 0
        if (targetEndpointId && blueprint.endpointId === targetEndpointId) score += 4
        if (
          targetEndpointName
          && blueprint.endpointName.toLowerCase().includes(targetEndpointName)
        ) {
          score += 3
        }
        if (targetDashboardId && blueprint.dashboardId === targetDashboardId) score += 2
        if (blueprint.prompt) score += 1
        return { blueprint, score }
      })
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score
        const leftTs = Date.parse(left.blueprint.createdAt ?? '')
        const rightTs = Date.parse(right.blueprint.createdAt ?? '')
        const leftSafe = Number.isFinite(leftTs) ? leftTs : 0
        const rightSafe = Number.isFinite(rightTs) ? rightTs : 0
        return rightSafe - leftSafe
      })
      .slice(0, 4)
      .map(item => item.blueprint)

    if (blueprints.length === 0) return ''

    const memoryContext = blueprints.map((blueprint, index) => {
      const promptLine = blueprint.prompt
        ? `Goal: ${blueprint.prompt}`
        : 'Goal: N/A'
      const endpointLine = `Endpoint: ${blueprint.endpointName}`
      const transformsLine = `Transforms: ${JSON.stringify(
        blueprint.transforms.slice(0, MAX_BLUEPRINT_TRANSFORMS_PER_ITEM),
      )}`
      return `Blueprint ${index + 1}\n${endpointLine}\n${promptLine}\n${transformsLine}`
    }).join('\n\n')

    return clampText(memoryContext, MAX_BLUEPRINT_CONTEXT_CHARS)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[Agents Transform] blueprint memory error:', message)
    return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) {
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

    const { prompt, sampleData, dashboardId, endpointId, endpointName } = parsed.data
    const rawSamplePreview = JSON.stringify(
      sampleData.slice(0, MAX_SAMPLE_ROWS_FOR_PROMPT),
      null,
      2,
    )
    const samplePreview = clampText(rawSamplePreview, MAX_SAMPLE_PREVIEW_CHARS)
    const blueprintMemory = await fetchBlueprintMemoryContext(auth.supabase, auth.userId, {
      dashboardId,
      endpointId,
      endpointName,
    })
    const memorySection = blueprintMemory.length > 0
      ? `Reusable blueprint memory:\n${blueprintMemory}`
      : 'Reusable blueprint memory: none'

    const result = await generateObject({
      model: getGoogleModel('gemini-2.5-flash'),
      schema: TransformAgentResponseSchema,
      system: `You are a data transformation planner for dashboard charts.

Return only valid JSON matching the provided schema.

Rules:
- Output an ordered "operations" array of TransformOp objects.
- Use only these operation types:
  parse_number, concat, rename, math, percent_of_total, filter_rows, sort, limit, fields_to_rows, group_aggregate, map_values, date_format.
- Use exact field names from sample data when possible.
- Keep operations minimal and deterministic.
- Never include extra keys outside the schema.
- Never return prose.
- If memory blueprints are relevant, adapt them before adding new operations.`,
      prompt: `User goal:
${prompt}

${memorySection}

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
