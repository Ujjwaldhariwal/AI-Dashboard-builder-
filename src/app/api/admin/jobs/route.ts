import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  enqueuePlatformJob,
  listPlatformJobs,
  PLATFORM_JOB_STATUSES,
  PLATFORM_JOB_TARGET_TYPES,
  PLATFORM_JOB_TYPES,
} from '@/lib/jobs/platform-jobs'
import { accessContext, requireProjectAccess, requireTenantAccess } from '@/lib/security/project-access'
import { getAuthedSupabase } from '@/lib/supabase/server'

const JobTypeSchema = z.enum(PLATFORM_JOB_TYPES)
const JobStatusSchema = z.enum(PLATFORM_JOB_STATUSES)
const JobTargetTypeSchema = z.enum(PLATFORM_JOB_TARGET_TYPES)

const EnqueueJobSchema = z.object({
  tenantId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  jobType: JobTypeSchema,
  targetType: JobTargetTypeSchema.nullable().optional(),
  targetId: z.string().uuid().nullable().optional(),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
  runAfter: z.string().datetime().nullable().optional(),
  maxAttempts: z.coerce.number().int().min(1).max(25).default(3),
  dedupeKey: z.string().min(1).max(300).nullable().optional(),
  payload: z.record(z.unknown()).default({}),
}).strict()

function clampLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.min(200, Math.max(1, Math.trunc(parsed)))
}

async function requireJobAccess({
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
  if (!auth) return NextResponse.json({ jobs: [], error: 'Unauthorized' }, { status: 401 })

  const access = accessContext(auth)
  if (projectId) {
    const projectAccess = await requireProjectAccess({
      ...access,
      tenantId: tenantId ?? undefined,
      projectId,
      editor,
    })
    if (!projectAccess.ok) {
      return NextResponse.json({ jobs: [], error: projectAccess.error }, { status: projectAccess.status })
    }
  } else if (tenantId) {
    const tenantAccess = await requireTenantAccess({ ...access, tenantId, editor })
    if (!tenantAccess.ok) {
      return NextResponse.json({ jobs: [], error: tenantAccess.error }, { status: tenantAccess.status })
    }
  } else if (auth.role !== 'admin') {
    return NextResponse.json({ jobs: [], error: 'tenantId or projectId is required' }, { status: 400 })
  }

  return auth
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    const tenantId = req.nextUrl.searchParams.get('tenantId')
    const projectId = req.nextUrl.searchParams.get('projectId')
    const statusParam = req.nextUrl.searchParams.get('status')
    const jobTypeParam = req.nextUrl.searchParams.get('jobType')
    const status = statusParam && JobStatusSchema.safeParse(statusParam).success ? JobStatusSchema.parse(statusParam) : null
    const jobType = jobTypeParam && JobTypeSchema.safeParse(jobTypeParam).success ? JobTypeSchema.parse(jobTypeParam) : null
    const access = await requireJobAccess({ auth, tenantId, projectId })
    if (access instanceof Response) return access

    const jobs = await listPlatformJobs({
      supabase: access.supabase,
      tenantId,
      projectId,
      status,
      jobType,
      limit: clampLimit(req.nextUrl.searchParams.get('limit')),
    })

    return NextResponse.json({ jobs })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ jobs: [], error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ job: null, error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const parsed = EnqueueJobSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ job: null, error: parsed.error.flatten() }, { status: 400 })
    }

    const projectId = parsed.data.projectId ?? null
    const access = await requireJobAccess({
      auth,
      tenantId: parsed.data.tenantId,
      projectId,
      editor: true,
    })
    if (access instanceof Response) {
      const body = await access.json().catch(() => ({ error: 'Forbidden' }))
      return NextResponse.json({ job: null, error: body.error ?? 'Forbidden' }, { status: access.status })
    }

    const job = await enqueuePlatformJob({
      supabase: access.supabase,
      tenantId: parsed.data.tenantId,
      projectId,
      jobType: parsed.data.jobType,
      targetType: parsed.data.targetType ?? null,
      targetId: parsed.data.targetId ?? null,
      priority: parsed.data.priority,
      runAfter: parsed.data.runAfter ?? null,
      maxAttempts: parsed.data.maxAttempts,
      dedupeKey: parsed.data.dedupeKey ?? null,
      payload: parsed.data.payload,
      createdBy: access.userId,
    })

    return NextResponse.json({ job }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ job: null, error: message }, { status: 500 })
  }
}
