import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  listPlatformJobSchedules,
  PLATFORM_JOB_SCHEDULE_TARGET_TYPES,
  PLATFORM_JOB_SCHEDULE_TYPES,
  upsertPlatformJobSchedule,
} from '@/lib/jobs/platform-job-schedules'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const ScheduleJobTypeSchema = z.enum(PLATFORM_JOB_SCHEDULE_TYPES)
const ScheduleTargetTypeSchema = z.enum(PLATFORM_JOB_SCHEDULE_TARGET_TYPES)

const UpsertScheduleSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  jobType: ScheduleJobTypeSchema,
  targetType: ScheduleTargetTypeSchema.nullable().optional(),
  targetId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().default(true),
  intervalMinutes: z.coerce.number().int().min(5).max(43200),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
  maxAttempts: z.coerce.number().int().min(1).max(25).default(3),
  nextRunAt: z.string().datetime().nullable().optional(),
  payload: z.record(z.unknown()).default({}),
}).strict()

function clampLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(200, Math.max(1, Math.trunc(parsed)))
}

async function requireScheduleAccess({
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
  if (!auth) return NextResponse.json({ schedules: [], error: 'Unauthorized' }, { status: 401 })

  const access = accessContext(auth)
  if (projectId) {
    const projectAccess = await requireProjectAccess({
      ...access,
      tenantId: tenantId ?? undefined,
      projectId,
      editor,
    })
    if (!projectAccess.ok) {
      return NextResponse.json({ schedules: [], error: projectAccess.error }, { status: projectAccess.status })
    }
  } else if (tenantId) {
    const tenantAccess = await requireTenantAccess({ ...access, tenantId, editor })
    if (!tenantAccess.ok) {
      return NextResponse.json({ schedules: [], error: tenantAccess.error }, { status: tenantAccess.status })
    }
  } else if (auth.role !== 'admin') {
    return NextResponse.json({ schedules: [], error: 'tenantId or projectId is required' }, { status: 400 })
  }

  return auth
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const jobTypeParam = req.nextUrl.searchParams.get('jobType')
    const enabledParam = req.nextUrl.searchParams.get('enabled')
    const jobType = jobTypeParam && ScheduleJobTypeSchema.safeParse(jobTypeParam).success ? ScheduleJobTypeSchema.parse(jobTypeParam) : null
    const enabled = enabledParam === 'true' ? true : enabledParam === 'false' ? false : null
    const access = await requireScheduleAccess({ auth, tenantId, projectId })
    if (access instanceof Response) return access

    const schedules = await listPlatformJobSchedules({
      supabase: access.supabase,
      tenantId,
      projectId,
      jobType,
      enabled,
      limit: clampLimit(req.nextUrl.searchParams.get('limit')),
    })

    return NextResponse.json({ schedules })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ schedules: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ schedule: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = UpsertScheduleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ schedule: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const projectId = parsed.data.projectId ?? null
    const access = await requireScheduleAccess({
      auth,
      tenantId: parsed.data.tenantId,
      projectId,
      editor: true,
    })
    if (access instanceof Response) {
      const body = await access.json().catch(() => ({ error: 'Forbidden' }))
      return NextResponse.json({ schedule: null, error: body.error ?? 'Forbidden' }, { status: access.status })
    }

    const schedule = await upsertPlatformJobSchedule({
      supabase: access.supabase,
      tenantId: parsed.data.tenantId,
      projectId,
      jobType: parsed.data.jobType,
      targetType: parsed.data.targetType ?? null,
      targetId: parsed.data.targetId ?? null,
      enabled: parsed.data.enabled,
      intervalMinutes: parsed.data.intervalMinutes,
      priority: parsed.data.priority,
      maxAttempts: parsed.data.maxAttempts,
      nextRunAt: parsed.data.nextRunAt ?? null,
      payload: parsed.data.payload,
      createdBy: access.userId,
    })

    return NextResponse.json({ schedule }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ schedule: null, error: message }, { status: 500 })
  }
}
