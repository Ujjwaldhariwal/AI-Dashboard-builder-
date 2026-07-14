import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  listPlatformAlertChannels,
  upsertPlatformAlertChannel,
} from '@/lib/alerts/alert-delivery'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const ChannelTypeSchema = z.enum(['webhook', 'email'])
const SeveritySchema = z.enum(['info', 'warning', 'critical'])

const UpsertChannelSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(160),
  channelType: ChannelTypeSchema,
  enabled: z.boolean().default(true),
  severityMin: SeveritySchema.default('warning'),
  config: z.record(z.unknown()).default({}),
}).strict()

function clampLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(200, Math.max(1, Math.trunc(parsed)))
}

async function requireChannelAccess({
  auth,
  tenantId,
  projectId,
  editor = false,
}: {
  auth: Awaited<ReturnType<typeof getAuthedSupabase>>
  tenantId: string | null
  projectId: string | null
  editor?: boolean
}) {
  if (!auth) return NextResponse.json({ channels: [], error: 'Unauthorized' }, { status: 401 })

  const access = accessContext(auth)
  if (projectId) {
    const projectAccess = await requireProjectAccess({
      ...access,
      tenantId: tenantId ?? undefined,
      projectId,
      editor,
    })
    if (!projectAccess.ok) {
      return NextResponse.json({ channels: [], error: projectAccess.error }, { status: projectAccess.status })
    }
  } else if (tenantId) {
    const tenantAccess = await requireTenantAccess({ ...access, tenantId, editor })
    if (!tenantAccess.ok) {
      return NextResponse.json({ channels: [], error: tenantAccess.error }, { status: tenantAccess.status })
    }
  } else if (auth.role !== 'admin') {
    return NextResponse.json({ channels: [], error: 'tenantId or projectId is required' }, { status: 400 })
  }

  return auth
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const enabledParam = req.nextUrl.searchParams.get('enabled')
    const enabled = enabledParam === 'true' ? true : enabledParam === 'false' ? false : null
    const access = await requireChannelAccess({ auth, tenantId, projectId })
    if (access instanceof Response) return access

    const channels = await listPlatformAlertChannels({
      supabase: access.supabase,
      tenantId,
      projectId,
      enabled,
      limit: clampLimit(req.nextUrl.searchParams.get('limit')),
    })

    return NextResponse.json({ channels })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ channels: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ channel: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = UpsertChannelSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ channel: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const projectId = parsed.data.projectId ?? null
    const access = await requireChannelAccess({
      auth,
      tenantId: parsed.data.tenantId,
      projectId,
      editor: true,
    })
    if (access instanceof Response) {
      const body = await access.json().catch(() => ({ error: 'Forbidden' }))
      return NextResponse.json({ channel: null, error: body.error ?? 'Forbidden' }, { status: access.status })
    }

    const channel = await upsertPlatformAlertChannel({
      supabase: access.supabase,
      tenantId: parsed.data.tenantId,
      projectId,
      name: parsed.data.name,
      channelType: parsed.data.channelType,
      enabled: parsed.data.enabled,
      severityMin: parsed.data.severityMin,
      config: parsed.data.config,
      createdBy: access.userId,
    })

    return NextResponse.json({ channel }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ channel: null, error: message }, { status: 500 })
  }
}
