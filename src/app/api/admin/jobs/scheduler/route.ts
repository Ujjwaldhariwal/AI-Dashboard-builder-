import { NextRequest, NextResponse } from 'next/server'

import {
  claimPlatformJobSchedules,
  enqueueJobFromSchedule,
  markScheduleEnqueued,
  markScheduleError,
} from '@/lib/jobs/platform-job-schedules'
import { getServiceSupabase } from '@/lib/supabase/service'

function workerSecret() {
  return process.env.DASHBOARDOS_WORKER_SECRET ?? ''
}

function isAuthorized(req: NextRequest) {
  const secret = workerSecret()
  if (!secret) return false

  const headerSecret = req.headers.get('x-dashboardos-worker-secret')
  const auth = req.headers.get('authorization')
  const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
  return headerSecret === secret || bearer === secret
}

function batchSize(req: NextRequest) {
  const parsed = Number(req.nextUrl.searchParams.get('limit'))
  if (!Number.isFinite(parsed)) return 25
  return Math.min(50, Math.max(1, Math.trunc(parsed)))
}

export async function POST(req: NextRequest) {
  try {
    if (!workerSecret()) {
      return NextResponse.json({ enqueued: [], error: 'DASHBOARDOS_WORKER_SECRET is required' }, { status: 503 })
    }
    if (!isAuthorized(req)) {
      return NextResponse.json({ enqueued: [], error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const schedulerId = req.headers.get('x-dashboardos-worker-id') ?? `scheduler-${crypto.randomUUID()}`
    const schedules = await claimPlatformJobSchedules({
      supabase,
      schedulerId,
      batchSize: batchSize(req),
    })

    const enqueued = []
    for (const schedule of schedules) {
      try {
        const job = await enqueueJobFromSchedule({ supabase, schedule })
        await markScheduleEnqueued({ supabase, scheduleId: schedule.id, jobId: job.id })
        enqueued.push({ scheduleId: schedule.id, jobId: job.id, jobType: job.jobType, targetType: job.targetType, targetId: job.targetId })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await markScheduleError({ supabase, scheduleId: schedule.id, errorMessage: message })
        enqueued.push({ scheduleId: schedule.id, error: message })
      }
    }

    return NextResponse.json({ schedulerId, claimed: schedules.length, enqueued })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ enqueued: [], error: message }, { status: 500 })
  }
}
