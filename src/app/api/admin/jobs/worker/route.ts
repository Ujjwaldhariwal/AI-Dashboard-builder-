import { NextRequest, NextResponse } from 'next/server'

import {
  claimPlatformJobs,
  completePlatformJob,
  failPlatformJob,
} from '@/lib/jobs/platform-jobs'
import { runPlatformJob } from '@/lib/jobs/platform-job-runner'
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
  if (!Number.isFinite(parsed)) return 5
  return Math.min(25, Math.max(1, Math.trunc(parsed)))
}

export async function POST(req: NextRequest) {
  try {
    if (!workerSecret()) {
      return NextResponse.json({ processed: [], error: 'DASHBOARDOS_WORKER_SECRET is required' }, { status: 503 })
    }
    if (!isAuthorized(req)) {
      return NextResponse.json({ processed: [], error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const workerId = req.headers.get('x-dashboardos-worker-id') ?? `worker-${crypto.randomUUID()}`
    const claimed = await claimPlatformJobs({
      supabase,
      workerId,
      batchSize: batchSize(req),
    })

    const processed = []
    for (const job of claimed) {
      try {
        const run = await runPlatformJob(supabase, job)
        const completed = await completePlatformJob({
          supabase,
          jobId: job.id,
          result: run.result,
        })
        processed.push({ id: completed.id, jobType: completed.jobType, status: completed.status, result: completed.result })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const failed = await failPlatformJob({
          supabase,
          job,
          errorMessage: message,
        })
        processed.push({ id: failed.id, jobType: failed.jobType, status: failed.status, error: message })
      }
    }

    return NextResponse.json({ workerId, claimed: claimed.length, processed })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ processed: [], error: message }, { status: 500 })
  }
}
